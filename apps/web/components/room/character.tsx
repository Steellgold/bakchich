"use client";

import type { Vec2 } from "@tribunal/bot/room/layout";
import type { BufferGeometry, Group, Texture } from "three";
import { INK } from "./courtroom";
import { Html, Outlines } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import { SRGBColorSpace, TextureLoader } from "three";

type CharacterProps = {
  id: string;
  name: string;
  avatarUrl: string | null;
  position: Vec2;
  rotation: number;
  seated: boolean;
  /** Bent legs resting over the front edge of a public bench. */
  onBench?: boolean;
  speech: string | null;
  color?: string;
  /** Vertical offset for raised positions such as the judge's chair. */
  elevation?: number;
  /** Judge's powdered wig */
  wig?: boolean;
  /** The member is talking: the arms gesture */
  speaking?: boolean;
  /** Smoothly follow the given position (remote players) instead of jumping to it */
  interpolate?: boolean;
  /** Position read every frame (local player prediction), overriding `position` */
  follow?: { current: Vec2 };
};

// Discord avatar for the lapel badge; the sculpted face stays visible for every member.
const useAvatarTexture = (url: string | null) => {
  const [texture, setTexture] = useState<Texture | null>(null);

  useEffect(() => {
    if (url === null) return;
    const loader = new TextureLoader();
    loader.setCrossOrigin("anonymous");
    let cancelled = false;
    let loadedTexture: Texture | null = null;
    loader.load(url, (loaded) => {
      if (cancelled) {
        loaded.dispose();
        return;
      }
      loaded.colorSpace = SRGBColorSpace;
      loadedTexture = loaded;
      setTexture(loaded);
    });
    return () => {
      cancelled = true;
      loadedTexture?.dispose();
    };
  }, [url]);

  return texture;
};

const skinTones = [
  { skin: "#ffd1a1", nose: "#edac7d" },
  { skin: "#efb88d", nose: "#d68d65" },
  { skin: "#d6986a", nose: "#b9714e" },
  { skin: "#b97953", nose: "#93533b" },
  { skin: "#8d563f", nose: "#703b32" },
  { skin: "#6e4538", nose: "#533128" },
] as const;
const hairColors = ["#4a2c26", "#85512e", "#d8a254", "#b75f38", "#3a3547", "#b2a6a6"];
const accentColors = ["#8e5bff", "#c85f86", "#5ba5a5", "#daaa49", "#7e84d1", "#b66b47"];
const robeColors = [
  { robe: "#272030", shoulders: "#35263d" },
  { robe: "#22343d", shoulders: "#304851" },
  { robe: "#342b3f", shoulders: "#48334c" },
  { robe: "#3d2a2b", shoulders: "#54363c" },
] as const;

type HairPart = { position: [number, number, number]; scale: [number, number, number]; tilt?: number };

// Swept quiff, curls, long bob and a receding crown, all within the same head envelope.
const hairStyles: HairPart[][] = [
  [
    { position: [-0.055, 0.22, 0.14], scale: [0.27, 0.14, 0.18], tilt: -0.28 },
    { position: [0.19, 0.16, 0.055], scale: [0.12, 0.19, 0.17], tilt: 0.35 },
    { position: [0, 0.035, -0.18], scale: [0.28, 0.26, 0.15] },
  ],
  [-2, -1, 0, 1, 2].map((curl) => ({ position: [curl * 0.105, 0.31 - Math.abs(curl) * 0.045, 0.12], scale: [0.115, 0.115, 0.14] })),
  [
    { position: [-0.25, -0.04, -0.045], scale: [0.1, 0.31, 0.2] },
    { position: [0.25, -0.04, -0.045], scale: [0.1, 0.31, 0.2] },
    { position: [0, -0.05, -0.14], scale: [0.29, 0.32, 0.1] },
    { position: [0, 0.03, -0.175], scale: [0.285, 0.22, 0.133] },
    { position: [0, 0.17, 0.19], scale: [0.25, 0.08, 0.1] },
  ],
  [
    { position: [-0.25, 0.025, -0.06], scale: [0.07, 0.15, 0.19] },
    { position: [0.25, 0.025, -0.06], scale: [0.07, 0.15, 0.19] },
    { position: [0, 0.08, -0.2], scale: [0.25, 0.17, 0.12] },
  ],
];

// Stable member IDs keep appearances identical across clients and display-name changes.
const appearanceOf = (id: string) => {
  let hash = 2_166_136_261;
  for (let index = 0; index < id.length; index += 1) hash = Math.imul(hash ^ id.charCodeAt(index), 16_777_619);
  hash >>>= 0;
  return {
    ...(skinTones[hash % skinTones.length] ?? skinTones[0]),
    ...(robeColors[(hash >>> 16) % robeColors.length] ?? robeColors[0]),
    hair: hairColors[(hash >>> 4) % hairColors.length] ?? "#4a2c26",
    accent: accentColors[(hash >>> 12) % accentColors.length] ?? "#8e5bff",
    style: (hash >>> 8) % hairStyles.length,
  };
};

const facetGeometry = (geometry: BufferGeometry) => {
  if (geometry.index !== null) {
    const faces = geometry.toNonIndexed();
    geometry.copy(faces);
    faces.dispose();
  }
  geometry.computeVertexNormals();
};

type ArmPose = { x: number; outward: number; wobble?: number };
type Gesture = { left: ArmPose; right: ArmPose };

const IDLE: ArmPose = { x: 0, outward: 0.07 };

// Gestures an arm can make while talking, x raises it forward and outward spreads it from the body:
const gestures: Record<string, Gesture> = {
  explain: { left: IDLE, right: { x: -1.3, outward: 0.35, wobble: 0.25 } },
  open: { left: { x: -0.7, outward: 0.9, wobble: 0.1 }, right: { x: -0.7, outward: 0.9, wobble: 0.1 } },
  point: { left: IDLE, right: { x: -1.5, outward: 0.1, wobble: 0.05 } },
  cross: { left: { x: -1.1, outward: -0.75, wobble: 0.04 }, right: { x: -1.1, outward: -0.75, wobble: 0.04 } },
  chop: { left: IDLE, right: { x: -1, outward: 0.2, wobble: 0.45 } },
  emphasis: { left: { x: -1, outward: 0.5, wobble: 0.3 }, right: { x: -1, outward: 0.5, wobble: 0.3 } },
};

// Each member talks with one pack of gestures, picked from their appearance:
const gesturePacks: Gesture[][] = [
  [gestures.explain, gestures.open, gestures.point],
  [gestures.cross, gestures.explain, gestures.emphasis],
  [gestures.chop, gestures.emphasis, gestures.open, gestures.point],
  [gestures.open, gestures.cross, gestures.chop],
].map((pack) => pack.filter((gesture): gesture is Gesture => gesture !== undefined));

const GESTURE_SECONDS = 2.4;

/** Robed low-poly member with a stable appearance, a white jabot and a Discord lapel badge. */
export const Character = ({ id, name, avatarUrl, position, rotation, seated, onBench = false, speech, color, elevation = 0, wig = false, speaking = false, interpolate = false, follow }: CharacterProps) => {
  const groupRef = useRef<Group>(null);
  const leftArmRef = useRef<Group>(null);
  const rightArmRef = useRef<Group>(null);
  const texture = useAvatarTexture(avatarUrl);
  const height = seated ? 0.45 : 0.9;
  const headY = height + (seated ? 0.55 : 0.8);
  // The seated robe bottoms out at 0.19 m; the public bench seat is at 0.5 m.
  const baseY = onBench ? 0.31 : elevation;

  const appearanceOfMember = wig ? undefined : appearanceOf(id);
  const pack = gesturePacks[(wig ? 0 : appearanceOfMember?.style ?? 0) % gesturePacks.length] ?? [];
  // Seated members rest their hands forward, standing ones let their arms hang:
  const restX = seated ? -0.9 : 0;

  useFrame((state) => {
    const current = groupRef.current;
    if (current === null) return;
    const target = follow?.current ?? position;
    const factor = interpolate ? 0.25 : 1;
    current.position.x += (target.x - current.position.x) * factor;
    current.position.z += (target.z - current.position.z) * factor;
    current.rotation.y = rotation;

    const time = state.clock.elapsedTime;
    const gesture = speaking ? pack[Math.floor(time / GESTURE_SECONDS + id.length) % pack.length] : undefined;
    for (const [index, arm] of [leftArmRef.current, rightArmRef.current].entries()) {
      if (arm === null) continue;
      const side = index === 0 ? -1 : 1;
      const pose = gesture === undefined ? { ...IDLE, x: restX } : (index === 0 ? gesture.left : gesture.right);
      const wobble = pose.wobble ?? 0;
      arm.rotation.x += (pose.x + Math.sin(time * 5 + index) * wobble - arm.rotation.x) * 0.15;
      arm.rotation.z += (side * (pose.outward + Math.cos(time * 4 + index) * wobble * 0.5) - arm.rotation.z) * 0.15;
    }
  });

  const appearance = wig ? { skin: "#ffd1a1", nose: "#f5b485", robe: "#272030", shoulders: "#35263d", hair: "#fff9ee", accent: "#8e5bff", style: 0 } : appearanceOf(id);
  const skin = appearance.skin;
  const accent = color ?? appearance.accent;
  const outline = <Outlines thickness={0.018} color={INK} />;

  return (
    <group ref={groupRef} position={[position.x, baseY, position.z]}>
      {!seated && [-0.13, 0.13].map((x) => (
        <mesh key={x} position={[x, 0.23, 0]} castShadow>
          <boxGeometry args={[0.17, 0.46, 0.24]} />
          <meshToonMaterial color="#3b2a5a" />
          {outline}
        </mesh>
      ))}
      {seated && onBench && [-0.13, 0.13].map((x) => (
        <group key={x}>
          <mesh position={[x, 0.26, 0.17]} castShadow>
            <boxGeometry args={[0.145, 0.14, 0.42]} />
            <meshToonMaterial color={appearance.robe} />
            {outline}
          </mesh>
          <mesh position={[x, -0.02, 0.39]} castShadow>
            <boxGeometry args={[0.115, 0.46, 0.14]} />
            <meshToonMaterial color={appearance.robe} />
            {outline}
          </mesh>
          <mesh position={[x, -0.25, 0.43]} castShadow>
            <boxGeometry args={[0.17, 0.12, 0.22]} />
            <meshToonMaterial color={INK} />
            {outline}
          </mesh>
        </group>
      ))}
      <mesh position={[0, height, 0]} scale-z={0.65} castShadow>
        <cylinderGeometry onUpdate={facetGeometry} args={[0.3, 0.38, seated ? 0.52 : 0.95, 8]} />
        <meshToonMaterial color={appearance.robe} />
        {outline}
      </mesh>
      <mesh position={[0, headY - 0.36, 0]} scale={[0.43, 0.13, 0.24]} castShadow>
        <icosahedronGeometry onUpdate={facetGeometry} args={[1, 1]} />
        <meshToonMaterial color={appearance.shoulders} />
        {outline}
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side} ref={side === -1 ? leftArmRef : rightArmRef} position={[side * 0.3, height + (seated ? 0.22 : 0.3), 0]} rotation={[restX, 0, side * 0.07]}>
          <mesh position={[0, seated ? -0.18 : -0.3, 0]} castShadow>
            <cylinderGeometry onUpdate={facetGeometry} args={[0.14, 0.11, seated ? 0.36 : 0.6, 6]} />
            <meshToonMaterial color={appearance.robe} />
            {outline}
          </mesh>
          <mesh position={[0, seated ? -0.38 : -0.62, 0]} castShadow>
            <icosahedronGeometry onUpdate={facetGeometry} args={[0.08, 1]} />
            <meshToonMaterial color={skin} />
            {outline}
          </mesh>
        </group>
      ))}
      <mesh position={[0, headY - 0.28, 0]}>
        <cylinderGeometry onUpdate={facetGeometry} args={[0.09, 0.1, 0.18, 8]} />
        <meshToonMaterial color={skin} />
      </mesh>
      <mesh position={[0, headY - 0.34, 0]} scale-z={0.65}>
        <cylinderGeometry onUpdate={facetGeometry} args={[0.16, 0.25, 0.16, 6]} />
        <meshToonMaterial color={accent} />
        {outline}
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.055, headY - 0.49, 0.23]} rotation-z={side * 0.06}>
          <boxGeometry args={[0.085, 0.22, 0.035]} />
          <meshToonMaterial color="#fff9ee" />
          {outline}
        </mesh>
      ))}
      <mesh position={[0, headY, 0]} scale={[0.91, 1.06, 0.88]} castShadow>
        <sphereGeometry onUpdate={facetGeometry} args={[0.31, 12, 8]} />
        <meshToonMaterial color={skin} />
        {outline}
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * 0.27, headY - 0.015, 0]} scale={[0.75, 1, 0.65]}>
            <icosahedronGeometry onUpdate={facetGeometry} args={[0.075, 1]} />
            <meshToonMaterial color={skin} />
          </mesh>
          <mesh position={[side * 0.105, headY + 0.025, 0.251]} scale={[1, 1.2, 0.45]}>
            <sphereGeometry onUpdate={facetGeometry} args={[0.026, 8, 6]} />
            <meshBasicMaterial color={INK} />
          </mesh>
          <mesh position={[side * 0.105, headY + 0.105, 0.237]} rotation-z={-side * 0.1}>
            <boxGeometry args={[0.075, 0.019, 0.018]} />
            <meshBasicMaterial color={wig ? "#603c32" : appearance.hair} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, headY - 0.045, 0.267]} scale={[0.035, 0.045, 0.045]}>
        <icosahedronGeometry onUpdate={facetGeometry} args={[1, 0]} />
        <meshToonMaterial color={appearance.nose} />
      </mesh>
      <mesh position={[0, headY - 0.115, 0.252]} rotation-z={Math.PI} scale-y={0.6}>
        <torusGeometry args={[0.06, 0.009, 3, 10, Math.PI]} />
        <meshBasicMaterial color={INK} />
      </mesh>
      <mesh position={[-0.19, height + 0.04, 0.26]}>
        <circleGeometry args={[0.085, 12]} />
        <meshToonMaterial color={accent} />
      </mesh>
      {texture !== null && (
        <mesh position={[-0.19, height + 0.04, 0.263]}>
          <circleGeometry args={[0.068, 16]} />
          <meshBasicMaterial map={texture} />
        </mesh>
      )}
      {(wig || appearance.style !== 3) && (
        <mesh position={[0, headY + 0.04, -0.025]} scale={[0.96, 1, 0.94]} castShadow>
          <sphereGeometry onUpdate={facetGeometry} args={[0.33, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.43]} />
          <meshToonMaterial color={appearance.hair} />
          {outline}
        </mesh>
      )}
      {wig ? [-1, 1].flatMap((side) => [0.1, -0.06, -0.22].map((offset) => (
        <group key={`${String(side)}:${String(offset)}`} position={[side * 0.28, headY + offset, -0.015]}>
          <mesh rotation-x={Math.PI / 2} castShadow>
            <cylinderGeometry onUpdate={facetGeometry} args={[0.085, 0.085, 0.19, 8]} />
            <meshToonMaterial color="#fff9ee" />
            {outline}
          </mesh>
          <mesh position={[0, 0, 0.085]}>
            <torusGeometry args={[0.045, 0.012, 3, 8]} />
            <meshToonMaterial color="#d8cbd3" />
          </mesh>
        </group>
      ))) : (hairStyles[appearance.style] ?? []).map((part) => (
        <mesh key={part.position.join(":")} position={[part.position[0], headY + part.position[1], part.position[2]]} rotation-z={part.tilt ?? 0} scale={part.scale} castShadow>
          <icosahedronGeometry onUpdate={facetGeometry} args={[1, 1]} />
          <meshToonMaterial color={appearance.hair} />
          {outline}
        </mesh>
      ))}
      <Html position={[0, height + 1.5, 0]} center distanceFactor={10}>
        <div className="tag">
          {speech !== null && <div className="bubble">{speech}</div>}
          <div className="name">{name}</div>
        </div>
      </Html>
    </group>
  );
};
