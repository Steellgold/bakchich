// Courtroom geometry shared by the server simulation and the web client (relative imports only).
// Units are meters. x goes from left (-) to right (+), z from the judge wall (0) to the entrance (ROOM.depth).
// Rotation is around the vertical axis: 0 faces the entrance (+z), PI faces the judge (-z).

export type Vec2 = {
  x: number;
  z: number;
};
export type Box = {
  min: Vec2;
  max: Vec2;
  height: number;
  kind: "wall" | "bench" | "desk" | "rail" | "stand" | "cabinet";
};
export type Seat = {
  id: string;
  position: Vec2;
  rotation: number;
};

/** Name of the judge, also the name to give the bot account in the Discord developer portal */
export const JUDGE_NAME = "Juge Bakchich";

export const MAX_SPEED = 4;
/** Holding Shift */
export const RUN_SPEED = 7;
export const GATE_RADIUS = 1.5;
export const TICK_MS = 100;
/** Collision radius of a character */
export const PLAYER_RADIUS = 0.3;

const HALF_WIDTH = 10;
const DEPTH = 30;
const RAIL_Z = 13;

export const ROOM = {
  width: HALF_WIDTH * 2,
  depth: DEPTH,
  spawn: {
    x: 0,
    z: 28,
  },
};

export const RESTRICTED_ZONE = {
  min: {
    x: -HALF_WIDTH,
    z: 0,
  },
  max: {
    x: HALF_WIDTH,
    z: RAIL_Z,
  },
};

/** The open area in front of the judge between the counsel desks: only counsel may walk in it, and only while a witness is on the stand */
export const WELL = {
  min: {
    x: -5,
    z: 3.5,
  },
  max: {
    x: 4.5,
    z: 12.7,
  },
};

/** Interaction point of the rail gate, on the public side */
export const GATE: Vec2 = {
  x: 0,
  z: RAIL_Z + 0.6,
};

/** The archive cabinet in the back-left corner, full of the clerk's files, and where to stand to read them */
export const ARCHIVES: Vec2 = {
  x: -8.6,
  z: 28.4,
};
export const ARCHIVES_RADIUS = 1.4;

/** The entrance door, in the middle of the back wall: members come in and go out through it */
export const ENTRANCE: Vec2 = {
  x: 0,
  z: DEPTH,
};
export const ENTRANCE_WIDTH = 1.6;

/** Side door on the right wall, where the police comes in */
export const SIDE_DOOR: Vec2 = {
  x: HALF_WIDTH,
  z: 11,
};

/** Section centres of the windows on both side walls, and how far from a centre a diving member still fits through */
export const WINDOW_ZS = [5, 17, 25];
export const WINDOW_HALF_OPENING = 0.6;

const box = (minX: number, minZ: number, maxX: number, maxZ: number, height: number, kind: Box["kind"]): Box => ({
  min: {
    x: minX,
    z: minZ,
  },
  max: {
    x: maxX,
    z: maxZ,
  },
  height,
  kind,
});

const BENCH_ROWS = [16, 19, 22, 25];
const BENCH_SIDES = [
  [-9, -2],
  [2, 9],
] as const;
const SEATS_PER_BENCH = 6;
const BENCH_DEPTH = 0.6;

export const OBSTACLES: Box[] = [
  // Walls:
  box(-HALF_WIDTH - 0.5, -0.5, HALF_WIDTH + 0.5, 0, 4, "wall"),
  box(-HALF_WIDTH - 0.5, DEPTH, HALF_WIDTH + 0.5, DEPTH + 0.5, 4, "wall"),
  box(-HALF_WIDTH - 0.5, 0, -HALF_WIDTH, DEPTH, 4, "wall"),
  box(HALF_WIDTH, 0, HALF_WIDTH + 0.5, DEPTH, 4, "wall"),
  // Judge stand, clerk desk and witness stand:
  box(-3, 1, 3, 3, 1.5, "stand"),
  box(-8, 1, -5, 2.5, 1, "desk"),
  box(5, 1, 8, 2.5, 1.2, "stand"),
  // Accused box front rail:
  box(-8.5, 6, -5.5, 6.3, 1, "rail"),
  // Prosecutor and defense desks:
  box(-4, 7, -1, 8, 0.9, "desk"),
  box(1, 7, 4, 8, 0.9, "desk"),
  // Jury box rail:
  box(4.8, 5, 5, 12, 1, "rail"),
  // Balustrade with the gate gap in the middle:
  box(-HALF_WIDTH, RAIL_Z, -1, RAIL_Z + 0.3, 1, "rail"),
  box(1, RAIL_Z, HALF_WIDTH, RAIL_Z + 0.3, 1, "rail"),
  // Archive cabinet against the back wall:
  box(-9.8, 29.2, -7.4, DEPTH, 2.4, "cabinet"),
  // Public benches:
  ...BENCH_ROWS.flatMap((z) => BENCH_SIDES.map(([minX, maxX]) => box(minX, z, maxX, z + BENCH_DEPTH, 0.5, "bench"))),
];

const seat = (id: string, x: number, z: number, rotation: number): Seat => ({
  id,
  position: { x, z },
  rotation,
});

export const SEATS = {
  judge: seat("judge", 0, 2, 0),
  // One seat per possible accused (MAX_ACCUSED in the court engine, keep both equal):
  accused: Array.from({ length: 5 }, (_, index) => seat(`accused-${String(index)}`, -7, 7.5 + index, Math.PI / 2)),
  prosecutor: seat("prosecutor", -2.5, 9, Math.PI),
  defense: seat("defense", 2.5, 9, Math.PI),
  // Inside the witness stand, facing the room:
  witness: seat("witness", 6.5, 1.75, 0),
  jury: Array.from({ length: 12 }, (_, index) => seat(`jury-${String(index)}`, index % 2 === 0 ? 6.5 : 8.5, 5.5 + Math.floor(index / 2) * 1.1, -Math.PI / 2)),
  benches: BENCH_ROWS.flatMap((z, row) => BENCH_SIDES.flatMap(([minX, maxX], side) => Array.from({ length: SEATS_PER_BENCH }, (_, index) => seat(`bench-${String(row)}-${String(side)}-${String(index)}`, minX + ((maxX - minX) / SEATS_PER_BENCH) * (index + 0.5), z + BENCH_DEPTH / 2, Math.PI)),
  ),
  ),
};
