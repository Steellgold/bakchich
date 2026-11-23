"use client";

import type { Vec2 } from "@tribunal/bot/room/layout";
import type { BufferGeometry, Group, Texture } from "three";
import { INK } from "./courtroom";
import { Html, Outlines } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import { SRGBColorSpace, TextureLoader } from "three";

type CharacterProps = {
  name: string;
  avatarUrl: string | null;
  position: Vec2;
  rotation: number;
  seated: boolean;
  speech: string | null;
  color?: string;
  /** Height of the floor under the character (the judge sits on his stand) */
  elevation?: number;
  /** Judge's powdered wig */
  wig?: boolean;
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

const BODY_COLORS = ["#8e5bff", "#a478ce", "#7c5dbd", "#9462ab", "#b388ff", "#9658ba", "#7e68bd"];

// Same name, same color on every client:
const colorOf = (name: string) => {
  let sum = 0;
  for (let index = 0; index < name.length; index += 1) sum += name.charCodeAt(index);
  return BODY_COLORS[sum % BODY_COLORS.length] ?? "#8e5bff";
};

const facetGeometry = (geometry: BufferGeometry) => {
  if (geometry.index !== null) {
    const faces = geometry.toNonIndexed();
    geometry.copy(faces);
    faces.dispose();
  }
  geometry.computeVertexNormals();
};

/** Robed low-poly member with swept hair, a white jabot and a Discord lapel badge. */
export const Character = ({ name, avatarUrl, position, rotation, seated, speech, color, elevation = 0, wig = false, interpolate = false, follow }: CharacterProps) => {
  const groupRef = useRef<Group>(null);
  const texture = useAvatarTexture(avatarUrl);
  const height = seated ? 0.45 : 0.9;
  const headY = height + (seated ? 0.55 : 0.8);

  useFrame(() => {
    const current = groupRef.current;
    if (current === null) return;
    const target = follow?.current ?? position;
    const factor = interpolate ? 0.25 : 1;
    current.position.x += (target.x - current.position.x) * factor;
    current.position.z += (target.z - current.position.z) * factor;
    current.rotation.y = rotation;
  });

  const skin = "#ffd1a1";
  const accent = color ?? colorOf(name);
  const outline = <Outlines thickness={0.018} color={INK} />;

  return (
    <group ref={groupRef} position={[position.x, elevation, position.z]}>
      {!seated && [-0.13, 0.13].map((x) => (
        <mesh key={x} position={[x, 0.23, 0]} castShadow>
          <boxGeometry args={[0.17, 0.46, 0.24]} />
          <meshToonMaterial color="#3b2a5a" />
          {outline}
        </mesh>
      ))}
      <mesh position={[0, height, 0]} scale-z={0.65} castShadow>
        <cylinderGeometry onUpdate={facetGeometry} args={[0.3, 0.38, seated ? 0.52 : 0.95, 8]} />
        <meshToonMaterial color="#272030" />
        {outline}
      </mesh>
      <mesh position={[0, headY - 0.36, 0]} scale={[0.43, 0.13, 0.24]} castShadow>
        <icosahedronGeometry onUpdate={facetGeometry} args={[1, 1]} />
        <meshToonMaterial color="#35263d" />
        {outline}
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * 0.3, height + 0.04, 0]} rotation-z={-side * 0.12} castShadow>
            <cylinderGeometry onUpdate={facetGeometry} args={[0.14, 0.11, seated ? 0.36 : 0.6, 6]} />
            <meshToonMaterial color="#272030" />
            {outline}
          </mesh>
          <mesh position={[side * 0.34, height + (seated ? 0.14 : -0.3), seated ? 0.23 : 0.02]} castShadow>
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
            <meshBasicMaterial color="#603c32" />
          </mesh>
        </group>
      ))}
      <mesh position={[0, headY - 0.045, 0.267]} scale={[0.035, 0.045, 0.045]}>
        <icosahedronGeometry onUpdate={facetGeometry} args={[1, 0]} />
        <meshToonMaterial color="#f5b485" />
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
      <mesh position={[0, headY + 0.04, -0.025]} scale={[0.96, 1, 0.94]} castShadow>
        <sphereGeometry onUpdate={facetGeometry} args={[0.33, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.43]} />
        <meshToonMaterial color={wig ? "#fff9ee" : "#653d2e"} />
        {outline}
      </mesh>
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
      ))) : (
        <>
          <mesh position={[-0.055, headY + 0.22, 0.14]} rotation-z={-0.28} scale={[0.27, 0.14, 0.18]} castShadow>
            <icosahedronGeometry onUpdate={facetGeometry} args={[1, 1]} />
            <meshToonMaterial color="#784833" />
            {outline}
          </mesh>
          <mesh position={[0.19, headY + 0.16, 0.055]} rotation-z={0.35} scale={[0.12, 0.19, 0.17]} castShadow>
            <icosahedronGeometry onUpdate={facetGeometry} args={[1, 1]} />
            <meshToonMaterial color="#653d2e" />
            {outline}
          </mesh>
          <mesh position={[0, headY + 0.035, -0.18]} scale={[0.28, 0.26, 0.15]} castShadow>
            <icosahedronGeometry onUpdate={facetGeometry} args={[1, 1]} />
            <meshToonMaterial color="#653d2e" />
            {outline}
          </mesh>
        </>
      )}
      <Html position={[0, height + 1.5, 0]} center distanceFactor={10}>
        <div className="tag">
          {speech !== null && <div className="bubble">{speech}</div>}
          <div className="name">{name}</div>
        </div>
      </Html>
    </group>
  );
};
