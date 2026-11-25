import type { Trial } from "../court/engine";
import type { Seat, Vec2 } from "./layout";
import { GATE, GATE_RADIUS, OBSTACLES, PLAYER_RADIUS, ROOM, SEATS } from "./layout";

export type Role = "accused" | "prosecutor" | "defense" | "witness";

/** Where a member is in a window jump: diving out, away outside, falling out of the portal, or landing (belly flop or superhero); "flip" is the head-first fall of a double jump at the apex, ending in the hero landing */
export type Air = "dive" | "away" | "fall" | "flop" | "hero" | "flip";

/** Spider-Man suits worn for the hero landing, chosen with Tab (the server only stores and broadcasts the choice) */
export const SUITS = ["red", "black", "venom"] as const;
export type Suit = (typeof SUITS)[number];

export type PlayerState = {
  id: string;
  name: string;
  avatarUrl: string | null;
  position: Vec2;
  rotation: number;
  seatId: string | null;
  role: Role | null;
  air: Air | null;
  suit: Suit;
  /** In the Spider-Man form (set by the hero landing) until the member leaves: the suit is worn and the web replaces the tomato */
  hero: boolean;
  /** Stuck to the ceiling by a double jump (hero only): walks there upside down until released */
  ceiling: boolean;
};

const ROLE_SEATS: Record<"prosecutor" | "defense" | "witness", Seat> = {
  prosecutor: SEATS.prosecutor,
  defense: SEATS.defense,
  witness: SEATS.witness,
};
const BENCH_REACH = 1.25;

/** How close to their own seat a standing party must be to sit down again */
export const SEAT_REACH = 1.25;

/** Seat of a role in the trial: accused take the seats of the box in order, the others have their own */
export const seatForRole = (
  role: Role,
  trial: {
    accused: {
      id: string;
    }[];
  } | null,
  id: string,
): Seat | undefined => (role === "accused" ? SEATS.accused[trial?.accused.findIndex((member) => member.id === id) ?? -1] : ROLE_SEATS[role]);

/** The closest bench seat within reach that no connected player is using. */
export const nearbyBenchSeat = (position: Vec2, occupiedSeats: ReadonlySet<string | null>): Seat | undefined => {
  let closest: Seat | undefined;
  let distance = BENCH_REACH;

  for (const seat of SEATS.benches) {
    if (occupiedSeats.has(seat.id)) continue;

    const gap = Math.hypot(seat.position.x - position.x, seat.position.z - position.z);

    if (gap > distance) continue;

    closest = seat;
    distance = gap;
  }

  return closest;
};

const insideRoom = (point: Vec2) => Math.abs(point.x) <= ROOM.width / 2 - PLAYER_RADIUS && point.z >= PLAYER_RADIUS && point.z <= ROOM.depth - PLAYER_RADIUS;

const collides = (point: Vec2) => OBSTACLES.some(
  (box) => point.x > box.min.x - PLAYER_RADIUS && point.x < box.max.x + PLAYER_RADIUS && point.z > box.min.z - PLAYER_RADIUS && point.z < box.max.z + PLAYER_RADIUS,
);

/** Whether a standing character may be at this point (anyone can walk anywhere, only walls and furniture block), shared with the client for its local prediction */
export const canStand = (point: Vec2): boolean => insideRoom(point) && !collides(point);

/** Step towards `to`, sliding along a wall on one axis when the straight step is blocked; stays at `from` when both are, shared with the client */
export const slide = (from: Vec2, to: Vec2): Vec2 => {
  if (canStand(to)) return to;

  const alongX = {
    x: to.x,
    z: from.z,
  };

  if (canStand(alongX)) return alongX;

  const alongZ = {
    x: from.x,
    z: to.z,
  };
  return canStand(alongZ) ? alongZ : from;
};

/** Longest single step checked by the server: shorter than the thinnest obstacle widened by the player radius, so a move can never cross a rail */
const MAX_STEP = 0.25;

const roleOf = (trial: Trial | null, id: string): Role | null => {
  if (trial === null) return null;
  if (trial.accused.some((member) => member.id === id)) return "accused";
  if (trial.plaintiff.id === id) return "prosecutor";
  if (trial.lawyer?.id === id) return "defense";
  if (trial.witness?.member.id === id) return "witness";

  return null;
};

/** The trial shown in the courtroom: the current one until its verdict, then the most recently opened one */
export const pickDisplayedTrial = (current: Trial | null, open: Trial[]): Trial | null => {
  const stillOpen = current === null ? undefined : open.find((trial) => trial.id === current.id);

  if (stillOpen !== undefined) return stillOpen;

  return open.reduce<Trial | null>((latest, trial) => (latest === null || trial.startedAt > latest.startedAt ? trial : latest), null);
};

/** Server-side courtroom simulation: positions, seats and zones, without any network or Discord code */
export class World {
  private readonly states = new Map<string, PlayerState>();
  private trial: Trial | null = null;
  private readonly gameLocks = new Set<string>();

  public join(player: { id: string; name: string; avatarUrl: string | null }): "joined" | "replaced" {
    const replaced = this.states.has(player.id);
    const state: PlayerState = {
      ...player,
      position: { ...ROOM.spawn },
      rotation: Math.PI,
      seatId: null,
      role: null,
      air: null,
      suit: "red",
      hero: false,
      ceiling: false,
    };
    this.states.set(player.id, state);
    this.assignRole(state);
    return replaced ? "replaced" : "joined";
  }

  public leave(id: string): void {
    this.states.delete(id);
    this.gameLocks.delete(id);
  }

  /**
   * Walk towards a target within a distance budget, in short steps that slide along obstacles and never enter a forbidden zone.
   * Returns the distance walked, so the caller can spend it from the member's budget.
   */
  public move(id: string, target: Vec2, rotation: number, maxDistance: number): number {
    const state = this.states.get(id);

    if (state?.seatId !== null || this.gameLocks.has(id) || state.air !== null) return 0;

    state.rotation = rotation;
    let walked = 0;

    while (walked < maxDistance) {
      const dx = target.x - state.position.x;
      const dz = target.z - state.position.z;
      const left = Math.hypot(dx, dz);

      if (left < 1e-6) break;

      const step = Math.min(MAX_STEP, left, maxDistance - walked);
      const next = slide(
        state.position,
        {
          x: state.position.x + (dx / left) * step,
          z: state.position.z + (dz / left) * step,
        },
      );
      const moved = Math.hypot(next.x - state.position.x, next.z - state.position.z);

      if (moved < 1e-6) break;

      state.position = next;
      walked += moved;
    }

    return walked;
  }

  public becomeJuror(id: string): "seated" | "too-far" | "full" {
    const state = this.states.get(id);

    if (state === undefined || this.gameLocks.has(id) || Math.hypot(state.position.x - GATE.x, state.position.z - GATE.z) > GATE_RADIUS) return "too-far";

    const taken = new Set([...this.states.values()].map((player) => player.seatId));
    const free = SEATS.jury.find((seat) => !taken.has(seat.id));

    if (free === undefined) return "full";

    this.sit(state, free);
    return "seated";
  }

  /** A party who stood up sits back at their own seat when close enough */
  public sitDown(id: string): void {
    const state = this.states.get(id);

    if (state?.seatId !== null || state.role === null || this.gameLocks.has(id)) return;

    const seat = this.seatFor(state.role, id);
    if (seat !== undefined && Math.hypot(state.position.x - seat.position.x, state.position.z - seat.position.z) <= SEAT_REACH) this.sit(state, seat);
  }

  public sitOnBench(id: string): void {
    const state = this.states.get(id);

    if (state?.seatId !== null || this.gameLocks.has(id)) return;

    const occupiedSeats = new Set([...this.states.values()].map((player) => player.seatId));
    const seat = nearbyBenchSeat(state.position, occupiedSeats);
    if (seat !== undefined) this.sit(state, seat);
  }

  /** Stand in front of the bench or return from the jury box to the gate. */
  public standUp(id: string): void {
    const state = this.states.get(id);

    if (state === undefined || state.seatId === null || this.gameLocks.has(id)) return;

    const bench = state.seatId.startsWith("bench-") ? OBSTACLES.find(
      ({ kind, min, max }) => kind === "bench" && state.position.x >= min.x && state.position.x <= max.x && state.position.z >= min.z && state.position.z <= max.z,
    ) : undefined;
    state.seatId = null;
    if (bench !== undefined) state.position = {
      x: state.position.x,
      z: bench.min.z - PLAYER_RADIUS - 0.05,
    };
    else if (state.role === null) state.position = { ...GATE };
    // The witness seat is inside the stand box: step out on its open back side.
    else if (state.role === "witness") state.position = { x: state.position.x, z: SEATS.witness.position.z + 1.15 };
  }

  /** Place a participant on free floor, standing, and hold them until the game ends. */
  public placeForGame(id: string, position: Vec2, rotation: number): void {
    const state = this.states.get(id);
    if (state === undefined) return;
    state.seatId = null;
    state.ceiling = false;
    state.position = { ...position };
    state.rotation = rotation;
    this.gameLocks.add(id);
  }

  public releaseGame(ids: string[]): void {
    for (const id of ids) this.gameLocks.delete(id);
  }

  public isPlaying(id: string): boolean { return this.gameLocks.has(id); }

  /** Change the displayed trial: everyone leaves the restricted zone, then the new convoked players take their seats */
  public setTrial(trial: Trial | null): void {
    if (trial?.id === this.trial?.id) {
      this.trial = trial;
      this.refreshRoles();
      return;
    }

    this.trial = trial;

    for (const state of this.states.values()) {
      if (state.role !== null || state.seatId?.startsWith("jury-") === true) {
        state.role = null;
        state.seatId = null;
        state.position = { ...ROOM.spawn };
      }

      this.assignRole(state);
    }
  }

  public player(id: string): PlayerState | undefined {
    return this.states.get(id);
  }

  /** Thrown out by the police: back at the entrance, standing */
  public expel(id: string): void {
    const state = this.states.get(id);

    if (state === undefined) return;

    state.seatId = null;
    state.ceiling = false;
    state.position = { ...ROOM.spawn };
    state.rotation = Math.PI;
  }

  public players(): PlayerState[] {
    return [...this.states.values()];
  }

  /** During a trial: seat the witness who was called and release the one dismissed */
  private refreshRoles(): void {
    for (const state of this.states.values()) {
      const role = roleOf(this.trial, state.id);

      if (role !== state.role) {
        if (state.role === "witness") {
          state.role = null;
          state.seatId = null;
          state.position = { ...GATE };
        }

        if (role === "witness") this.assignRole(state);
      }
    }
  }

  private seatFor(role: Role, id: string): Seat | undefined {
    return seatForRole(role, this.trial, id);
  }

  private assignRole(state: PlayerState): void {
    const role = roleOf(this.trial, state.id);

    if (role === null) return;

    const seat = this.seatFor(role, state.id);

    if (seat === undefined) return;

    state.role = role;
    this.sit(state, seat);
  }

  private sit(state: PlayerState, seat: Seat): void {
    state.seatId = seat.id;
    state.ceiling = false;
    state.position = { ...seat.position };
    state.rotation = seat.rotation;
  }
}
