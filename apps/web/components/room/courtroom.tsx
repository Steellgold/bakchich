"use client";

import type { Box } from "@tribunal/bot/room/layout";
import { Outlines } from "@react-three/drei";
import { GATE, OBSTACLES, RESTRICTED_ZONE, ROOM, SIDE_DOOR } from "@tribunal/bot/room/layout";
import { useMemo } from "react";
import { CanvasTexture, NearestFilter, RepeatWrapping, SRGBColorSpace } from "three";

export const INK = "#2b1b3d";

const COLORS: Record<Box["kind"], string> = {
  wall: "#7ad7f0",
  bench: "#ff8fab",
  desk: "#ffd23f",
  rail: "#3ddc84",
  stand: "#b388ff",
};

/** Tiny 2x2 checkerboard, each pixel being one 2 m tile once repeated */
const useChecker = (light: string, dark: string, width: number, depth: number) => useMemo(() => {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 2;
  const context = canvas.getContext("2d");
  if (context !== null) {
    context.fillStyle = light;
    context.fillRect(0, 0, 2, 2);
    context.fillStyle = dark;
    context.fillRect(0, 0, 1, 1);
    context.fillRect(1, 1, 1, 1);
  }
  const texture = new CanvasTexture(canvas);
  texture.magFilter = NearestFilter;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.repeat.set(width / 4, depth / 4);
  return texture;
}, [light, dark, width, depth]);

/** Low-poly plant: trunk and a stack of cones */
const Plant = ({ x, z }: { x: number; z: number }) => (
  <group position={[x, 0, z]}>
    <mesh position={[0, 0.4, 0]} castShadow>
      <cylinderGeometry args={[0.15, 0.2, 0.8, 5]} />
      <meshToonMaterial color="#c97b3a" />
      <Outlines thickness={0.03} color={INK} />
    </mesh>
    {[1.1, 1.8].map((y, index) => (
      <mesh key={y} position={[0, y, 0]} castShadow>
        <coneGeometry args={[0.9 - index * 0.25, 1.2, 5]} />
        <meshToonMaterial color={index === 0 ? "#2ecc71" : "#58e08a"} />
        <Outlines thickness={0.03} color={INK} />
      </mesh>
    ))}
  </group>
);

/** The courtroom built from the shared layout: checkered floors, candy-colored furniture, plants */
export const Courtroom = () => {
  const zoneWidth = RESTRICTED_ZONE.max.x - RESTRICTED_ZONE.min.x;
  const zoneDepth = RESTRICTED_ZONE.max.z - RESTRICTED_ZONE.min.z;
  const publicFloor = useChecker("#fff1c1", "#ffd98a", ROOM.width, ROOM.depth);
  const zoneFloor = useChecker("#d9c8ff", "#b69cff", zoneWidth, zoneDepth);

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

      {OBSTACLES.map((box) => (
        <mesh
          key={`${String(box.min.x)}:${String(box.min.z)}:${box.kind}`}
          position={[(box.min.x + box.max.x) / 2, box.height / 2, (box.min.z + box.max.z) / 2]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[box.max.x - box.min.x, box.height, box.max.z - box.min.z]} />
          <meshToonMaterial color={COLORS[box.kind]} />
          <Outlines thickness={0.04} color={INK} />
        </mesh>
      ))}

      <Plant x={-9} z={28.5} />
      <Plant x={9} z={28.5} />
      <Plant x={-9} z={14.5} />
      <Plant x={9} z={14.5} />

      <mesh position={[GATE.x, 0.03, GATE.z]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.4, 0.6, 5]} />
        <meshBasicMaterial color="#ff4f5e" />
      </mesh>

      <mesh position={[SIDE_DOOR.x - 0.05, 1.2, SIDE_DOOR.z]}>
        <boxGeometry args={[0.1, 2.4, 1.4]} />
        <meshToonMaterial color="#ff4f5e" />
        <Outlines thickness={0.04} color={INK} />
      </mesh>
    </group>
  );
};
