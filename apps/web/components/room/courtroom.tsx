"use client";

import type { Box } from "@tribunal/bot/room/layout";
import { OBSTACLES } from "@tribunal/bot/room/layout";
import { GATE, RESTRICTED_ZONE, ROOM, SIDE_DOOR } from "@tribunal/bot/room/layout";

const COLORS: Record<Box["kind"], string> = {
  wall: "#8a7a5c",
  bench: "#6d4c41",
  desk: "#4e342e",
  rail: "#d7b98e",
  stand: "#5d4037",
};

/** The courtroom built from the shared layout: floor, restricted zone, walls and furniture */
export const Courtroom = () => {
  const zoneWidth = RESTRICTED_ZONE.max.x - RESTRICTED_ZONE.min.x;
  const zoneDepth = RESTRICTED_ZONE.max.z - RESTRICTED_ZONE.min.z;

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, ROOM.depth / 2]} receiveShadow>
        <planeGeometry args={[ROOM.width, ROOM.depth]} />
        <meshStandardMaterial color="#2b2620" flatShading />
      </mesh>

      <mesh rotation-x={-Math.PI / 2} position={[(RESTRICTED_ZONE.min.x + RESTRICTED_ZONE.max.x) / 2, 0.01, (RESTRICTED_ZONE.min.z + RESTRICTED_ZONE.max.z) / 2]}>
        <planeGeometry args={[zoneWidth, zoneDepth]} />
        <meshStandardMaterial color="#c0392b" transparent opacity={0.15} />
      </mesh>

      {OBSTACLES.map((box) => (
        <mesh
          key={`${String(box.min.x)}:${String(box.min.z)}:${box.kind}`}
          position={[(box.min.x + box.max.x) / 2, box.height / 2, (box.min.z + box.max.z) / 2]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[box.max.x - box.min.x, box.height, box.max.z - box.min.z]} />
          <meshStandardMaterial color={COLORS[box.kind]} flatShading />
        </mesh>
      ))}

      <mesh position={[GATE.x, 0.02, GATE.z]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.4, 0.55, 16]} />
        <meshStandardMaterial color="#f1c40f" />
      </mesh>

      <mesh position={[SIDE_DOOR.x - 0.05, 1.2, SIDE_DOOR.z]}>
        <boxGeometry args={[0.1, 2.4, 1.4]} />
        <meshStandardMaterial color="#2980b9" flatShading />
      </mesh>
    </group>
  );
};
