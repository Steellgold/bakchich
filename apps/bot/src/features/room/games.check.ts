// Run from apps/bot: node --import @swc-node/register/esm-register src/features/room/games.check.ts
import { Chaos } from "./chaos";
import { findGamePlacement, gamePlayerPositions } from "./game-placement";
import { RPS_SHAKE_MS } from "./games";
import { parseClientMessage } from "./protocol";
import { canStand, World } from "./world";
import assert from "node:assert/strict";

const placement = { position: { x: 0, z: 28 }, rotation: 0 };
const start = (kind: "rps" | "connect4") => {
  const chaos = new Chaos();
  assert.ok(chaos.challenge({ id: "a", name: "Alice" }, "b", kind, 100));
  assert.deepEqual(chaos.answer("b", true, 200, placement), ["a", "b"]);
  return chaos;
};

// A choice stays secret in spectator state until both players lock their choices.
const rps = start("rps");
rps.pickRps("a", "rock", 300);
let round = rps.roomGames()[0];
assert.ok(round?.kind === "rps");
assert.deepEqual(round.picks, { a: null, b: null });
const waitingView = rps.gameView("b", (id) => id);
assert.ok(waitingView?.kind === "rps");
assert.equal(waitingView.theirs, null);
rps.pickRps("a", "paper", 400);
rps.pickRps("b", "scissors", 500);
round = rps.roomGames()[0];
assert.ok(round?.kind === "rps");
assert.deepEqual(round.picks, { a: "rock", b: "scissors" });
assert.equal(round.revealedAt, 500);
const resultView = rps.gameView("a", (id) => id);
assert.ok(resultView?.kind === "rps");
assert.equal(resultView.result, "won");
assert.deepEqual(rps.expireGames(500 + RPS_SHAKE_MS + 2_999), []);
assert.deepEqual(rps.expireGames(500 + RPS_SHAKE_MS + 3_000), ["a", "b"]);

// Turn ownership, the full column, win detection and a final immutable board.
const discs = start("connect4");
discs.dropDisc("b", 0, 250);
discs.dropDisc("outsider", 0, 250);
const initialBoard = discs.roomGames()[0];
assert.ok(initialBoard?.kind === "connect4");
assert.equal(initialBoard.board[0]?.[0], null);
for (let index = 0; index < 3; index += 1) {
  discs.dropDisc("a", 0, 300 + index * 200);
  discs.dropDisc("b", 1, 400 + index * 200);
}
discs.dropDisc("a", 0, 1_000);
const board = discs.roomGames()[0];
assert.ok(board?.kind === "connect4");
assert.equal(board.winner, "a");
assert.deepEqual(board.lastDrop, { column: 0, row: 3, playerId: "a", at: 1_000 });
discs.dropDisc("b", 2, 1_001);
assert.equal(board.board[2]?.[0], null);
assert.equal(discs.challenge({ id: "a", name: "Alice" }, "c", "rps", 1_100), null);
assert.deepEqual(discs.quitGame("b"), ["a", "b"]);
assert.equal(discs.gameView("a", (id) => id), null);

const hover = start("connect4");
hover.hoverColumn("a", 1, 300);
hover.hoverColumn("a", 2, 399);
assert.equal(hover.roomGames()[0]?.hovered.a, 1);
hover.hoverColumn("a", 6, 400);
hover.hoverColumn("outsider", 0, 500);
assert.equal(hover.roomGames()[0]?.hovered.a, 6);
assert.equal(hover.roomGames()[0]?.hovered.outsider, undefined);
assert.equal(parseClientMessage("{\"type\":\"game-hover\",\"column\":7}"), null);
assert.equal(parseClientMessage("{\"type\":\"game-hover\",\"column\":1.5}"), null);

// A game without any action ends after two minutes and releases both players.
const idle = start("connect4");
idle.hoverColumn("a", 1, 1_000);
assert.deepEqual(idle.expireGames(1_000 + 120_000), []);
assert.deepEqual(idle.expireGames(1_000 + 120_001), ["a", "b"]);
assert.equal(idle.gameView("a", (id) => id), null);

// Expired invitations cannot create a game, and a declined challenge is removed.
const expired = new Chaos();
expired.challenge({ id: "a", name: "Alice" }, "b", "rps", 0);
assert.equal(expired.answer("b", true, 20_001, placement), null);
expired.challenge({ id: "a", name: "Alice" }, "b", "rps", 30_000);
assert.equal(expired.answer("b", false, 30_001), null);
assert.equal(expired.pendingChallenge("b"), undefined);

// Placement avoids fixed scenery, bystanders and already active tables.
const world = new World();
world.join({ id: "a", name: "Alice", avatarUrl: null });
world.join({ id: "b", name: "Bob", avatarUrl: null });
const a = world.player("a");
const b = world.player("b");
assert.ok(a !== undefined && b !== undefined);
a.position = { x: 5, z: 19.3 };
b.position = { x: 6, z: 19.3 };
const found = findGamePlacement([a, b], world.players(), []);
assert.ok(found !== null);
assert.ok(found.position.z > 13.6);
const positions = gamePlayerPositions(found);
for (const position of positions) assert.ok(canStand(position, "public"));
assert.ok(Math.abs(Math.hypot(positions[0].x - positions[1].x, positions[0].z - positions[1].z) - 1.1) < 1e-9);
const activeGame = hover.roomGames()[0];
assert.ok(activeGame?.kind === "connect4");
const occupied = { ...activeGame, ...found };
const next = findGamePlacement([a, b], world.players(), [occupied]);
assert.ok(next !== null && Math.hypot(next.position.x - found.position.x, next.position.z - found.position.z) >= 2);

// Server movement and seat changes remain blocked even if a client ignores its camera lock.
world.placeForGame("a", positions[0], found.rotation);
const before = { ...a.position };
assert.equal(world.move("a", { x: before.x + 0.1, z: before.z }, 1, 1), 0);
world.sitOnBench("a");
world.standUp("a");
assert.equal(world.becomeJuror("a"), "too-far");
assert.deepEqual(a.position, before);
assert.equal(a.seatId, null);
world.releaseGame(["a"]);
assert.ok(world.move("a", { x: before.x + 0.1, z: before.z }, 1, 1) > 0);

console.log("minigame rules, privacy, placement, hover throttle and movement locks ok");
