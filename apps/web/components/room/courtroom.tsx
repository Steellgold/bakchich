"use client";

import type { Box } from "@tribunal/bot/room/layout";
import { tilesTexture, wallpaperTexture, woodTexture } from "./textures";
import { Outlines } from "@react-three/drei";
import { GATE, OBSTACLES, RESTRICTED_ZONE, ROOM, SIDE_DOOR } from "@tribunal/bot/room/layout";
import { useMemo } from "react";

export const INK = "#2b1b3d";

// Tints multiplied with the wood texture:
const WOOD_TINTS: Record<"bench" | "desk" | "stand" | "rail", string> = {
  bench: "#ffd9b0",
  desk: "#e8b27a",
  stand: "#c58a5a",
  rail: "#f5d2a0",
};

type Textures = { wood: ReturnType<typeof woodTexture>; wallpaper: ReturnType<typeof wallpaperTexture> };

const Wood = ({ kind, textures }: { kind: keyof typeof WOOD_TINTS; textures: Textures }) => (
  <meshToonMaterial map={textures.wood} color={WOOD_TINTS[kind]} />
);

const Part = ({ position, size, textures, kind, outline = true }: { position: [number, number, number]; size: [number, number, number]; textures: Textures; kind: keyof typeof WOOD_TINTS; outline?: boolean }) => (
  <mesh position={position} castShadow receiveShadow>
    <boxGeometry args={size} />
    <Wood kind={kind} textures={textures} />
    {outline && <Outlines thickness={0.025} color={INK} />}
  </mesh>
);

/** Public bench: seat, two side panels and a backrest on the entrance side */
const Bench = ({ box, textures }: { box: Box; textures: Textures }) => {
  const width = box.max.x - box.min.x;
  const depth = box.max.z - box.min.z;
  return (
    <group position={[(box.min.x + box.max.x) / 2, 0, (box.min.z + box.max.z) / 2]}>
      <Part position={[0, 0.45, 0]} size={[width, 0.1, depth]} textures={textures} kind="bench" />
      <Part position={[-width / 2 + 0.05, 0.2, 0]} size={[0.1, 0.4, depth]} textures={textures} kind="stand" />
      <Part position={[width / 2 - 0.05, 0.2, 0]} size={[0.1, 0.4, depth]} textures={textures} kind="stand" />
      <Part position={[0, 0.85, depth / 2 + 0.04]} size={[width, 0.6, 0.08]} textures={textures} kind="bench" />
    </group>
  );
};

/** Desk: top slab on four legs */
const Desk = ({ box, textures }: { box: Box; textures: Textures }) => {
  const width = box.max.x - box.min.x;
  const depth = box.max.z - box.min.z;
  const legHeight = box.height - 0.1;
  return (
    <group position={[(box.min.x + box.max.x) / 2, 0, (box.min.z + box.max.z) / 2]}>
      <Part position={[0, box.height - 0.05, 0]} size={[width, 0.1, depth]} textures={textures} kind="desk" />
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => (
        <Part key={`${String(sx)}:${String(sz)}`} position={[sx * (width / 2 - 0.1), legHeight / 2, sz * (depth / 2 - 0.1)]} size={[0.12, legHeight, 0.12]} textures={textures} kind="stand" outline={false} />
      )))}
    </group>
  );
};

/** Balustrade: top bar on thin balusters, along the longest side of the box */
const Rail = ({ box, textures }: { box: Box; textures: Textures }) => {
  const width = box.max.x - box.min.x;
  const depth = box.max.z - box.min.z;
  const horizontal = width >= depth;
  const length = horizontal ? width : depth;
  const thickness = horizontal ? depth : width;
  const posts = Math.floor(length / 0.7) + 1;
  return (
    <group position={[(box.min.x + box.max.x) / 2, 0, (box.min.z + box.max.z) / 2]}>
      <Part position={[0, box.height - 0.05, 0]} size={horizontal ? [length, 0.1, thickness + 0.1] : [thickness + 0.1, 0.1, length]} textures={textures} kind="rail" />
      {Array.from({ length: posts }, (_, index) => {
        const offset = -length / 2 + 0.06 + (index * (length - 0.12)) / Math.max(posts - 1, 1);
        return <Part key={offset} position={horizontal ? [offset, (box.height - 0.1) / 2, 0] : [0, (box.height - 0.1) / 2, offset]} size={[0.1, box.height - 0.1, 0.1]} textures={textures} kind="rail" outline={false} />;
      })}
    </group>
  );
};

/** The courtroom built from the shared layout: tiled floors, wallpapered walls, wooden furniture */
export const Courtroom = () => {
  const zoneWidth = RESTRICTED_ZONE.max.x - RESTRICTED_ZONE.min.x;
  const zoneDepth = RESTRICTED_ZONE.max.z - RESTRICTED_ZONE.min.z;
  const textures = useMemo(() => ({ wood: woodTexture(), wallpaper: wallpaperTexture() }), []);
  const publicFloor = useMemo(() => tilesTexture("#fff1c1", "#f0d28a", ROOM.width / 4, ROOM.depth / 4), []);
  const zoneFloor = useMemo(() => tilesTexture("#d9c8ff", "#b69cff", zoneWidth / 4, zoneDepth / 4), [zoneWidth, zoneDepth]);

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, ROOM.depth / 2]} receiveShadow>
        <planeGeometry args={[ROOM.width, ROOM.depth]} />
        <meshToonMaterial map={publicFloor} />
      </mesh>

      <mesh rotation-x={-Math.PI / 2} position={[(RESTRICTED_ZONE.min.x + RESTRICTED_ZONE.max.x) / 2, 0.01, (RESTRICTED_ZONE.min.z + RESTRICTED_ZONE.max.z) / 2]} receiveShadow>
        <planeGeometry args={[zoneWidth, zoneDepth]} />
        <meshToonMaterial map={zoneFloor} />
      </mesh>

      {OBSTACLES.map((box) => {
        const key = `${String(box.min.x)}:${String(box.min.z)}:${box.kind}`;
        if (box.kind === "bench") return <Bench key={key} box={box} textures={textures} />;
        if (box.kind === "desk") return <Desk key={key} box={box} textures={textures} />;
        if (box.kind === "rail") return <Rail key={key} box={box} textures={textures} />;
        return (
          <mesh
            key={key}
            position={[(box.min.x + box.max.x) / 2, box.height / 2, (box.min.z + box.max.z) / 2]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[box.max.x - box.min.x, box.height, box.max.z - box.min.z]} />
            {box.kind === "wall" ? <meshToonMaterial map={textures.wallpaper} /> : <Wood kind="stand" textures={textures} />}
            <Outlines thickness={0.04} color={INK} />
          </mesh>
        );
      })}

      <mesh position={[GATE.x, 0.03, GATE.z]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.4, 0.6, 5]} />
        <meshBasicMaterial color="#ff4f5e" />
      </mesh>

      <mesh position={[SIDE_DOOR.x - 0.05, 1.2, SIDE_DOOR.z]}>
        <boxGeometry args={[0.1, 2.4, 1.4]} />
        <Wood kind="stand" textures={textures} />
        <Outlines thickness={0.04} color={INK} />
      </mesh>
    </group>
  );
};
