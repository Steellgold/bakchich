// Spider-Man double jump: the gate (hero form, cooldown, apex or not) and the timings shared with apps/web. Discord-free.
import type { PlayerState } from "./world";

/** Length of the ordinary hop (a normal jump), and the part of it around its peak that counts as the apex */
export const HOP_MS = 600;
export const APEX_FROM_MS = 200;
export const APEX_TO_MS = 400;
export const DOUBLE_JUMP_GAP_MS = 1_000;
/** Crouch, then the leap to the ceiling; the camera rolls once the member is stuck there */
export const CROUCH_S = 0.2;
export const LEAP_S = 0.4;
/** Feet stop this far under the ceiling */
export const CEILING_MARGIN = 0.05;
/** Head-first fall of the apex flip, ending in the hero landing */
export const FLIP_MS = 600;

/** What a Space press does for a hero: leap to the ceiling, flip at the apex of a hop, or let go of the ceiling */
export type DoubleJump = "ceiling" | "apex" | "release";

/** `sinceJump`: ms since the last ordinary hop began; `sinceLast`: ms since the last double jump. Null: an ordinary jump. */
export const doubleJump = (player: Pick<PlayerState, "hero" | "seatId" | "air" | "ceiling">, sinceJump: number, sinceLast: number): DoubleJump | null => {
  if (!player.hero || player.seatId !== null || player.air !== null) return null;
  if (player.ceiling) return "release";
  if (sinceLast < DOUBLE_JUMP_GAP_MS || sinceJump >= HOP_MS) return null;

  return sinceJump >= APEX_FROM_MS && sinceJump <= APEX_TO_MS ? "apex" : "ceiling";
};
