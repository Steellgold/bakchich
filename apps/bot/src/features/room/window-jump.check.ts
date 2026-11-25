// Self-check of the window jump: node --import @swc-node/register/esm-register src/features/room/window-jump.check.ts (from apps/bot)
import type { PlayerState } from "./world";
import { AWAY_MS, COOLDOWN_MS, DIVE_MS, FALL_MS, FLOP_MS, HERO_MS, landingKind, WindowJumps, windowAt } from "./window-jump";
import assert from "node:assert/strict";

// Running at the right wall (facing +x) in the opening of the window at z 17, or the left wall at z 25:
assert.deepEqual(windowAt({ x: 9.7, z: 17.4 }, Math.PI / 2), { side: 1, z: 17 });
assert.deepEqual(windowAt({ x: -9.7, z: 24.5 }, -Math.PI / 2), { side: -1, z: 25 });
// Beside the opening, away from the wall, along the wall, or facing the room: no dive.
assert.equal(windowAt({ x: 9.7, z: 18 }, Math.PI / 2), null);
assert.equal(windowAt({ x: 8, z: 17 }, Math.PI / 2), null);
assert.equal(windowAt({ x: 9.7, z: 17 }, 0), null);
assert.equal(windowAt({ x: 9.7, z: 17 }, -Math.PI / 2), null);

assert.equal(landingKind(true), "hero");
assert.equal(landingKind(false), "flop");

const player: PlayerState = {
  id: "a",
  name: "A",
  avatarUrl: null,
  position: { x: 9.7, z: 17 },
  rotation: Math.PI / 2,
  seatId: null,
  role: null,
  air: null,
  suit: "red",
  hero: false,
  ceiling: false,
};
const jumps = new WindowJumps();
const tick = (now: number) => jumps.tick(now, () => player, () => []);

assert.equal(jumps.start(player, 1_000)?.type, "window-break");
assert.equal(player.air, "dive");
tick(1_000 + DIVE_MS);
assert.equal(player.air, "away");
assert.deepEqual(tick(1_000 + AWAY_MS).map((message) => message.type), ["portal-open", "shake"]);
assert.equal(player.air, "fall");
jumps.hold("a", true);
const landed = tick(1_000 + AWAY_MS + FALL_MS);
assert.equal(player.air, "hero");
assert.equal(player.hero, true);
assert.equal(landed[0]?.type === "landing" && landed[0].kind, "hero");
const ended = tick(1_000 + AWAY_MS + FALL_MS + HERO_MS);
assert.equal(player.air, null);
assert.ok(ended.some((message) => message.type === "portal-close"));

// Cooldown: no second dive before COOLDOWN_MS, then it works again; a released Space gives the belly flop.
player.position = { x: 9.7, z: 17 };
player.rotation = Math.PI / 2;
assert.equal(jumps.start(player, 1_000 + COOLDOWN_MS - 1), null);
assert.equal(jumps.start(player, 1_000 + COOLDOWN_MS)?.type, "window-break");
tick(1_000 + COOLDOWN_MS + DIVE_MS);
tick(1_000 + COOLDOWN_MS + AWAY_MS);
tick(1_000 + COOLDOWN_MS + AWAY_MS + FALL_MS);
assert.equal(player.air, "flop");
tick(1_000 + COOLDOWN_MS + AWAY_MS + FALL_MS + FLOP_MS);
assert.equal(player.air, null);

console.log("window jump ok");
