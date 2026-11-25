// Motion constants of the characters: the jump, the window jump, following remote players and the stride.
import { DIVE_MS, FALL_MS } from "@tribunal/bot/room/window-jump";

const JUMP_MS = 600;
const JUMP_HEIGHT = 0.7;

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
