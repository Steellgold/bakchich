// Window jump: a running member dives through a side window, reappears falling out of a ceiling portal and lands. Discord-free, shared with apps/web.
import type { Vec2 } from "./layout";
import type { ServerMessage } from "./protocol";
import type { PlayerState } from "./world";
import { CEILING_HEIGHT, PLAYER_RADIUS, ROOM, WINDOW_HALF_OPENING, WINDOW_ZS } from "./layout";
import { canStand } from "./world";

export const DIVE_MS = 500;
/** From the dive to the portal opening: the jumper is outside, in the tunnel */
export const AWAY_MS = 2_500;
export const FALL_MS = 900;
/** Belly flop (flop 0.4 s then get_up 1.6 s) and superhero landing (hero_land 0.5 s then hero_rise 0.8 s) */
export const FLOP_MS = 2_000;
export const HERO_MS = 1_300;
export const PORTAL_OPEN_MS = 1_500;
export const COOLDOWN_MS = 20_000;
/** Height of the portal in the ceiling, and of the feet of a member starting to fall out of it */
export const PORTAL_HEIGHT = CEILING_HEIGHT - 0.05;
export const FALL_HEIGHT = CEILING_HEIGHT - 0.2;

const WALL_X = ROOM.width / 2 - PLAYER_RADIUS;
/** Running at the wall: its x within this of the clamped position, facing it by at least this share of the heading */
const WALL_GAP = 0.05;
const MIN_FACING = 0.5;
const SPOT_TRIES = 60;
const SPOT_GAP = 1.5;

/** The window a running member heading into a side wall dives through, if their position is in its opening */
export const windowAt = (position: Vec2, rotation: number): { side: -1 | 1; z: number } | null => {
  const side = position.x < 0 ? -1 : 1;
  const z = WINDOW_ZS.find((centre) => Math.abs(position.z - centre) <= WINDOW_HALF_OPENING);

  if (Math.abs(position.x) < WALL_X - WALL_GAP || Math.sin(rotation) * side < MIN_FACING || z === undefined) return null;

  return {
    side,
    z,
  };
};

/** Holding Space at the landing makes it a superhero one */
export const landingKind = (held: boolean): "flop" | "hero" => (held ? "hero" : "flop");

/** A free spot of the public floor, away from benches, tables and other members */
export const pickPortalSpot = (taken: Vec2[], random: () => number = Math.random): Vec2 => {
  for (let tries = 0; tries < SPOT_TRIES; tries += 1) {
    const spot = {
      x: (random() * 2 - 1) * (ROOM.width / 2 - 1.5),
      z: 15 + random() * (ROOM.depth - 17),
    };

    if (canStand(spot) && taken.every((other) => Math.hypot(other.x - spot.x, other.z - spot.z) >= SPOT_GAP)) return spot;
  }

  return { ...ROOM.spawn };
};

type Jump = {
  startedAt: number;
  phaseAt: number;
  held: boolean;
};

/** The jumps in progress: moves the players through their phases and tells what to broadcast */
export class WindowJumps {
  private readonly jumps = new Map<string, Jump>();
  private readonly lastStarts = new Map<string, number>();
  private readonly closes = new Map<string, number>();

  /** Starts the dive when this running audience member is in a window opening, at most once per COOLDOWN_MS */
  public start(player: PlayerState, now: number): ServerMessage | null {
    if (player.air !== null || player.role !== null || player.seatId !== null || now - (this.lastStarts.get(player.id) ?? -COOLDOWN_MS) < COOLDOWN_MS) return null;

    const opening = windowAt(player.position, player.rotation);

    if (opening === null) return null;

    this.lastStarts.set(player.id, now);
    this.jumps.set(player.id, {
      startedAt: now,
      phaseAt: now,
      held: false,
    });
    player.air = "dive";
    player.rotation = (opening.side * Math.PI) / 2;
    return {
      type: "window-break",
      side: opening.side,
      z: opening.z,
    };
  }

  public hold(id: string, held: boolean): void {
    const jump = this.jumps.get(id);
    if (jump !== undefined) jump.held = held;
  }

  /** The member left: the jump is over (a portal already open still closes by itself) */
  public forget(id: string): void {
    this.jumps.delete(id);
  }

  /** Advance every jump; `taken` are the positions the portal spot must stay clear of (members and game tables) */
  public tick(now: number, playerOf: (id: string) => PlayerState | undefined, taken: () => Vec2[]): ServerMessage[] {
    const messages: ServerMessage[] = [];

    for (const [id, at] of this.closes) {
      if (at > now) continue;

      this.closes.delete(id);
      messages.push({
        type: "portal-close",
        id,
      });
    }

    for (const [id, jump] of this.jumps) {
      const player = playerOf(id);

      if (player === undefined) {
        this.jumps.delete(id);
        continue;
      }

      const phaseMs = now - jump.phaseAt;

      if (player.air === "dive" && phaseMs >= DIVE_MS) {
        player.air = "away";
        jump.phaseAt = now;
      }
      else if (player.air === "away" && now - jump.startedAt >= AWAY_MS) {
        player.position = pickPortalSpot(taken());
        player.rotation = Math.PI;
        player.air = "fall";
        jump.phaseAt = now;
        this.closes.set(id, now + PORTAL_OPEN_MS);
        messages.push({
          type: "portal-open",
          id,
          x: player.position.x,
          z: player.position.z,
        }, { type: "shake" });
      }
      else if (player.air === "fall" && phaseMs >= FALL_MS) {
        player.air = landingKind(jump.held);
        if (player.air === "hero") player.hero = true;
        jump.phaseAt = now;
        messages.push({
          type: "landing",
          id,
          kind: player.air,
          x: player.position.x,
          z: player.position.z,
        });
      }
      else if ((player.air === "flop" && phaseMs >= FLOP_MS) || (player.air === "hero" && phaseMs >= HERO_MS)) {
        player.air = null;
        this.jumps.delete(id);
      }
    }

    return messages;
  }
}
