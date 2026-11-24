"use client";

import type { TomatoFlight } from "@/features/courtroom/use-room-socket";
import type { Officer } from "@tribunal/bot/room/chaos";
import type { Vec2 } from "@tribunal/bot/room/layout";
import type { Mesh } from "three";
import { Character } from "../character/character";
import { TOMATO_FLIGHT_MS } from "@/features/courtroom/use-room-socket";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";

const TOMATO_ARC = 1.6;
const HAND_HEIGHT = 1.4;

/** A tomato flying in an arc from the thrower to the target, gone once it lands */
const Tomato = ({ flight, positionOf }: {
  flight: TomatoFlight;
  positionOf: (id: string) => Vec2 | undefined;
}) => {
  const meshRef = useRef<Mesh>(null);

  useFrame(() => {
    const mesh = meshRef.current;
    const from = positionOf(flight.fromId);
    const to = positionOf(flight.toId);

    if (mesh === null || from === undefined || to === undefined) return;

    const progress = Math.min(1, (Date.now() - flight.at) / TOMATO_FLIGHT_MS);
    mesh.visible = progress < 1;
    mesh.position.set(from.x + (to.x - from.x) * progress, HAND_HEIGHT + Math.sin(progress * Math.PI) * TOMATO_ARC, from.z + (to.z - from.z) * progress);
    mesh.rotation.x += 0.3;
  });

  return (
    <mesh ref={meshRef}>
      <icosahedronGeometry args={[0.12, 1]} />
      <meshToonMaterial color="#d8262c" />
    </mesh>
  );
};

/** Flying tomatoes and the police officers who come to break up fights */
export const ChaosEffects = ({ tomatoes, officers, positionOf }: {
  tomatoes: TomatoFlight[];
  officers: Officer[];
  positionOf: (id: string) => Vec2 | undefined;
}) => (
  <>
    {tomatoes.map((flight) => (
      <Tomato key={`${flight.fromId}-${String(flight.at)}`} flight={flight} positionOf={positionOf} />
    ))}
    {officers.map((officer) => (
      <Character
        key={officer.id}
        id={officer.id}
        name="Police"
        avatarUrl={null}
        position={officer.position}
        rotation={officer.rotation}
        seated={false}
        speech={null}
        variant="police"
        interpolate
      />
    ))}
  </>
);
