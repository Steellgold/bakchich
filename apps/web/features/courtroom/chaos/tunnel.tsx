"use client";

// What the jumper sees while away: a purple tunnel built far above the room (the camera goes there, see player-controller.tsx),
// with streaks rushing up past a falling character and crackling lightning.
import type { PlayerState } from "@tribunal/bot/room/world";
import type { InstancedMesh } from "three";
import { Character } from "../character/character";
import { Bolts } from "./lightning";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending, BackSide, Object3D } from "three";

/** Centre of the tunnel, far above the courtroom */
export const TUNNEL = {
  x: 0,
  y: 200,
  z: 0,
};
const STREAKS = 80;
const RADIUS = 7;
const HEIGHT = 30;
const BOLTS = 5;

type Point = [number, number, number];

/** A random point of the tunnel, `inner` to RADIUS meters from the axis */
const randomPoint = (inner: number): Point => {
  const angle = Math.random() * Math.PI * 2;
  const radius = inner + Math.random() * (RADIUS - inner - 1);
  return [Math.cos(angle) * radius, (Math.random() - 0.5) * HEIGHT * 0.4, Math.sin(angle) * radius];
};

/** Thin streaks that rush upwards, as the jumper falls down the tunnel */
const Streaks = () => {
  const meshRef = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const streaks = useMemo(
    () => Array.from({ length: STREAKS }, () => {
      const [x, , z] = randomPoint(1.2);
      return {
        x,
        z,
        length: 2 + Math.random() * 5,
        speed: 25 + Math.random() * 25,
        offset: Math.random() * HEIGHT,
      };
    }),
    [],
  );

  useFrame((state) => {
    const mesh = meshRef.current;

    if (mesh === null) return;

    for (const [index, streak] of streaks.entries()) {
      const y = ((streak.offset + state.clock.elapsedTime * streak.speed) % HEIGHT) - HEIGHT / 2;
      dummy.position.set(streak.x, y, streak.z);
      dummy.scale.set(1, streak.length, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, STREAKS]} frustumCulled={false}>
      <boxGeometry args={[0.04, 1, 0.04]} />
      <meshBasicMaterial color="#d9c2ff" transparent opacity={0.85} depthWrite={false} blending={AdditiveBlending} />
    </instancedMesh>
  );
};

/** The jumper falling down the tunnel, seen from the front */
export const Tunnel = ({ self }: { self: PlayerState }) => (
  <group position={[TUNNEL.x, TUNNEL.y, TUNNEL.z]}>
    <mesh>
      <cylinderGeometry args={[RADIUS, RADIUS, HEIGHT, 24, 1, true]} />
      <meshBasicMaterial color="#1b0a33" side={BackSide} />
    </mesh>
    <Streaks />
    <Bolts count={BOLTS} jitter={0.6} width={3} ends={() => [randomPoint(2), randomPoint(2)]} />
    <Character
      id={self.id}
      name={self.name}
      avatarUrl={self.avatarUrl}
      position={{
        x: 0,
        z: 0,
      }}
      elevation={0}
      rotation={0}
      seated={false}
      speech={null}
      air="fall"
      fallFrom={0}
    />
  </group>
);
