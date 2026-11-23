import type { Trial } from "../court/engine";
import type { Vec2 } from "./layout";
import { GATE, GATE_RADIUS, MAX_SPEED, OBSTACLES, RESTRICTED_ZONE, ROOM, SEATS } from "./layout";
import { canStand, pickDisplayedTrial, World } from "./world";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const trialFor = (id: string, accusedId: string, startedAt: number): Trial => ({
  id,
  channelId: `channel-${id}`,
  accused: { id: accusedId, name: "Accusé" },
  plaintiff: { id: "plaintiff", name: "Plaignant" },
  lawyer: { id: "lawyer", name: "Avocat" },
  crime: "vol de croissant",
  phase: "debate",
  votes: new Map(),
  startedAt: new Date(startedAt),
  phaseEndsAt: startedAt,
});

const join = (world: World, id: string) => world.join({ id, name: id, avatarUrl: null });
const player = (world: World, id: string) => world.players().find((state) => state.id === id);
const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);

// A free spot just in front of the gate, on the public side:
const nearGate: Vec2 = { x: GATE.x, z: GATE.z + GATE_RADIUS / 2 };

describe("World.move", () => {
  it("clamps the distance to the max speed", () => {
    const world = new World();
    join(world, "a");
    const start = player(world, "a")?.position ?? ROOM.spawn;

    world.move("a", { x: start.x, z: start.z - 100 }, 0, 500);
    const end = player(world, "a")?.position ?? start;
    assert.ok(Math.abs(distance(start, end) - MAX_SPEED * 0.5) < 1e-9);
  });

  it("refuses moves into an obstacle or outside the room", () => {
    const world = new World();
    join(world, "a");
    const start = player(world, "a")?.position ?? ROOM.spawn;

    world.move("a", { x: ROOM.width, z: start.z }, 0, 100_000);
    assert.deepEqual(player(world, "a")?.position, start);

    const bench = OBSTACLES.find((box) => box.kind === "bench");
    assert.ok(bench);
    const center = { x: (bench.min.x + bench.max.x) / 2, z: (bench.min.z + bench.max.z) / 2 };
    world.move("a", center, 0, 100_000);
    assert.deepEqual(player(world, "a")?.position, start);
  });

  it("keeps players without a role out of the restricted zone", () => {
    const world = new World();
    join(world, "a");
    world.move("a", nearGate, 0, 100_000);
    const inside = { x: GATE.x, z: RESTRICTED_ZONE.max.z - 0.5 };

    world.move("a", inside, 0, 100_000);
    assert.deepEqual(player(world, "a")?.position, nearGate);
  });

  it("lets convoked players walk in the restricted zone", () => {
    const world = new World();
    join(world, "accused");
    world.setTrial(trialFor("t1", "accused", 1));
    world.standUp("accused");
    const seat = SEATS.accused.position;
    const target = { x: seat.x + 0.5, z: seat.z + 0.5 };

    world.move("accused", target, 0, 100_000);
    assert.deepEqual(player(world, "accused")?.position, target);
  });
});

describe("World jurors", () => {
  it("seats a juror near the gate, refuses far away and when full", () => {
    const world = new World();
    join(world, "far");
    assert.equal(world.becomeJuror("far"), "too-far");

    for (let index = 0; index < SEATS.jury.length; index += 1) {
      join(world, `j${String(index)}`);
      world.move(`j${String(index)}`, nearGate, 0, 100_000);
      assert.equal(world.becomeJuror(`j${String(index)}`), "seated");
    }
    const juror = player(world, "j0");
    assert.equal(juror?.seatId, SEATS.jury[0]?.id);
    assert.deepEqual(juror?.position, SEATS.jury[0]?.position);

    join(world, "late");
    world.move("late", nearGate, 0, 100_000);
    assert.equal(world.becomeJuror("late"), "full");
  });

  it("frees the seat when a juror leaves", () => {
    const world = new World();
    for (let index = 0; index < SEATS.jury.length; index += 1) {
      join(world, `j${String(index)}`);
      world.move(`j${String(index)}`, nearGate, 0, 100_000);
      world.becomeJuror(`j${String(index)}`);
    }
    world.leave("j3");
    join(world, "next");
    world.move("next", nearGate, 0, 100_000);
    assert.equal(world.becomeJuror("next"), "seated");
  });
});

describe("World benches", () => {
  const seat = SEATS.benches[0];
  assert.ok(seat);
  const approach: Vec2 = { x: seat.position.x, z: seat.position.z - 1 };

  it("seats a nearby standing player facing the judge and ignores seated movement", () => {
    const world = new World();
    join(world, "spectator");
    world.move("spectator", approach, 0, 100_000);

    world.sitOnBench("spectator");
    assert.equal(player(world, "spectator")?.seatId, seat.id);
    assert.deepEqual(player(world, "spectator")?.position, seat.position);
    assert.equal(player(world, "spectator")?.rotation, seat.rotation);
    assert.equal(player(world, "spectator")?.role, null);

    world.sitOnBench("spectator");
    assert.equal(player(world, "spectator")?.seatId, seat.id);
    world.move("spectator", ROOM.spawn, 0, 100_000);
    assert.deepEqual(player(world, "spectator")?.position, seat.position);
    assert.equal(player(world, "spectator")?.rotation, seat.rotation);
  });

  it("ignores missing or distant players and only allows seats within 1.25 meters", () => {
    const world = new World();
    world.sitOnBench("missing");
    assert.equal(world.players().length, 0);

    join(world, "spectator");
    world.sitOnBench("spectator");
    assert.equal(player(world, "spectator")?.seatId, null);
    assert.deepEqual(player(world, "spectator")?.position, ROOM.spawn);

    const tooFar = { x: seat.position.x, z: seat.position.z - 1.26 };
    world.move("spectator", tooFar, 0, 100_000);
    world.sitOnBench("spectator");
    assert.equal(player(world, "spectator")?.seatId, null);
    assert.deepEqual(player(world, "spectator")?.position, tooFar);

    world.move("spectator", { x: seat.position.x, z: seat.position.z - 1.25 }, 0, 100_000);
    world.sitOnBench("spectator");
    assert.equal(player(world, "spectator")?.seatId, seat.id);
  });

  it("reserves occupied seats and frees them after standing in front on walkable floor", () => {
    const world = new World();
    for (const id of ["first", "second"]) {
      join(world, id);
      world.move(id, approach, 0, 100_000);
      world.sitOnBench(id);
    }
    assert.equal(player(world, "first")?.seatId, seat.id);
    assert.equal(player(world, "second")?.seatId, null);
    assert.deepEqual(player(world, "second")?.position, approach);

    world.standUp("first");
    const standing = player(world, "first");
    assert.ok(standing);
    assert.equal(standing.seatId, null);
    assert.equal(standing.position.x, seat.position.x);
    assert.ok(standing.position.z < seat.position.z);
    assert.ok(distance(standing.position, seat.position) <= 1.25);
    assert.ok(canStand(standing.position, false));

    world.sitOnBench("second");
    assert.equal(player(world, "second")?.seatId, seat.id);
  });

  it("reuses a seat after its occupant disconnects", () => {
    const world = new World();
    join(world, "first");
    world.move("first", approach, 0, 100_000);
    world.sitOnBench("first");
    world.leave("first");

    join(world, "second");
    world.move("second", approach, 0, 100_000);
    world.sitOnBench("second");
    assert.equal(player(world, "second")?.seatId, seat.id);
  });

  it("keeps spectators on benches between trials while convoked players take their role seat", () => {
    const world = new World();
    join(world, "spectator");
    world.move("spectator", approach, 0, 100_000);
    world.sitOnBench("spectator");

    world.setTrial(trialFor("t1", "someone-else", 1));
    assert.equal(player(world, "spectator")?.seatId, seat.id);
    assert.deepEqual(player(world, "spectator")?.position, seat.position);

    world.setTrial(null);
    assert.equal(player(world, "spectator")?.seatId, seat.id);
    assert.deepEqual(player(world, "spectator")?.position, seat.position);

    world.setTrial(trialFor("t2", "spectator", 2));
    assert.equal(player(world, "spectator")?.role, "accused");
    assert.equal(player(world, "spectator")?.seatId, SEATS.accused.id);
    assert.deepEqual(player(world, "spectator")?.position, SEATS.accused.position);

    join(world, "next");
    world.move("next", approach, 0, 100_000);
    world.sitOnBench("next");
    assert.equal(player(world, "next")?.seatId, seat.id);
  });

  it("does not turn a bench seat into jury membership or restricted access", () => {
    const world = new World();
    join(world, "spectator");
    world.move("spectator", approach, 0, 100_000);
    world.sitOnBench("spectator");
    assert.equal(world.becomeJuror("spectator"), "too-far");
    assert.equal(player(world, "spectator")?.seatId, seat.id);

    world.standUp("spectator");
    world.move("spectator", nearGate, 0, 100_000);
    world.sitOnBench("spectator");
    assert.equal(player(world, "spectator")?.seatId, null);
    assert.deepEqual(player(world, "spectator")?.position, nearGate);

    world.move("spectator", { x: GATE.x, z: RESTRICTED_ZONE.max.z - 0.5 }, 0, 100_000);
    assert.deepEqual(player(world, "spectator")?.position, nearGate);
    assert.equal(player(world, "spectator")?.role, null);
  });
});

describe("World.setTrial", () => {
  it("seats connected convoked players, then resets them and the jurors on change", () => {
    const world = new World();
    join(world, "accused");
    join(world, "juror");
    world.move("juror", nearGate, 0, 100_000);
    world.becomeJuror("juror");

    world.setTrial(trialFor("t1", "accused", 1));
    assert.equal(player(world, "accused")?.role, "accused");
    assert.equal(player(world, "accused")?.seatId, SEATS.accused.id);

    world.setTrial(trialFor("t2", "someone-else", 2));
    assert.equal(player(world, "accused")?.role, null);
    assert.deepEqual(player(world, "accused")?.position, ROOM.spawn);
    assert.equal(player(world, "juror")?.seatId, null);
  });
});

describe("World.join", () => {
  it("replaces an existing connection of the same member", () => {
    const world = new World();
    assert.equal(join(world, "a"), "joined");
    assert.equal(join(world, "a"), "replaced");
    assert.equal(world.players().length, 1);
  });
});

describe("pickDisplayedTrial", () => {
  const older = trialFor("old", "x", 1);
  const newer = trialFor("new", "y", 2);

  it("keeps the current trial while it is still open", () => {
    assert.equal(pickDisplayedTrial(older, [older, newer])?.id, "old");
  });

  it("picks the most recent trial otherwise", () => {
    assert.equal(pickDisplayedTrial(null, [older, newer])?.id, "new");
    assert.equal(pickDisplayedTrial(trialFor("gone", "z", 0), [older, newer])?.id, "new");
  });

  it("returns null without open trials", () => {
    assert.equal(pickDisplayedTrial(older, []), null);
  });
});
