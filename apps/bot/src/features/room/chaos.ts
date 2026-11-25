// Courtroom chaos between members of the audience: Discord-free, shared with apps/web.
import type { Vec2 } from "./layout";
import { Games } from "./games";
import { SIDE_DOOR } from "./layout";

export type { Challenge, GameKind, GameView, RoomGame, RpsPick } from "./games";
export { CHALLENGE_MS, CONNECT4_COLUMNS, CONNECT4_ROWS } from "./games";

/** How close a target must be to throw, whisper, challenge or fight: face to face or side by side */
export const CHAOS_REACH = 2;
const TOMATO_COOLDOWN_MS = 6_000;
const RUMOR_COOLDOWN_MS = 60_000;
const OBJECTION_COOLDOWN_MS = 20_000;
const FIGHT_COOLDOWN_MS = 30_000;
const CHALLENGE_COOLDOWN_MS = 5_000;
const SPLAT_MS = 5_000;
/** The fight goes on alone for a while before the police shows up */
const BRAWL_MS = 3_000;
const POLICE_SPEED = 5;
const POLICE_REACH = 0.9;

export type Officer = {
  id: string;
  position: Vec2;
  rotation: number;
};

type Fight = {
  ids: [string, string];
  startedAt: number;
  officers: Officer[];
  arrived: boolean;
};

/** What the room server must do after a chaos step: tell somebody, or throw fighters out */
export type ChaosOutcome = {
  expelled: string[];
};

const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);

export class Chaos extends Games {
  private readonly cooldowns = new Map<string, number>();
  private readonly splats = new Map<string, number>();
  private readonly sleeping = new Set<string>();
  private readonly fights: Fight[] = [];

  public constructor(private readonly rng: () => number = Math.random) {
    super();
  }

  /** A member may act once their cooldown for this kind of action is over */
  public ready(id: string, action: "tomato" | "rumor" | "objection" | "fight" | "challenge", now: number): boolean {
    const key = `${id}:${action}`;

    if ((this.cooldowns.get(key) ?? 0) > now) return false;

    const delays = {
      tomato: TOMATO_COOLDOWN_MS,
      rumor: RUMOR_COOLDOWN_MS,
      objection: OBJECTION_COOLDOWN_MS,
      fight: FIGHT_COOLDOWN_MS,
      challenge: CHALLENGE_COOLDOWN_MS,
    };
    this.cooldowns.set(key, now + delays[action]);
    return true;
  }

  public splat(targetId: string, now: number): void {
    this.splats.set(targetId, now + SPLAT_MS);
  }

  public toggleSleep(id: string): void {
    if (!this.sleeping.delete(id)) this.sleeping.add(id);
  }

  public wake(id: string): void {
    this.sleeping.delete(id);
  }

  public isFighting(id: string): boolean {
    return this.fights.some((fight) => fight.ids.includes(id));
  }

  public override isBusy(id: string): boolean {
    return this.isFighting(id) || super.isBusy(id);
  }

  /** Two members start fighting: frozen until the police comes to throw them out */
  public fight(a: string, b: string, now: number): boolean {
    if (this.isBusy(a) || this.isBusy(b)) return false;

    this.sleeping.delete(a);
    this.sleeping.delete(b);
    this.fights.push({
      ids: [a, b],
      startedAt: now,
      officers: [],
      arrived: false,
    });
    return true;
  }

  /** Advance the police: after the brawl, two officers walk in by the side door to the fighters and throw them out */
  public tick(now: number, dtSeconds: number, positionOf: (id: string) => Vec2 | undefined): ChaosOutcome {
    const expelled: string[] = [];

    for (const [id, until] of this.splats) if (until <= now) this.splats.delete(id);

    for (const fight of [...this.fights]) {
      const targets = fight.ids.map(positionOf);

      if (targets.some((target) => target === undefined)) {
        this.fights.splice(this.fights.indexOf(fight), 1);
        continue;
      }
      if (now - fight.startedAt < BRAWL_MS) continue;

      if (fight.officers.length === 0) fight.officers = fight.ids.map((id, index) => ({
        id: `officer-${id}`,
        position: {
          x: SIDE_DOOR.x - 0.5,
          z: SIDE_DOOR.z + index,
        },
        rotation: -Math.PI / 2,
      }));

      let arrived = true;

      for (const [index, officer] of fight.officers.entries()) {
        const target = targets[index];

        if (target === undefined) continue;

        const gap = distance(officer.position, target);

        if (gap <= POLICE_REACH) continue;

        arrived = false;
        const step = Math.min(gap - POLICE_REACH * 0.9, POLICE_SPEED * dtSeconds);
        officer.position = {
          x: officer.position.x + ((target.x - officer.position.x) / gap) * step,
          z: officer.position.z + ((target.z - officer.position.z) / gap) * step,
        };
        officer.rotation = Math.atan2(target.x - officer.position.x, target.z - officer.position.z);
      }

      if (arrived) {
        expelled.push(...fight.ids);
        this.fights.splice(this.fights.indexOf(fight), 1);
      }
    }

    return { expelled };
  }

  /** A random line among several, so the canned texts do not repeat */
  public pick<T>(list: readonly T[]): T | undefined {
    return list[Math.floor(this.rng() * list.length)];
  }

  public forget(id: string): void {
    this.sleeping.delete(id);
    this.splats.delete(id);
    this.forgetChallenges(id);
  }

  public view() {
    return {
      sleeping: [...this.sleeping],
      splats: [...this.splats.keys()],
      fighting: this.fights.flatMap((fight) => fight.ids),
      officers: this.fights.flatMap((fight) => fight.officers),
      games: this.roomGames(),
    };
  }
}
