// Motion constants of the characters: the jump, the window jump, following remote players and the stride.
import { CEILING_MARGIN, CROUCH_S, FLIP_MS, HOP_MS, LEAP_S } from "@tribunal/bot/room/double-jump";
import { CEILING_HEIGHT } from "@tribunal/bot/room/layout";
import { DIVE_MS, FALL_MS } from "@tribunal/bot/room/window-jump";

const JUMP_MS = HOP_MS;
const JUMP_HEIGHT = 0.7;

/** Height of the hips of a standing character, the pivot of the flips; `hip` is the height of that pivot, `pitch` the forward rotation around it (PI: upside down) */
export const HIP = 0.9;
const CEILING_HIP = CEILING_HEIGHT - CEILING_MARGIN - HIP;
/** Seconds to drop from the ceiling to the floor, and to turn feet down again */
export const DROP_S = 1;
const TURN_S = 0.5;
export type Pose = { hip: number; pitch: number };

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const ease = (value: number) => value * value * (3 - 2 * value);

/** Leap to the ceiling (`on`: crouch, then rise while turning over) or drop from it, `age` seconds after the change, starting from the pose the member was in */
export const ceilingPose = (on: boolean, age: number, from: Pose): Pose & { crouch: boolean } => {
  if (on) {
    const rise = ease(clamp01((age - CROUCH_S) / LEAP_S));
    return {
      hip: from.hip + (CEILING_HIP - from.hip) * rise,
      pitch: from.pitch + (Math.PI - from.pitch) * rise,
      crouch: age < CROUCH_S,
    };
  }

  return {
    hip: HIP + (from.hip - HIP) * (1 - clamp01(age / DROP_S) ** 2),
    pitch: from.pitch + (2 * Math.PI - from.pitch) * ease(clamp01(age / TURN_S)),
    crouch: false,
  };
};

/** Apex double jump, `age` seconds in: flips over, falls head first, then turns feet down just before the hero landing */
export const flipPose = (age: number): Pose => {
  const progress = clamp01((age * 1_000) / FLIP_MS);
  return {
    hip: HIP + 0.7 * (1 - progress ** 2) + Math.sin(Math.PI * progress),
    pitch: Math.PI * ease(clamp01(progress / 0.5)) + Math.PI * ease(clamp01((progress - 0.75) / 0.25)),
  };
};

/** Height of a jump started at `jumpAt` (Date.now()), a simple arc, 0 when it is over */
export const jumpHeight = (jumpAt: number): number => {
  const progress = (Date.now() - jumpAt) / JUMP_MS;
  return progress > 0 && progress < 1 ? Math.sin(progress * Math.PI) * JUMP_HEIGHT : 0;
};

/** Height of the feet of a member falling out of the portal, `age` seconds after the fall began: constant gravity, down on the floor after FALL_MS */
export const fallHeight = (age: number, from: number): number => from * Math.max(0, 1 - ((age * 1_000) / FALL_MS) ** 2);

/** How far a diver has gone through the window, `age` seconds after the dive began */
export const diveDistance = (age: number): number => 1.6 * Math.min(1, (age * 1_000) / DIVE_MS);

// Remote members arrive in steps of 100 ms: the character follows them smoothly and reads a little ahead from their last speed.
export const FOLLOW_RATE = 14;
export const TURN_RATE = 12;
export const EXTRAPOLATE_SECONDS = 0.1;
export const STALE_SECONDS = 0.25;
export const STRIDE_PER_METER = 2.4;
