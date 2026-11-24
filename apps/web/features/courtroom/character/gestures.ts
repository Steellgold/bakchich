// Motion constants of the characters: the jump, following remote players and the stride.

const JUMP_MS = 600;
const JUMP_HEIGHT = 0.7;

/** Height of a jump started at `jumpAt` (Date.now()), a simple arc, 0 when it is over */
export const jumpHeight = (jumpAt: number): number => {
  const progress = (Date.now() - jumpAt) / JUMP_MS;
  return progress > 0 && progress < 1 ? Math.sin(progress * Math.PI) * JUMP_HEIGHT : 0;
};

// Remote members arrive in steps of 100 ms: the character follows them smoothly and reads a little ahead from their last speed.
export const FOLLOW_RATE = 14;
export const TURN_RATE = 12;
export const EXTRAPOLATE_SECONDS = 0.1;
export const STALE_SECONDS = 0.25;
export const STRIDE_PER_METER = 2.4;
