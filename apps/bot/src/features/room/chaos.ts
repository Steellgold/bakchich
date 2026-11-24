// Courtroom chaos between members of the audience: Discord-free, driven by the room server (relative imports only, shared with apps/web).
import type { Vec2 } from "./layout";
import { SIDE_DOOR } from "./layout";

export type GameKind = "rps" | "connect4";
export type RpsPick = "rock" | "paper" | "scissors";

export const CONNECT4_COLUMNS = 7;
export const CONNECT4_ROWS = 6;

/** How close a target must be to throw, whisper, challenge or fight */
export const CHAOS_REACH = 3;
const TOMATO_COOLDOWN_MS = 6_000;
const RUMOR_COOLDOWN_MS = 60_000;
const OBJECTION_COOLDOWN_MS = 20_000;
const FIGHT_COOLDOWN_MS = 30_000;
const SPLAT_MS = 5_000;
const CHALLENGE_MS = 20_000;
/** The fight goes on alone for a while before the police shows up */
const BRAWL_MS = 3_000;
const POLICE_SPEED = 5;
const POLICE_REACH = 0.9;

export type GameView = {
  kind: "rps";
  opponentName: string;
  mine: RpsPick | null;
  theirs: RpsPick | null;
  result: "won" | "lost" | "draw" | null;
} | {
  kind: "connect4";
  opponentName: string;
  board: (string | null)[][];
  selfId: string;
  turn: string;
  winner: string | null;
  draw: boolean;
};

export type Challenge = {
  fromId: string;
  fromName: string;
  game: GameKind;
};

export type Officer = {
  id: string;
  position: Vec2;
  rotation: number;
};

type Game = {
  kind: "rps";
  players: [string, string];
  picks: Map<string, RpsPick>;
} | {
  kind: "connect4";
  players: [string, string];
  board: (string | null)[][];
  turn: string;
  winner: string | null;
  draw: boolean;
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

const beats: Record<RpsPick, RpsPick> = {
  rock: "scissors",
  paper: "rock",
  scissors: "paper",
};

const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);

/** Four in a row from the last disc, in any direction */
const connects = (board: (string | null)[][], column: number, row: number, id: string) => [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
].some(([dx = 0, dy = 0]) => {
  let count = 1;

  for (const sign of [1, -1]) {
    for (let step = 1; step < 4; step += 1) {
      if (board[column + dx * step * sign]?.[row + dy * step * sign] !== id) break;

      count += 1;
    }
  }

  return count >= 4;
});

export class Chaos {
  private readonly cooldowns = new Map<string, number>();
  private readonly splats = new Map<string, number>();
  private readonly sleeping = new Set<string>();
  private readonly challenges = new Map<
    string,
    Challenge & {
      at: number;
    }
  >();

  private readonly games = new Map<string, Game>();
  private readonly fights: Fight[] = [];

  public constructor(private readonly rng: () => number = Math.random) {}

  /** A member may act once their cooldown for this kind of action is over */
  public ready(id: string, action: "tomato" | "rumor" | "objection" | "fight", now: number): boolean {
    const key = `${id}:${action}`;

    if ((this.cooldowns.get(key) ?? 0) > now) return false;

    const delays = {
      tomato: TOMATO_COOLDOWN_MS,
      rumor: RUMOR_COOLDOWN_MS,
      objection: OBJECTION_COOLDOWN_MS,
      fight: FIGHT_COOLDOWN_MS,
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

  public isBusy(id: string): boolean {
    return this.isFighting(id) || this.games.has(id);
  }

  /** Challenge someone to a game: they have a few seconds to accept */
  public challenge(
    from: {
      id: string;
      name: string;
    },
    targetId: string,
    game: GameKind,
    now: number,
  ): Challenge | null {
    if (this.isBusy(from.id) || this.isBusy(targetId) || this.challenges.has(targetId)) return null;

    const challenge = {
      fromId: from.id,
      fromName: from.name,
      game,
    };
    this.challenges.set(targetId, {
      ...challenge,
      at: now,
    });
    return challenge;
  }

  /** The challenged member answers: the game starts for both, or nothing happens. Returns the two players when it starts. */
  public answer(targetId: string, accept: boolean, now: number): [string, string] | null {
    const challenge = this.challenges.get(targetId);
    this.challenges.delete(targetId);

    if (challenge === undefined || !accept || now - challenge.at > CHALLENGE_MS || this.isBusy(challenge.fromId) || this.isBusy(targetId)) return null;

    const players: [string, string] = [challenge.fromId, targetId];
    const game: Game
      = challenge.game === "rps" ? { kind: "rps", players, picks: new Map() } : {
        kind: "connect4",
        players,
        board: Array.from({ length: CONNECT4_COLUMNS }, () => Array.from({ length: CONNECT4_ROWS }, () => null)),
        turn: challenge.fromId,
        winner: null,
        draw: false,
      };

    for (const id of players) this.games.set(id, game);

    return players;
  }

  public pickRps(id: string, pick: RpsPick): void {
    const game = this.games.get(id);
    if (game?.kind === "rps" && !game.picks.has(id)) game.picks.set(id, pick);
  }

  public dropDisc(id: string, column: number): void {
    const game = this.games.get(id);

    if (game?.kind !== "connect4" || game.turn !== id || game.winner !== null || game.draw) return;

    const cells = game.board[column];
    const row = cells?.findIndex((cell) => cell === null) ?? -1;

    if (cells === undefined || row === -1) return;

    cells[row] = id;
    if (connects(game.board, column, row, id)) game.winner = id;
    else if (game.board.every((columnCells) => columnCells.every((cell) => cell !== null))) game.draw = true;
    else game.turn = game.players.find((player) => player !== id) ?? id;
  }

  /** Leave the current game (closing the panel, or disconnecting): it ends for both */
  public quitGame(id: string): string[] {
    const game = this.games.get(id);

    if (game === undefined) return [];

    for (const player of game.players) this.games.delete(player);

    return game.players;
  }

  /** The game of a member as they see it, null without game */
  public gameView(id: string, nameOf: (id: string) => string): GameView | null {
    const game = this.games.get(id);

    if (game === undefined) return null;

    const opponent = game.players.find((player) => player !== id) ?? id;

    if (game.kind === "connect4") return {
      kind: "connect4",
      opponentName: nameOf(opponent),
      board: game.board,
      selfId: id,
      turn: game.turn,
      winner: game.winner,
      draw: game.draw,
    };

    const mine = game.picks.get(id) ?? null;
    const theirs = game.picks.get(opponent) ?? null;
    // The opponent's pick stays hidden until both have picked:
    if (mine === null || theirs === null) return {
      kind: "rps",
      opponentName: nameOf(opponent),
      mine,
      theirs: null,
      result: null,
    };

    return {
      kind: "rps",
      opponentName: nameOf(opponent),
      mine,
      theirs,
      result: mine === theirs ? "draw" : beats[mine] === theirs ? "won" : "lost",
    };
  }

  public gamePlayers(id: string): string[] {
    return this.games.get(id)?.players ?? [];
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

    for (const [id, challenge] of this.challenges) if (now - challenge.at > CHALLENGE_MS) this.challenges.delete(id);

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
    this.challenges.delete(id);
  }

  public view() {
    return {
      sleeping: [...this.sleeping],
      splats: [...this.splats.keys()],
      fighting: this.fights.flatMap((fight) => fight.ids),
      officers: this.fights.flatMap((fight) => fight.officers),
    };
  }
}
