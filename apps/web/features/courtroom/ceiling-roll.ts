import type { Camera } from "three";
import { CROUCH_S, LEAP_S } from "@tribunal/bot/room/double-jump";
import { CEILING_HEIGHT } from "@tribunal/bot/room/layout";
import { Vector3 } from "three";

/** Seconds the camera takes to roll 180 degrees when stuck to the ceiling, and back */
const ROLL_SECONDS = 0.5;
const viewDirection = new Vector3();

/** When the ceiling walk last started or stopped (client clock) */
export type CeilingState = {
  on: boolean;
  at: number;
};

/** Stuck to the ceiling: once the leap has landed the camera mirrors under the ceiling and rolls 180 degrees (the ceiling becomes the floor), and back on release. Advances `roll` (0 to 1) and applies it to the camera. */
export const applyCeilingRoll = (camera: Camera, ceilingRef: { current: CeilingState }, rollRef: { current: number }, ceiling: boolean, delta: number) => {
  if (ceilingRef.current.on !== ceiling) ceilingRef.current = {
    on: ceiling,
    at: performance.now(),
  };

  const reached = ceiling && (performance.now() - ceilingRef.current.at) / 1_000 >= CROUCH_S + LEAP_S;
  const rollStep = delta / ROLL_SECONDS;
  rollRef.current = Math.min(1, Math.max(0, rollRef.current + Math.min(rollStep, Math.max(-rollStep, Number(reached) - rollRef.current))));

  if (rollRef.current > 0) {
    const roll = rollRef.current * rollRef.current * (3 - 2 * rollRef.current);
    camera.getWorldDirection(viewDirection);
    camera.position.y += (CEILING_HEIGHT - 2 * camera.position.y) * roll;
    camera.lookAt(camera.position.x + viewDirection.x * 10, camera.position.y + viewDirection.y * (1 - 2 * roll) * 10, camera.position.z + viewDirection.z * 10);
    camera.rotateZ(Math.PI * roll);
  }
};
