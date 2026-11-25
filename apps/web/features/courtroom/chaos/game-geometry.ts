// Board game geometry shared by the world hands (board-game.tsx) and the reaching arm (character/game-motion.ts).
import type { Vector3 } from "three";
import { RPS_SHAKE_MS } from "@tribunal/bot/room/games";

export const CELL_PITCH = 0.072;
export const HAND_SCALE = 0.65;

/** Where a hand rests on its own edge of the table, in board space. */
export const restPosition = (sign: number, out: Vector3) => out.set(sign * 0.17, 1.22, sign * 0.48);

/** Where the hand of the player whose turn it is hovers above the chosen column, or rests. */
export const connect4HandTarget = (sign: number, column: number, active: boolean, out: Vector3) => active ? out.set((column - 3) * CELL_PITCH + sign * 0.044 * HAND_SCALE, 1.60 + 0.064 * HAND_SCALE, sign * 0.383 * HAND_SCALE) : restPosition(sign, out);

/** Fist height of the rock-paper-scissors hand: three shakes after the reveal. */
export const rpsHandTarget = (sign: number, revealedAt: number | null, out: Vector3) => {
  const age = revealedAt === null ? -1 : Date.now() - revealedAt;
  const wave = age >= 0 && age < RPS_SHAKE_MS ? Math.sin((age / RPS_SHAKE_MS) * Math.PI * 6) : 0;
  return { target: out.set(sign * 0.17, 1.23 + wave * 0.085, sign * 0.25), wave };
};
