"use client";

import type { ThreeElements } from "@react-three/fiber";
import type { Vec2 } from "@tribunal/bot/room/layout";
import type { RefObject } from "react";
import type { BufferGeometry, Group, Mesh, Texture } from "three";
import { INK } from "./courtroom";
import { Html, Outlines } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { Color, DoubleSide, FrontSide, SRGBColorSpace, TextureLoader } from "three";

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
  /** Vertical offset for raised positions such as the judge's chair. */
  elevation?: number;
  /** The judge: powdered wig, white moustache and beard, gold collar and a gavel */
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
  { skin: "#ffd1a1", shade: "#edac7d" },
  { skin: "#efb88d", shade: "#d68d65" },
  { skin: "#d6986a", shade: "#b9714e" },
  { skin: "#b97953", shade: "#93533b" },
  { skin: "#8d563f", shade: "#703b32" },
  { skin: "#6e4538", shade: "#533128" },
] as const;
const hairColors = ["#2b1d1a", "#4a2c26", "#85512e", "#d8a254", "#b75f38", "#3a3547", "#b2a6a6", "#ece4d8", "#7a3fb0", "#2f6f8f"] as const;
const mainColors = ["#4f1a80", "#7e1f3a", "#1f3a5f", "#24533a", "#2e2b36", "#b8771a", "#1f6f73", "#6b4226", "#5b2a5e"] as const;
const pantsColors = ["#2a2633", "#232c45", "#4a3326", "#5b5866", "#a8916b"] as const;
const shirtColors = ["#fff9ee", "#dfe9f5", "#f5e2e8"] as const;
const accentColors = ["#f2bd3c", "#cf3934", "#3fb5a8", "#e0679a", "#9b55e0", "#e8812a"] as const;
const shoeColors = ["#1c1420", "#4a2a1a", "#6b3a22"] as const;
const outfits = ["robe", "suit", "vest", "sweater"] as const;
const builds = [0.94, 1, 1.08, 1.16] as const;
const facials = ["mustache", "beard", "goatee"] as const;

type Outfit = (typeof outfits)[number] | "judge";
type Facial = (typeof facials)[number] | "none" | "handlebar";

type Look = {
  skin: string;
  shade: string;
  hair: string;
  hairStyle: number;
  /** Eyebrow thickness factor and tilt (positive frowns) */
  brow: number;
  browTilt: number;
  nose: number;
  mouth: number;
  facial: Facial;
  glasses: boolean;
  /** Half-closed eyelids */
  sleepy: boolean;
  outfit: Outfit;
  main: string;
  trim: string;
  pants: string;
  shirt: string;
  accent: string;
  shoes: string;
  /** Shoulder width factor */
  build: number;
  belly: boolean;
  headWidth: number;
  pack: number;
};

type HairPart = { position: [number, number, number]; scale: [number, number, number]; tilt?: number; cone?: boolean };
type HairStyle = { cap: boolean; parts: HairPart[] };

// Swept quiff, curls, long bob, receding crown, bun, spikes, buzz cut and a big round cut, all around the same head.
const hairStyles: HairStyle[] = [
  {
    cap: true,
    parts: [
      { position: [-0.055, 0.22, 0.14], scale: [0.27, 0.14, 0.18], tilt: -0.28 },
      { position: [0.19, 0.16, 0.055], scale: [0.12, 0.19, 0.17], tilt: 0.35 },
      { position: [0, 0.035, -0.18], scale: [0.28, 0.26, 0.15] },
    ],
  },
  { cap: true, parts: [-2, -1, 0, 1, 2].map((curl) => ({ position: [curl * 0.105, 0.31 - Math.abs(curl) * 0.045, 0.12], scale: [0.115, 0.115, 0.14] })) },
  {
    cap: true,
    parts: [
      { position: [-0.25, -0.04, -0.045], scale: [0.1, 0.31, 0.2] },
      { position: [0.25, -0.04, -0.045], scale: [0.1, 0.31, 0.2] },
      { position: [0, -0.05, -0.14], scale: [0.29, 0.32, 0.1] },
      { position: [0, 0.03, -0.175], scale: [0.285, 0.22, 0.133] },
      { position: [0, 0.17, 0.19], scale: [0.25, 0.08, 0.1] },
    ],
  },
  {
    cap: false,
    parts: [
      { position: [-0.25, 0.025, -0.06], scale: [0.07, 0.15, 0.19] },
      { position: [0.25, 0.025, -0.06], scale: [0.07, 0.15, 0.19] },
      { position: [0, 0.08, -0.2], scale: [0.25, 0.17, 0.12] },
    ],
  },
  { cap: true, parts: [{ position: [0, 0.33, -0.12], scale: [0.13, 0.12, 0.13] }, { position: [0, 0.17, 0.2], scale: [0.24, 0.07, 0.09] }] },
  { cap: true, parts: [-0.14, 0, 0.14].flatMap((x) => [0.06, -0.1].map((z) => ({ position: [x, 0.36 - Math.abs(x) * 0.4, z], scale: [0.07, 0.16, 0.07], tilt: -x * 1.6, cone: true }))) },
  { cap: true, parts: [] },
  { cap: false, parts: [{ position: [0, 0.14, -0.12], scale: [0.4, 0.36, 0.32] }] },
];

const JUDGE_LOOK: Look = {
  skin: "#f6b58c",
  shade: "#e48c66",
  hair: "#f3ecf2",
  hairStyle: -1,
  brow: 2.4,
  browTilt: 0,
  nose: 2,
  mouth: 1,
  facial: "handlebar",
  glasses: false,
  sleepy: true,
  outfit: "judge",
  main: "#3b2252",
  trim: "#56327a",
  pants: "#2a2633",
  shirt: "#fff9ee",
  accent: "#f2bd3c",
  shoes: "#1c1420",
  build: 1.16,
  belly: true,
  headWidth: 1.06,
  pack: 0,
};
const WIG_SHADE = "#cdbfcc";
const JUDGE_BROWS = "#3d2633";

// Stable member IDs keep appearances identical across clients and display-name changes.
const randomFor = (id: string) => {
  let seed = 2_166_136_261;
  for (let index = 0; index < id.length; index += 1) seed = Math.imul(seed ^ id.charCodeAt(index), 16_777_619);
  // Mulberry32: every trait gets its own draw instead of sharing bits of one hash.
  return () => {
    seed = (seed + 0x6D_2B_79_F5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
};

const pick = <L extends readonly [unknown, ...unknown[]]>(random: () => number, list: L): L[number] => list[Math.floor(random() * list.length)] ?? list[0];

const lighten = (hex: string, amount: number) => `#${new Color(hex).offsetHSL(0, 0, amount).getHexString()}`;

const memberLook = (id: string): Look => {
  const random = randomFor(id);
  const tone = pick(random, skinTones);
  const main = pick(random, mainColors);
  const build = pick(random, builds);
  return {
    skin: tone.skin,
    shade: tone.shade,
    hair: pick(random, hairColors),
    hairStyle: Math.floor(random() * hairStyles.length),
    brow: 1 + random() * 1.2,
    browTilt: (random() - 0.5) * 0.5,
    nose: Math.floor(random() * 3),
    mouth: Math.floor(random() * 3),
    facial: random() < 0.55 ? "none" : pick(random, facials),
    glasses: random() < 0.22,
    sleepy: random() < 0.15,
    outfit: pick(random, outfits),
    main,
    trim: lighten(main, 0.08),
    pants: pick(random, pantsColors),
    shirt: pick(random, shirtColors),
    accent: pick(random, accentColors),
    shoes: pick(random, shoeColors),
    build,
    belly: build >= 1.08 && random() < 0.5,
    headWidth: 0.95 + random() * 0.1,
    pack: Math.floor(random() * 4),
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

type ToonProps = ThreeElements["mesh"] & { color: string; outlined?: boolean; double?: boolean };

/** Cel-shaded part; outlined parts carry the silhouette and cast shadows, small details stay light */
const Toon = ({ color, outlined = false, double = false, children, ...mesh }: ToonProps) => (
  <mesh castShadow={outlined} {...mesh}>
    {children}
    <meshToonMaterial color={color} side={double ? DoubleSide : FrontSide} />
    {outlined && <Outlines thickness={0.018} color={INK} />}
  </mesh>
);

/** Unlit part for eyes, brows and other ink details */
const Flat = ({ color, children, ...mesh }: ThreeElements["mesh"] & { color: string }) => (
  <mesh {...mesh}>
    {children}
    <meshBasicMaterial color={color} />
  </mesh>
);

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
// Remote members arrive in steps of 100 ms: the character follows them smoothly and reads a little ahead from their last speed.
const FOLLOW_RATE = 14;
const TURN_RATE = 12;
const EXTRAPOLATE_SECONDS = 0.1;
const STALE_SECONDS = 0.25;
const STRIDE_PER_METER = 2.4;
/** Depth of the flat front face of the 8-sided torso, as a share of its radius (cos 22.5° × 0.62 depth scale) */
const FRONT = 0.573;
const EIGHTH = Math.PI / 8;

/** Powdered judge's wig: puffy crown, three stacked rolls per side and a mass at the back */
const Wig = ({ color }: { color: string }) => (
  <>
    <Toon color={color} outlined position={[0, 0.05, -0.02]} scale={[1.02, 1.04, 0.98]}>
      <sphereGeometry onUpdate={facetGeometry} args={[0.33, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.45]} />
    </Toon>
    {([[0, 0.33, 0.04, 0.2], [-0.16, 0.29, 0.02, 0.15], [0.16, 0.29, 0.02, 0.15], [0, 0.27, -0.17, 0.18], [-0.1, 0.24, 0.17, 0.12], [0.1, 0.24, 0.17, 0.12]] as const).map(([x, y, z, size]) => (
      <Toon key={`${String(x)}:${String(z)}`} color={color} outlined position={[x, y, z]} scale={[size, size * 0.72, size]}>
        <icosahedronGeometry onUpdate={facetGeometry} args={[1, 0]} />
      </Toon>
    ))}
    <Toon color={color} outlined position={[0, -0.13, -0.2]} scale={[0.3, 0.34, 0.17]}>
      <icosahedronGeometry onUpdate={facetGeometry} args={[1, 1]} />
    </Toon>
    {[-1, 1].flatMap((side) => ([[0.06, 0.3], [-0.12, 0.33], [-0.3, 0.32]] as const).map(([y, x]) => (
      <group key={`${String(side)}:${String(y)}`} position={[side * x, y, -0.02]}>
        <Toon color={color} outlined rotation-x={Math.PI / 2}>
          <cylinderGeometry onUpdate={facetGeometry} args={[0.1, 0.1, 0.27, 8]} />
        </Toon>
        <Flat color={WIG_SHADE} position={[0, 0, 0.136]}>
          <circleGeometry args={[0.045, 8]} />
        </Flat>
        <Toon color={WIG_SHADE} position={[0, 0, 0.13]}>
          <torusGeometry args={[0.055, 0.014, 3, 8]} />
        </Toon>
      </group>
    )))}
  </>
);

/** The face, hair and facial hair, in head space (origin at the centre of the head) */
const Head = ({ look, mouthRef, browsRef }: { look: Look; mouthRef: RefObject<Mesh | null>; browsRef: RefObject<Group | null> }) => {
  const judge = look.outfit === "judge";
  const style = hairStyles[look.hairStyle];
  const hw = look.headWidth;

  return (
    <>
      <Toon color={look.skin} outlined scale={[0.91 * hw, 1.06, 0.88]}>
        <sphereGeometry onUpdate={facetGeometry} args={[0.31, 12, 8]} />
      </Toon>
      {[-1, 1].map((side) => (
        <group key={side}>
          <Toon color={look.skin} position={[side * 0.27 * hw, -0.015, 0]} scale={[0.75, 1, 0.65]}>
            <icosahedronGeometry onUpdate={facetGeometry} args={[0.075, 1]} />
          </Toon>
          <Flat color="#fff" position={[side * 0.105, 0.025, 0.24]} scale={[1, 1.2, 0.45]}>
            <sphereGeometry args={[0.045, 10, 8]} />
          </Flat>
          <Flat color={INK} position={[side * 0.105 + (judge ? 0.018 : 0), 0.02, 0.257]} scale={[1, 1.2, 0.5]}>
            <sphereGeometry args={[0.026, 8, 6]} />
          </Flat>
          <Flat color="#fff" position={[side * 0.105 + (judge ? 0.026 : 0.008), 0.036, 0.27]}>
            <sphereGeometry args={[0.008, 6, 4]} />
          </Flat>
          {look.sleepy && (
            <Toon color={look.skin} position={[side * 0.105, 0.058, 0.252]} rotation-z={side * 0.12}>
              <boxGeometry args={[0.105, 0.04, 0.04]} />
            </Toon>
          )}
          {look.glasses && (
            <Flat color={INK} position={[side * 0.105, 0.025, 0.272]}>
              <torusGeometry args={[0.056, 0.01, 4, 14]} />
            </Flat>
          )}
        </group>
      ))}
      {/* Both brows lift together while talking */}
      <group ref={browsRef}>
        {[-1, 1].map((side) => (
          <Flat
            key={side}
            color={judge ? JUDGE_BROWS : look.hair}
            position={[side * 0.11, judge ? 0.12 + (side === 1 ? 0.025 : 0) : 0.105, 0.238]}
            // The judge raises one brow and frowns with the other:
            rotation-z={judge ? (side === 1 ? -0.18 : 0.3) : side * look.browTilt}
          >
            <boxGeometry args={[judge ? 0.12 : 0.08, 0.019 * look.brow, 0.026]} />
          </Flat>
        ))}
      </group>
      {/* Open mouth, scaled every frame from the speaking rhythm (flat when silent) */}
      <mesh ref={mouthRef} position={[0, -0.122, 0.252]} scale={[0.045, 0.001, 0.02]} visible={false}>
        <sphereGeometry args={[1, 10, 6]} />
        <meshBasicMaterial color="#5a1f2e" />
      </mesh>
      {look.glasses && (
        <Flat color={INK} position={[0, 0.035, 0.28]}>
          <boxGeometry args={[0.06, 0.012, 0.012]} />
        </Flat>
      )}

      {look.nose === 0 && (
        <Toon color={look.shade} position={[0, -0.045, 0.267]} scale={[0.035, 0.045, 0.045]}>
          <icosahedronGeometry onUpdate={facetGeometry} args={[1, 0]} />
        </Toon>
      )}
      {look.nose === 1 && (
        <Toon color={look.shade} position={[0, -0.04, 0.268]} scale={[0.032, 0.07, 0.06]}>
          <icosahedronGeometry onUpdate={facetGeometry} args={[1, 0]} />
        </Toon>
      )}
      {look.nose === 2 && (
        <Toon color={look.shade} position={[0, -0.05, 0.27]} scale={[1, 0.9, 1.1]}>
          <icosahedronGeometry onUpdate={facetGeometry} args={[0.052, 1]} />
        </Toon>
      )}

      {look.mouth === 0 && (
        <Flat color={INK} position={[0, -0.115, 0.252]} rotation-z={Math.PI} scale-y={0.6}>
          <torusGeometry args={[0.06, 0.009, 3, 10, Math.PI]} />
        </Flat>
      )}
      {look.mouth === 1 && (
        <Flat color={INK} position={[0.02, -0.118, 0.25]} rotation-z={Math.PI + 0.35} scale-y={0.5}>
          <torusGeometry args={[0.055, 0.009, 3, 10, Math.PI * 0.8]} />
        </Flat>
      )}
      {look.mouth === 2 && (
        <Flat color={INK} position={[0, -0.118, 0.255]}>
          <boxGeometry args={[0.07, 0.012, 0.01]} />
        </Flat>
      )}

      {(look.facial === "mustache" || look.facial === "beard") && [-1, 1].map((side) => (
        <Toon key={side} color={look.hair} position={[side * 0.042, -0.083, 0.262]} rotation-z={-side * 0.22} scale={[0.055, 0.022, 0.03]}>
          <icosahedronGeometry onUpdate={facetGeometry} args={[1, 0]} />
        </Toon>
      ))}
      {(look.facial === "beard" || look.facial === "handlebar") && (
        <Toon color={look.hair} outlined double scale={[0.93 * hw, 1.08, 0.94]}>
          <sphereGeometry onUpdate={facetGeometry} args={[0.322, 12, 5, -0.1, Math.PI + 0.2, Math.PI * 0.64, Math.PI * 0.36]} />
        </Toon>
      )}
      {look.facial === "goatee" && (
        <Toon color={look.hair} outlined position={[0, -0.23, 0.2]} scale={[0.07, 0.08, 0.05]}>
          <icosahedronGeometry onUpdate={facetGeometry} args={[1, 0]} />
        </Toon>
      )}
      {look.facial === "handlebar" && [-1, 1].map((side) => (
        <group key={side}>
          <Toon color={look.hair} outlined position={[side * 0.065, -0.085, 0.268]} rotation-z={-side * 0.28} scale={[0.09, 0.034, 0.045]}>
            <icosahedronGeometry onUpdate={facetGeometry} args={[1, 0]} />
          </Toon>
          <Toon color={look.hair} outlined position={[side * 0.15, -0.07, 0.235]} rotation-z={side * 0.5} scale={[0.035, 0.042, 0.035]}>
            <icosahedronGeometry onUpdate={facetGeometry} args={[1, 0]} />
          </Toon>
        </group>
      ))}

      {judge ? <Wig color={look.hair} /> : (
        <>
          {style?.cap === true && (
            <Toon color={look.hair} outlined position={[0, 0.04, -0.025]} scale={[0.96 * hw, 1, 0.94]}>
              <sphereGeometry onUpdate={facetGeometry} args={[0.33, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.43]} />
            </Toon>
          )}
          {style?.parts.map((part) => (
            <Toon key={part.position.join(":")} color={look.hair} outlined position={[part.position[0] * hw, part.position[1], part.position[2]]} rotation-z={part.tilt ?? 0} scale={[part.scale[0] * hw, part.scale[1], part.scale[2]]}>
              {part.cone === true ? <coneGeometry onUpdate={facetGeometry} args={[1, 1, 5]} /> : <icosahedronGeometry onUpdate={facetGeometry} args={[1, 1]} />}
            </Toon>
          ))}
        </>
      )}
    </>
  );
};

/** Low-poly member with a stable look: build, outfit, face and hair all come from their ID. */
export const Character = ({ id, name, avatarUrl, position, rotation, seated, onBench = false, speech, elevation = 0, wig = false, speaking = false, interpolate = false, follow }: CharacterProps) => {
  const groupRef = useRef<Group>(null);
  const leftArmRef = useRef<Group>(null);
  const rightArmRef = useRef<Group>(null);
  const leftLegRef = useRef<Group>(null);
  const rightLegRef = useRef<Group>(null);
  const leftWristRef = useRef<Group>(null);
  const rightWristRef = useRef<Group>(null);
  const headRef = useRef<Group>(null);
  const mouthRef = useRef<Mesh>(null);
  const browsRef = useRef<Group>(null);
  const motionRef = useRef({ lastTarget: { x: position.x, z: position.z }, velocity: { x: 0, z: 0 }, changedAt: 0, phase: 0, walk: 0, talk: 0, wasSpeaking: false, gesture: id.length, gestureAt: 0 });
  const texture = useAvatarTexture(avatarUrl);
  const look = useMemo(() => (wig ? JUDGE_LOOK : memberLook(id)), [id, wig]);
  const height = seated ? 0.45 : 0.9;
  const headY = height + (seated ? 0.55 : 0.8);
  // The seated robe bottoms out at 0.19 m; the public bench seat is at 0.5 m.
  const baseY = onBench ? 0.31 : elevation;

  const pack = gesturePacks[look.pack % gesturePacks.length] ?? [];
  // Seated members rest their hands forward, standing ones let their arms hang:
  const restX = seated ? -0.9 : 0;

  useFrame((state, delta) => {
    const current = groupRef.current;
    if (current === null) return;
    const motion = motionRef.current;
    const time = state.clock.elapsedTime;
    const target = follow?.current ?? position;
    let desired = target;

    if (interpolate) {
      if (target.x !== motion.lastTarget.x || target.z !== motion.lastTarget.z) {
        const elapsed = Math.min(Math.max(time - motion.changedAt, 0.05), 0.3);
        motion.velocity = { x: (target.x - motion.lastTarget.x) / elapsed, z: (target.z - motion.lastTarget.z) / elapsed };
        motion.lastTarget = { x: target.x, z: target.z };
        motion.changedAt = time;
      }
      if (time - motion.changedAt > STALE_SECONDS) motion.velocity = { x: 0, z: 0 };

      const ahead = Math.min(time - motion.changedAt, EXTRAPOLATE_SECONDS);
      desired = { x: target.x + motion.velocity.x * ahead, z: target.z + motion.velocity.z * ahead };
    }

    const beforeX = current.position.x;
    const beforeZ = current.position.z;
    const blend = interpolate ? 1 - Math.exp(-delta * FOLLOW_RATE) : 1;
    current.position.x += (desired.x - beforeX) * blend;
    current.position.z += (desired.z - beforeZ) * blend;

    // Turn by the shortest way instead of snapping:
    const turn = Math.atan2(Math.sin(rotation - current.rotation.y), Math.cos(rotation - current.rotation.y));
    current.rotation.y += turn * (1 - Math.exp(-delta * TURN_RATE));

    // Walking cycle from the distance actually covered: legs swing, arms swing the other way, the body bobs.
    const moved = Math.hypot(current.position.x - beforeX, current.position.z - beforeZ);
    const walking = !seated && moved / Math.max(delta, 0.001) > 0.4;
    motion.phase += moved * STRIDE_PER_METER;
    motion.walk += ((walking ? 1 : 0) - motion.walk) * (1 - Math.exp(-delta * 10));
    current.position.y = baseY + Math.abs(Math.sin(motion.phase)) * 0.045 * motion.walk;
    for (const [index, leg] of [leftLegRef.current, rightLegRef.current].entries()) {
      if (leg !== null) leg.rotation.x = Math.sin(motion.phase + index * Math.PI) * 0.75 * motion.walk;
    }

    // Talking: only the speaking state is known (no audio), so a syllable-like rhythm drives the mouth, head, brows and hands.
    motion.talk += ((speaking ? 1 : 0) - motion.talk) * (1 - Math.exp(-delta * 8));
    const talk = motion.talk;
    const syllable = Math.abs(Math.sin(time * 13 + id.length) * Math.sin(time * 5.7 + 1.3));
    // A new gesture for each phrase (each time the member starts talking again), and every few seconds of a long one:
    if (speaking && (!motion.wasSpeaking || time - motion.gestureAt > GESTURE_SECONDS)) {
      motion.gesture += 1 + Math.floor(Math.random() * Math.max(pack.length - 1, 1));
      motion.gestureAt = time;
    }
    motion.wasSpeaking = speaking;

    const mouth = mouthRef.current;
    if (mouth !== null) {
      const open = talk * (0.25 + 0.75 * syllable);
      mouth.visible = open > 0.03;
      mouth.scale.y = 0.001 + open * 0.042;
    }
    if (headRef.current !== null) {
      headRef.current.rotation.x = (Math.sin(time * 4.2) * 0.05 - syllable * 0.03) * talk;
      headRef.current.rotation.y = Math.sin(time * 1.3 + id.length) * 0.1 * talk;
      headRef.current.rotation.z = Math.sin(time * 2.1) * 0.04 * talk;
    }
    if (browsRef.current !== null) browsRef.current.position.y = Math.max(0, Math.sin(time * 2.6)) * 0.014 * talk;

    const gesture = speaking ? pack[motion.gesture % pack.length] : undefined;
    for (const [index, arm] of [leftArmRef.current, rightArmRef.current].entries()) {
      if (arm === null) continue;
      const side = index === 0 ? -1 : 1;
      const pose = gesture === undefined ? { ...IDLE, x: restX } : (index === 0 ? gesture.left : gesture.right);
      const wobble = pose.wobble ?? 0;
      const swing = gesture === undefined ? Math.sin(motion.phase + (index === 0 ? Math.PI : 0)) * 0.6 * motion.walk : 0;
      // Raised arms beat a little with the syllables:
      const beat = pose.x < -0.3 ? syllable * 0.18 * talk : 0;
      arm.rotation.x += (pose.x + swing - beat + Math.sin(time * 5 + index) * wobble - arm.rotation.x) * 0.15;
      arm.rotation.z += (side * (pose.outward + Math.cos(time * 4 + index) * wobble * 0.5) - arm.rotation.z) * 0.15;
    }
    for (const [index, wrist] of [leftWristRef.current, rightWristRef.current].entries()) {
      if (wrist === null) continue;
      wrist.rotation.x = Math.sin(time * 6 + index * 1.7) * 0.45 * talk;
      wrist.rotation.z = Math.cos(time * 4.5 + index) * 0.3 * talk;
    }
  });

  const robed = look.outfit === "robe" || look.outfit === "judge";
  const build = look.build;
  // Body proportions: a chest wider at the shoulders than at the waist gives the build.
  const torsoTop = headY - 0.32;
  const chestH = seated ? 0.36 : 0.56;
  const waistY = torsoTop - chestH;
  const bottomY = seated ? 0.19 : 0.44;
  const shoulderR = 0.4 * build;
  const waistR = 0.28 * build * (look.belly ? 1.12 : 1);
  const k = chestH / 0.56;
  const tilt = -Math.atan(((shoulderR - waistR) * FRONT) / chestH);
  const radiusAt = (y: number) => waistR + (shoulderR - waistR) * ((y - waistY) / chestH);
  const frontZ = (y: number) => radiusAt(y) * FRONT + 0.012;
  const sleeve = look.outfit === "vest" ? look.shirt : look.main;
  const cuff = look.outfit === "suit" || look.outfit === "vest" ? look.shirt : look.trim;
  const armLength = seated ? 0.36 : 0.56;
  const armWidth = Math.sqrt(build);
  const legColor = robed ? look.main : look.pants;
  const badgeY = torsoTop - 0.2 * k;

  return (
    <group ref={groupRef} position={[position.x, baseY, position.z]}>
      {!seated && [-1, 1].map((side) => (
        <group key={side} ref={side === -1 ? leftLegRef : rightLegRef} position={[side * 0.14 * build, 0.46, 0]}>
          <Toon color={look.pants} outlined position={[0, -0.2, 0]}>
            <boxGeometry args={[0.19, 0.4, 0.23]} />
          </Toon>
          <Toon color={look.shoes} outlined position={[0, -0.41, 0.04]}>
            <boxGeometry args={[0.21, 0.1, 0.32]} />
          </Toon>
        </group>
      ))}
      {seated && onBench && [-1, 1].map((side) => (
        <group key={side}>
          <Toon color={legColor} outlined position={[side * 0.14 * build, 0.26, 0.17]}>
            <boxGeometry args={[0.16, 0.14, 0.42]} />
          </Toon>
          <Toon color={look.pants} outlined position={[side * 0.14 * build, -0.02, 0.39]}>
            <boxGeometry args={[0.13, 0.46, 0.14]} />
          </Toon>
          <Toon color={look.shoes} outlined position={[side * 0.14 * build, -0.25, 0.44]}>
            <boxGeometry args={[0.18, 0.12, 0.24]} />
          </Toon>
        </group>
      ))}

      {/* Torso: chest, then a flared robe or the hips under a jacket */}
      <Toon color={look.main} outlined position={[0, waistY + chestH / 2, 0]} rotation-y={EIGHTH} scale-z={0.62}>
        <cylinderGeometry onUpdate={facetGeometry} args={[shoulderR, waistR, chestH, 8]} />
      </Toon>
      <Toon color={robed ? look.main : look.pants} outlined position={[0, (waistY + bottomY) / 2, 0]} rotation-y={EIGHTH} scale-z={0.62}>
        <cylinderGeometry onUpdate={facetGeometry} args={[waistR, waistR * (robed ? (seated ? 1.15 : 1.3) : 0.96), waistY - bottomY, 8]} />
      </Toon>
      {look.outfit === "suit" && (
        <Toon color={look.main} outlined position={[0, waistY - 0.07 * k, 0]} rotation-y={EIGHTH} scale-z={0.62}>
          <cylinderGeometry onUpdate={facetGeometry} args={[waistR * 1.03, waistR * 1.12, 0.16 * k, 8]} />
        </Toon>
      )}
      {look.outfit === "vest" && (
        <Toon color={look.main} position={[0, waistY - 0.03 * k, 0]} rotation-y={EIGHTH} scale-z={0.62}>
          <cylinderGeometry onUpdate={facetGeometry} args={[waistR * 1.02, waistR * 1.05, 0.07 * k, 8]} />
        </Toon>
      )}
      {look.outfit === "sweater" && (
        <>
          <Toon color={look.trim} position={[0, waistY - 0.035 * k, 0]} rotation-y={EIGHTH} scale-z={0.62}>
            <cylinderGeometry onUpdate={facetGeometry} args={[waistR * 1.04, waistR * 1.04, 0.08 * k, 8]} />
          </Toon>
          <Toon color={look.accent} position={[0, waistY + chestH * 0.55, 0]} rotation-y={EIGHTH} scale-z={0.62}>
            <cylinderGeometry onUpdate={facetGeometry} args={[radiusAt(waistY + chestH * 0.55 + 0.04 * k) + 0.01, radiusAt(waistY + chestH * 0.55 - 0.04 * k) + 0.01, 0.08 * k, 8]} />
          </Toon>
        </>
      )}
      {look.belly && (
        <Toon color={look.main} outlined position={[0, waistY + 0.1 * k, frontZ(waistY + 0.1 * k) - 0.1]} scale={[waistR * 0.85, 0.17 * k, 0.15]}>
          <icosahedronGeometry onUpdate={facetGeometry} args={[1, 1]} />
        </Toon>
      )}

      {/* Shoulders */}
      <Toon color={robed ? look.trim : sleeve} outlined position={[0, torsoTop - 0.02, 0]} scale={[shoulderR + 0.05, 0.12, 0.26]}>
        <icosahedronGeometry onUpdate={facetGeometry} args={[1, 1]} />
      </Toon>

      {/* Front of the outfit, laid on the flat front face of the chest */}
      <group rotation-x={tilt}>
        {robed && (
          <Toon color={look.trim} position={[0, waistY + chestH / 2, frontZ(waistY + chestH / 2)]}>
            <boxGeometry args={[0.07, chestH * 0.95, 0.02]} />
          </Toon>
        )}
        {look.outfit === "robe" && [-1, 1].map((side) => (
          <Toon key={side} color="#fff9ee" outlined position={[side * 0.055, torsoTop - 0.15 * k, frontZ(torsoTop - 0.15 * k) + 0.01]} rotation-z={side * 0.06}>
            <boxGeometry args={[0.085, 0.22 * k, 0.035]} />
          </Toon>
        ))}
        {look.outfit === "judge" && (
          <>
            {[-1, 1].map((side) => (
              <group key={side}>
                <Toon color="#fff9ee" outlined position={[side * 0.06, torsoTop - 0.19 * k, frontZ(torsoTop - 0.19 * k) + 0.02]} rotation-z={side * 0.09}>
                  <boxGeometry args={[0.1, 0.3 * k, 0.04]} />
                </Toon>
                <Toon color={look.accent} outlined position={[side * 0.15, torsoTop - 0.2 * k, frontZ(torsoTop - 0.2 * k) + 0.005]} rotation-z={side * 0.12}>
                  <boxGeometry args={[0.06, 0.36 * k, 0.03]} />
                </Toon>
              </group>
            ))}
            <Toon color="#fff9ee" outlined position={[0, torsoTop - 0.04, frontZ(torsoTop - 0.04) + 0.025]}>
              <boxGeometry args={[0.15, 0.07, 0.05]} />
            </Toon>
          </>
        )}
        {(look.outfit === "suit" || look.outfit === "vest") && (
          <Toon color={look.shirt} position={[0, torsoTop - 0.14 * k, frontZ(torsoTop - 0.14 * k)]}>
            <boxGeometry args={[look.outfit === "suit" ? 0.17 : 0.12, 0.28 * k, 0.02]} />
          </Toon>
        )}
        {look.outfit === "suit" && (
          <>
            <Toon color={look.accent} position={[0, torsoTop - 0.04 * k, frontZ(torsoTop - 0.04 * k) + 0.015]}>
              <boxGeometry args={[0.06, 0.05, 0.03]} />
            </Toon>
            <Toon color={look.accent} position={[0, torsoTop - 0.2 * k, frontZ(torsoTop - 0.2 * k) + 0.012]}>
              <boxGeometry args={[0.055, 0.26 * k, 0.025]} />
            </Toon>
            {[-1, 1].map((side) => (
              <Toon key={side} color={look.trim} outlined position={[side * 0.1, torsoTop - 0.14 * k, frontZ(torsoTop - 0.14 * k) + 0.012]} rotation-z={-side * 0.3}>
                <boxGeometry args={[0.07, 0.3 * k, 0.03]} />
              </Toon>
            ))}
            {[0.08, 0.16].map((offset) => (
              <Flat key={offset} color={INK} position={[0, waistY + offset * k, frontZ(waistY + offset * k) + 0.005]}>
                <sphereGeometry args={[0.016, 6, 4]} />
              </Flat>
            ))}
          </>
        )}
        {look.outfit === "vest" && (
          <>
            {[-1, 1].map((side) => (
              <Toon key={side} color={look.accent} outlined position={[side * 0.045, torsoTop - 0.04 * k, frontZ(torsoTop - 0.04 * k) + 0.02]} rotation-z={side * 0.4}>
                <boxGeometry args={[0.07, 0.05, 0.03]} />
              </Toon>
            ))}
            {[0.28, 0.36, 0.44].map((offset) => (
              <Flat key={offset} color="#f2bd3c" position={[0, torsoTop - offset * k, frontZ(torsoTop - offset * k) + 0.005]}>
                <sphereGeometry args={[0.017, 6, 4]} />
              </Flat>
            ))}
          </>
        )}
        <Toon color={look.accent} position={[-shoulderR * 0.48, badgeY, frontZ(badgeY) + 0.01]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[0.078, 0.078, 0.02, 12]} />
        </Toon>
        {texture !== null && (
          <mesh position={[-shoulderR * 0.48, badgeY, frontZ(badgeY) + 0.022]}>
            <circleGeometry args={[0.064, 16]} />
            <meshBasicMaterial map={texture} />
          </mesh>
        )}
      </group>

      {/* Arms: shoulder, sleeve, forearm, cuff and hand; the judge holds his gavel */}
      {[-1, 1].map((side) => (
        <group key={side} ref={side === -1 ? leftArmRef : rightArmRef} position={[side * (shoulderR - 0.02), torsoTop - 0.08, 0]} rotation={[restX, 0, side * 0.07]}>
          <Toon color={robed ? look.trim : sleeve} outlined scale={[1, 0.9, 1]}>
            <icosahedronGeometry onUpdate={facetGeometry} args={[0.14 * armWidth, 1]} />
          </Toon>
          <Toon color={sleeve} outlined position={[0, -armLength * 0.275, 0]}>
            <cylinderGeometry onUpdate={facetGeometry} args={[0.125 * armWidth, 0.105 * armWidth, armLength * 0.55, 6]} />
          </Toon>
          <Toon color={sleeve} outlined position={[0, -armLength * 0.775, 0]}>
            <cylinderGeometry onUpdate={facetGeometry} args={[0.105 * armWidth, (robed ? 0.14 : 0.092) * armWidth, armLength * 0.45, 6]} />
          </Toon>
          <Toon color={cuff} position={[0, -armLength + 0.01, 0]}>
            <cylinderGeometry onUpdate={facetGeometry} args={[(robed ? 0.13 : 0.098) * armWidth, (robed ? 0.13 : 0.098) * armWidth, 0.05, 6]} />
          </Toon>
          {/* Hand on a wrist that turns while talking: flat palm and a thumb towards the front */}
          <group ref={side === -1 ? leftWristRef : rightWristRef} position={[0, -armLength - 0.02, 0]}>
            <Toon color={look.skin} outlined position={[0, -0.05, 0]} scale={[0.85, 1.15, 0.62]}>
              <icosahedronGeometry onUpdate={facetGeometry} args={[0.085, 1]} />
            </Toon>
            <Toon color={look.skin} outlined position={[-side * 0.035, -0.035, 0.05]} rotation-x={-0.5} scale={[0.8, 1.3, 0.8]}>
              <icosahedronGeometry onUpdate={facetGeometry} args={[0.032, 0]} />
            </Toon>
            {look.outfit === "judge" && side === 1 && (
              <group position={[0, -0.04, 0]}>
                <Toon color="#8a4b2e" outlined position={[0, 0, 0.15]} rotation-x={Math.PI / 2}>
                  <cylinderGeometry onUpdate={facetGeometry} args={[0.025, 0.03, 0.34, 6]} />
                </Toon>
                <Toon color="#b8632f" outlined position={[0, 0, 0.33]} rotation-z={Math.PI / 2}>
                  <cylinderGeometry onUpdate={facetGeometry} args={[0.075, 0.075, 0.24, 8]} />
                </Toon>
                {[-1, 1].map((end) => (
                  <Toon key={end} color={look.accent} position={[end * 0.085, 0, 0.33]} rotation-z={Math.PI / 2}>
                    <cylinderGeometry onUpdate={facetGeometry} args={[0.08, 0.08, 0.04, 8]} />
                  </Toon>
                ))}
              </group>
            )}
          </group>
        </group>
      ))}

      {/* Neck and collar */}
      <Toon color={look.skin} position={[0, headY - 0.28, 0]}>
        <cylinderGeometry onUpdate={facetGeometry} args={[0.1 * armWidth, 0.115 * armWidth, 0.18, 8]} />
      </Toon>
      {robed && (
        <Toon color={look.accent} outlined position={[0, headY - 0.34, 0]} scale-z={0.65}>
          <cylinderGeometry onUpdate={facetGeometry} args={[0.17 * build, 0.26 * build, 0.16, 6]} />
        </Toon>
      )}
      {!robed && (
        <Toon color={look.shirt} position={[0, headY - 0.35, 0.01]} rotation-x={Math.PI / 2} scale-y={0.75}>
          <torusGeometry args={[0.13 * armWidth, 0.04, 4, 8]} />
        </Toon>
      )}

      <group ref={headRef} position={[0, headY, 0]}>
        <Head look={look} mouthRef={mouthRef} browsRef={browsRef} />
      </group>

      <Html position={[0, height + 1.5, 0]} center distanceFactor={10}>
        <div className="tag">
          {speech !== null && <div className="bubble">{speech}</div>}
          <div className="name">{name}</div>
        </div>
      </Html>
    </group>
  );
};
