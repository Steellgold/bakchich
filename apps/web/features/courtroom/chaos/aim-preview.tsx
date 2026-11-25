"use client";

// What you see while aiming a tomato: the tomato in hand and the dotted arc up to where it would land.
import type { Vec2 } from "@tribunal/bot/room/layout";
import type { Vec3 } from "@tribunal/bot/room/tomato";
import type { RefObject } from "react";
import type { Group, InstancedMesh } from "three";
import { ToonModel } from "../toon-model";
import { useFrame } from "@react-three/fiber";
import { simulateTomato, tomatoPoint } from "@tribunal/bot/room/tomato";
import { useRef } from "react";
import { Object3D } from "three";

/** Written by the player controller every frame */
export type AimState = {
  /** Where the tomato in hand is, null without tomato */
  hand: Vec3 | null;
  /** Where the throw would start and its velocity at the current charge, null unless aiming */
  origin: Vec3 | null;
  velocity: Vec3;
};

const DOTS = 24;
const REFRESH_MS = 50;
const MOVED = 0.01;
const marker = new Object3D();

export const AimPreview = ({ aimRef, others }: {
  aimRef: RefObject<AimState>;
  others: {
    id: string;
    position: Vec2;
  }[];
}) => {
  const handRef = useRef<Group>(null);
  const dotsRef = useRef<InstancedMesh>(null);
  // Last arc computed: the simulation only reruns when the aim moved noticeably, and at most every REFRESH_MS.
  const lastRef = useRef<{ origin: Vec3; velocity: Vec3; at: number } | null>(null);

  useFrame(() => {
    const { hand, origin, velocity } = aimRef.current;
    const held = handRef.current;
    const dots = dotsRef.current;

    if (held !== null) {
      held.visible = hand !== null;
      if (hand !== null) held.position.set(hand.x, hand.y, hand.z);
    }

    if (dots === null) return;

    dots.visible = origin !== null;

    if (origin === null) {
      lastRef.current = null;
      return;
    }

    const last = lastRef.current;
    const now = performance.now();
    const moved = last === null || Math.abs(origin.x - last.origin.x) + Math.abs(origin.y - last.origin.y) + Math.abs(origin.z - last.origin.z)
      + Math.abs(velocity.x - last.velocity.x) + Math.abs(velocity.y - last.velocity.y) + Math.abs(velocity.z - last.velocity.z) > MOVED;

    if (last !== null && (!moved || now - last.at < REFRESH_MS)) return;

    lastRef.current = { origin: { ...origin }, velocity: { ...velocity }, at: now };

    const { duration } = simulateTomato(origin, velocity, others);

    for (let index = 0; index < DOTS; index += 1) {
      const point = tomatoPoint(origin, velocity, (duration * (index + 1)) / DOTS);
      marker.position.set(point.x, point.y, point.z);
      // The last dot is the landing spot, a bit bigger:
      marker.scale.setScalar(index === DOTS - 1 ? 2 : 1);
      marker.updateMatrix();
      dots.setMatrixAt(index, marker.matrix);
    }

    dots.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <group ref={handRef} visible={false} scale={1.4}>
        <ToonModel url="/models/tomato.gltf" />
      </group>
      <instancedMesh ref={dotsRef} args={[undefined, undefined, DOTS]} frustumCulled={false} visible={false}>
        <sphereGeometry args={[0.07, 8, 6]} />
        <meshBasicMaterial color="#e0242c" />
      </instancedMesh>
    </>
  );
};
