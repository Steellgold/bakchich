// Ballistic flight of a free-aimed tomato, simulated by the room server and previewed by the client (relative imports only, shared with apps/web).
import type { Vec2 } from "./layout";
import { CEILING_HEIGHT, OBSTACLES, PLAYER_RADIUS } from "./layout";

export type Vec3 = {
  x: number;
  y: number;
  z: number;
};

export type TomatoImpact = {
  kind: "player";
  id: string;
} | {
  kind: "surface";
  point: Vec3;
  /** Unit vector pointing out of the surface */
  normal: Vec3;
};

export const TOMATO_GRAVITY = 9.8;
export const TOMATO_STEP_S = 0.02;
export const TOMATO_MAX_S = 3;
/** The power gauge fills in this long */
export const TOMATO_CHARGE_S = 1.2;
const MIN_SPEED = 6;
const MAX_SPEED = 15;
const CEILING = CEILING_HEIGHT;
/** Hit zone of a player: a vertical cylinder, a bit wider than their collision radius, head included */
const BODY_RADIUS = PLAYER_RADIUS + 0.1;
const BODY_HEIGHT = 1.9;

/** Launch speed for a power from 0 to 1 */
export const tomatoSpeed = (power: number) => MIN_SPEED + (MAX_SPEED - MIN_SPEED) * Math.min(1, Math.max(0, power));

/** Where the tomato is `t` seconds after the throw */
export const tomatoPoint = (origin: Vec3, velocity: Vec3, t: number): Vec3 => ({
  x: origin.x + velocity.x * t,
  y: origin.y + velocity.y * t - 0.5 * TOMATO_GRAVITY * t * t,
  z: origin.z + velocity.z * t,
});

const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});

/** Entry of the segment a to b into a box: fraction along the segment and the face normal, null if it misses or starts inside */
const enterBox = (a: Vec3, b: Vec3, min: Vec3, max: Vec3): { t: number; normal: Vec3 } | null => {
  let tEnter = 0;
  let tExit = 1;
  let normal: Vec3 = {
    x: 0,
    y: 0,
    z: 0,
  };

  for (const axis of ["x", "y", "z"] as const) {
    const delta = b[axis] - a[axis];

    if (delta === 0) {
      if (a[axis] < min[axis] || a[axis] > max[axis]) return null;
      continue;
    }

    const t1 = (min[axis] - a[axis]) / delta;
    const t2 = (max[axis] - a[axis]) / delta;
    const near = Math.min(t1, t2);

    if (near > tEnter) {
      tEnter = near;
      normal = {
        x: 0,
        y: 0,
        z: 0,
        [axis]: delta > 0 ? -1 : 1,
      };
    }

    tExit = Math.min(tExit, Math.max(t1, t2));

    if (tEnter > tExit) return null;
  }

  // Starting inside the box (a thrower against a wall): no entry face, ignore it.
  return normal.x === 0 && normal.y === 0 && normal.z === 0 ? null : {
    t: tEnter,
    normal,
  };
};

/** Entry of the segment a to b into a vertical cylinder standing on the floor: fraction along the segment, null if it misses */
const enterBody = (a: Vec3, b: Vec3, center: Vec2): number | null => {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const fx = a.x - center.x;
  const fz = a.z - center.z;
  const quad = dx * dx + dz * dz;
  const half = fx * dx + fz * dz;
  const gap = fx * fx + fz * fz - BODY_RADIUS * BODY_RADIUS;

  if (gap <= 0) return a.y >= 0 && a.y <= BODY_HEIGHT ? 0 : null;

  if (quad === 0) return null;

  const discriminant = half * half - quad * gap;

  if (discriminant < 0) return null;

  const t = (-half - Math.sqrt(discriminant)) / quad;
  const y = a.y + (b.y - a.y) * t;
  return t >= 0 && t <= 1 && y >= 0 && y <= BODY_HEIGHT ? t : null;
};

/**
 * Flies a tomato in steps of TOMATO_STEP_S against the players (the thrower excluded), the room boxes, the floor and the ceiling.
 * Returns when it lands (seconds after the throw) and what it hit, null if nothing in TOMATO_MAX_S.
 */
export const simulateTomato = (
  origin: Vec3,
  velocity: Vec3,
  players: { id: string; position: Vec2 }[],
): { duration: number; impact: TomatoImpact | null } => {
  for (let t = 0; t < TOMATO_MAX_S; t += TOMATO_STEP_S) {
    const from = tomatoPoint(origin, velocity, t);
    const to = tomatoPoint(origin, velocity, t + TOMATO_STEP_S);
    // What this step crosses, as a fraction of the step:
    const hits: { t: number; impact: TomatoImpact }[] = [];
    const consider = (fraction: number, impact: TomatoImpact) => hits.push({
      t: fraction,
      impact,
    });

    for (const player of players) {
      const fraction = enterBody(from, to, player.position);
      if (fraction !== null) consider(fraction, {
        kind: "player",
        id: player.id,
      });
    }

    for (const box of OBSTACLES) {
      const hit = enterBox(
        from,
        to,
        {
          x: box.min.x,
          y: 0,
          z: box.min.z,
        },
        {
          x: box.max.x,
          y: box.height,
          z: box.max.z,
        },
      );
      if (hit !== null) consider(hit.t, {
        kind: "surface",
        point: lerp(from, to, hit.t),
        normal: hit.normal,
      });
    }

    if (to.y <= 0) {
      const fraction = from.y / (from.y - to.y);
      consider(fraction, {
        kind: "surface",
        point: {
          ...lerp(from, to, fraction),
          y: 0,
        },
        normal: {
          x: 0,
          y: 1,
          z: 0,
        },
      });
    }
    else if (to.y >= CEILING) {
      const fraction = (CEILING - from.y) / (to.y - from.y);
      consider(fraction, {
        kind: "surface",
        point: lerp(from, to, fraction),
        normal: {
          x: 0,
          y: -1,
          z: 0,
        },
      });
    }

    const first = hits.sort((a, b) => a.t - b.t)[0];

    if (first !== undefined) return {
      duration: t + first.t * TOMATO_STEP_S,
      impact: first.impact,
    };
  }

  return {
    duration: TOMATO_MAX_S,
    impact: null,
  };
};
