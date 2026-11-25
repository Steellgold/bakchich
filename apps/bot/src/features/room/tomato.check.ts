// Self-check of the tomato ballistics: node --import @swc-node/register/esm-register apps/bot/src/features/room/tomato.check.ts
import { simulateTomato, tomatoSpeed } from "./tomato";
import assert from "node:assert/strict";

const players = [{ id: "victim", position: { x: 0, z: 20 } }];
const origin = { x: 0, y: 1.7, z: 24 };
const speed = tomatoSpeed(1);

// Flat throw at a player 4 m away: hits them.
const hit = simulateTomato(origin, { x: 0, y: 1, z: -speed }, players);
assert.deepEqual(hit.impact, { kind: "player", id: "victim" });

// Aimed at the floor: lands on it, normal up.
const floor = simulateTomato(origin, { x: 0, y: 0, z: -3 }, []);
assert.deepEqual(floor.impact?.kind === "surface" && floor.impact.normal, { x: 0, y: 1, z: 0 });

// Towards the left wall: splat on it, normal pointing back into the room (+x).
const wall = simulateTomato({ x: -5, y: 1.7, z: 28 }, { x: -speed, y: 2, z: 0 }, []);
assert.equal(wall.impact?.kind === "surface" && wall.impact.normal.x, 1);

// A bench stops a flat throw before the player behind it.
const behind = simulateTomato({ x: 5, y: 1, z: 28 }, { x: 0, y: 0, z: -speed }, [{ id: "far", position: { x: 5, z: 2 } }]);
assert.equal(behind.impact?.kind, "surface");

// The thrower's own cylinder is never in the list, and a quick shot cannot tunnel through a thin rail.
const rail = simulateTomato({ x: -5, y: 0.9, z: 15 }, { x: 0, y: 0, z: -speed }, []);
assert.ok(rail.impact?.kind === "surface" && Math.abs(rail.impact.point.z - 13.3) < 0.01);

console.log("tomato ballistics ok");
