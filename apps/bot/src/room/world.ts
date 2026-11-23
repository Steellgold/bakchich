import type { Trial } from "../court/engine";
import type { Seat, Vec2 } from "./layout";
import { GATE, GATE_RADIUS, MAX_SPEED, OBSTACLES, PLAYER_RADIUS, RESTRICTED_ZONE, ROOM, SEATS } from "./layout";

export type Role = "accused" | "prosecutor" | "defense";

export type PlayerState = {
  id: string;
  name: string;
  avatarUrl: string | null;
  position: Vec2;
  rotation: number;
  seatId: string | null;
  role: Role | null;
};

const ROLE_SEATS: Record<Role, Seat> = { accused: SEATS.accused, prosecutor: SEATS.prosecutor, defense: SEATS.defense };

const inRestrictedZone = (point: Vec2) => point.x >= RESTRICTED_ZONE.min.x && point.x <= RESTRICTED_ZONE.max.x
  && point.z >= RESTRICTED_ZONE.min.z && point.z <= RESTRICTED_ZONE.max.z;

const insideRoom = (point: Vec2) => Math.abs(point.x) <= ROOM.width / 2 - PLAYER_RADIUS
  && point.z >= PLAYER_RADIUS && point.z <= ROOM.depth - PLAYER_RADIUS;

const collides = (point: Vec2) => OBSTACLES.some((box) => point.x > box.min.x - PLAYER_RADIUS && point.x < box.max.x + PLAYER_RADIUS
  && point.z > box.min.z - PLAYER_RADIUS && point.z < box.max.z + PLAYER_RADIUS);

/** Whether a standing character may be at this point, shared with the client for its local prediction */
export const canStand = (point: Vec2, hasRole: boolean): boolean => insideRoom(point) && !collides(point) && (hasRole || !inRestrictedZone(point));

const roleOf = (trial: Trial | null, id: string): Role | null => {
  if (trial === null) return null;
  if (trial.accused.id === id) return "accused";
  if (trial.plaintiff.id === id) return "prosecutor";
  if (trial.lawyer?.id === id) return "defense";
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

  public join(player: { id: string; name: string; avatarUrl: string | null }): "joined" | "replaced" {
    const replaced = this.states.has(player.id);
    const state: PlayerState = { ...player, position: { ...ROOM.spawn }, rotation: Math.PI, seatId: null, role: null };
    this.states.set(player.id, state);
    this.assignRole(state);
    return replaced ? "replaced" : "joined";
  }

  public leave(id: string): void {
    this.states.delete(id);
  }

  /** Move towards a target, clamped to the max speed, refused through obstacles or into a forbidden zone */
  public move(id: string, target: Vec2, rotation: number, elapsedMs: number): void {
    const state = this.states.get(id);
    if (state?.seatId !== null) return;

    state.rotation = rotation;

    const dx = target.x - state.position.x;
    const dz = target.z - state.position.z;
    const length = Math.hypot(dx, dz);
    const maxLength = MAX_SPEED * elapsedMs / 1000;
    const scale = length > maxLength ? maxLength / length : 1;
    const next = { x: state.position.x + dx * scale, z: state.position.z + dz * scale };

    if (canStand(next, state.role !== null)) state.position = next;
  }

  public becomeJuror(id: string): "seated" | "too-far" | "full" {
    const state = this.states.get(id);
    if (state === undefined || Math.hypot(state.position.x - GATE.x, state.position.z - GATE.z) > GATE_RADIUS) return "too-far";

    const taken = new Set([...this.states.values()].map((player) => player.seatId));
    const free = SEATS.jury.find((seat) => !taken.has(seat.id));
    if (free === undefined) return "full";

    this.sit(state, free);
    return "seated";
  }

  /** Leave a seat: jurors go back to the gate, convoked players stay where they sat */
  public standUp(id: string): void {
    const state = this.states.get(id);
    if (state === undefined || state.seatId === null) return;

    state.seatId = null;
    if (state.role === null) state.position = { ...GATE };
  }

  /** Change the displayed trial: everyone leaves the restricted zone, then the new convoked players take their seats */
  public setTrial(trial: Trial | null): void {
    if (trial?.id === this.trial?.id) {
      this.trial = trial;
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

  public players(): PlayerState[] {
    return [...this.states.values()];
  }

  private assignRole(state: PlayerState): void {
    const role = roleOf(this.trial, state.id);
    if (role === null) return;

    state.role = role;
    this.sit(state, ROLE_SEATS[role]);
  }

  private sit(state: PlayerState, seat: Seat): void {
    state.seatId = seat.id;
    state.position = { ...seat.position };
    state.rotation = seat.rotation;
  }
}
