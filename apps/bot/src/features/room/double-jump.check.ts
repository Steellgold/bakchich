// Self-check of the double jump gate: node --import @swc-node/register/esm-register src/features/room/double-jump.check.ts (from apps/bot)
import type { PlayerState } from "./world";
import { APEX_FROM_MS, doubleJump, DOUBLE_JUMP_GAP_MS, FLIP_MS, HOP_MS } from "./double-jump";
import { HERO_MS, WindowJumps } from "./window-jump";
import assert from "node:assert/strict";

const hero = {
  hero: true,
  seatId: null,
  air: null,
  ceiling: false,
} as const;
const long = DOUBLE_JUMP_GAP_MS;

// Only heroes, standing and free, in the air of a hop:
assert.equal(doubleJump({ ...hero, hero: false }, 300, long), null);
assert.equal(doubleJump({ ...hero, seatId: "bench-1" }, 300, long), null);
assert.equal(doubleJump({ ...hero, air: "dive" }, 300, long), null);
assert.equal(doubleJump(hero, HOP_MS, long), null);
// Cooldown of about one second:
assert.equal(doubleJump(hero, 300, long - 1), null);
// Near the peak of the hop: the flip; early or late in the hop: the leap to the ceiling.
assert.equal(doubleJump(hero, 300, long), "apex");
assert.equal(doubleJump(hero, APEX_FROM_MS - 1, long), "ceiling");
assert.equal(doubleJump(hero, HOP_MS - 1, long), "ceiling");
// On the ceiling, Space lets go (even inside the cooldown):
assert.equal(doubleJump({ ...hero, ceiling: true }, 5_000, 0), "release");
assert.equal(doubleJump({ ...hero, hero: false, ceiling: true }, 5_000, 0), null);

// The flip ends in the hero landing.
const player: PlayerState = {
  id: "a",
  name: "A",
  avatarUrl: null,
  position: { x: 0, z: 20 },
  rotation: 0,
  seatId: null,
  role: null,
  air: null,
  suit: "red",
  hero: true,
  ceiling: false,
};
const jumps = new WindowJumps();
jumps.flip(player, 0);
assert.equal(player.air, "flip");
assert.equal(jumps.tick(FLIP_MS, () => player, () => [])[0]?.type, "landing");
assert.equal(player.air, "hero");
jumps.tick(FLIP_MS + HERO_MS, () => player, () => []);
assert.equal(player.air, null);

console.log("double jump ok");
