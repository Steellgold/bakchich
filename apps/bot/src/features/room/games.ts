// Rules and public state of the audience's board games; no Discord or network imports.
import type { Vec2 } from "./layout";

export type GameKind = "rps" | "connect4";
export type RpsPick = "rock" | "paper" | "scissors";
export const CONNECT4_COLUMNS = 7;
export const CONNECT4_ROWS = 6;
export const RPS_SHAKE_MS = 1_200;
const RESULT_MS = 3_000;
/** How long a challenge can be accepted (the client hides its dialog after the same delay) */
export const CHALLENGE_MS = 20_000;
const HOVER_GAP_MS = 100;
const IDLE_MS = 120_000;

type Placement = { position: Vec2; rotation: number };
type GameScene = Placement & {
  id: string;
  players: [string, string];
  hovered: Record<string, number>;
};

export type RoomGame = GameScene & ({
  kind: "rps";
  picks: Record<string, RpsPick | null>;
  /** Start of the three shakes, after both secret choices are locked. */
  revealedAt: number | null;
} | {
  kind: "connect4";
  board: (string | null)[][];
  turn: string;
  winner: string | null;
  draw: boolean;
  lastDrop: { column: number; row: number; playerId: string; at: number } | null;
});

export type GameView = { id: string; opponentName: string } & ({
  kind: "rps";
  mine: RpsPick | null;
  theirs: RpsPick | null;
  result: "won" | "lost" | "draw" | null;
} | {
  kind: "connect4";
  board: (string | null)[][];
  selfId: string;
  turn: string;
  winner: string | null;
  draw: boolean;
});

export type Challenge = { fromId: string; fromName: string; game: GameKind };
type Game = GameScene & { finishedAt: number | null; lastActionAt: number } & ({
  kind: "rps";
  picks: Map<string, RpsPick>;
  revealedAt: number | null;
} | Extract<RoomGame, { kind: "connect4" }>);

const beats: Record<RpsPick, RpsPick> = { rock: "scissors", paper: "rock", scissors: "paper" };

/** Four in a row from the last disc, in any direction. */
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

export class Games {
  private readonly games = new Map<string, Game>();
  private readonly challenges = new Map<string, Challenge & { at: number }>();
  private readonly hoverTimes = new Map<string, number>();
  private sequence = 0;

  public isBusy(id: string): boolean { return this.games.has(id); }

  public challenge(from: { id: string; name: string }, targetId: string, game: GameKind, now: number): Challenge | null {
    if (from.id === targetId || this.isBusy(from.id) || this.isBusy(targetId) || this.challenges.has(targetId)) return null;
    const challenge = { fromId: from.id, fromName: from.name, game };
    this.challenges.set(targetId, { ...challenge, at: now });
    return challenge;
  }

  public pendingChallenge(id: string): Challenge | undefined { return this.challenges.get(id); }

  public answer(targetId: string, accept: boolean, now: number, placement?: Placement): [string, string] | null {
    const challenge = this.challenges.get(targetId);
    this.challenges.delete(targetId);
    if (challenge === undefined || !accept || placement === undefined || now - challenge.at > CHALLENGE_MS || this.isBusy(challenge.fromId) || this.isBusy(targetId)) return null;
    const players: [string, string] = [challenge.fromId, targetId];
    this.sequence += 1;
    const scene: GameScene = {
      ...placement,
      position: { ...placement.position },
      players,
      id: `game-${String(this.sequence)}`,
      hovered: Object.fromEntries(players.map((id) => [id, 3])),
    };
    const game: Game = challenge.game === "rps" ? {
      ...scene,
      kind: "rps",
      picks: new Map(),
      revealedAt: null,
      finishedAt: null,
      lastActionAt: now,
    } : {
      ...scene,
      kind: "connect4",
      board: Array.from({ length: CONNECT4_COLUMNS }, () => Array.from({ length: CONNECT4_ROWS }, () => null)),
      turn: players[0],
      winner: null,
      draw: false,
      lastDrop: null,
      finishedAt: null,
      lastActionAt: now,
    };
    for (const id of players) this.games.set(id, game);
    return players;
  }

  public hoverColumn(id: string, column: number, now: number): void {
    const game = this.games.get(id);
    if (game?.kind !== "connect4" || game.finishedAt !== null || !Number.isInteger(column) || column < 0 || column >= CONNECT4_COLUMNS || now - (this.hoverTimes.get(id) ?? -Infinity) < HOVER_GAP_MS) return;
    this.hoverTimes.set(id, now);
    game.lastActionAt = now;
    game.hovered[id] = column;
  }

  public pickRps(id: string, pick: RpsPick, now = Date.now()): void {
    const game = this.games.get(id);
    if (game?.kind !== "rps" || game.picks.has(id)) return;
    game.picks.set(id, pick);
    game.lastActionAt = now;
    if (game.picks.size === 2) {
      game.revealedAt = now;
      game.finishedAt = now + RPS_SHAKE_MS;
    }
  }

  public dropDisc(id: string, column: number, now = Date.now()): void {
    const game = this.games.get(id);
    if (game?.kind !== "connect4" || game.turn !== id || game.winner !== null || game.draw) return;
    const cells = game.board[column];
    const row = cells?.findIndex((cell) => cell === null) ?? -1;
    if (cells === undefined || row === -1) return;
    cells[row] = id;
    game.lastActionAt = now;
    game.lastDrop = { column, row, playerId: id, at: now };
    if (connects(game.board, column, row, id)) game.winner = id;
    else if (game.board.every((columnCells) => columnCells.every((cell) => cell !== null))) game.draw = true;
    else game.turn = game.players.find((player) => player !== id) ?? id;
    if (game.winner !== null || game.draw) game.finishedAt = now;
  }

  public quitGame(id: string): string[] {
    const game = this.games.get(id);
    if (game === undefined) return [];
    for (const player of game.players) {
      this.games.delete(player);
      this.hoverTimes.delete(player);
    }
    return game.players;
  }

  /** Finished rounds remain visible briefly, then both players are released; a game without action for IDLE_MS ends like a forfeit. */
  public expireGames(now: number): string[] {
    for (const [id, challenge] of this.challenges) if (now - challenge.at > CHALLENGE_MS) this.challenges.delete(id);
    return this.uniqueGames().flatMap((game) => (game.finishedAt === null ? now - game.lastActionAt > IDLE_MS : now >= game.finishedAt + RESULT_MS) ? this.quitGame(game.players[0]) : []);
  }

  public gameView(id: string, nameOf: (id: string) => string): GameView | null {
    const game = this.games.get(id);
    if (game === undefined) return null;
    const opponent = game.players.find((player) => player !== id) ?? id;
    const common = { id: game.id, opponentName: nameOf(opponent) };
    if (game.kind === "connect4") return {
      ...common,
      kind: "connect4",
      board: game.board,
      selfId: id,
      turn: game.turn,
      winner: game.winner,
      draw: game.draw,
    };
    const mine = game.picks.get(id) ?? null;
    const theirs = mine === null ? null : game.picks.get(opponent) ?? null;
    return {
      ...common,
      kind: "rps",
      mine,
      theirs,
      result: mine === null || theirs === null ? null : mine === theirs ? "draw" : beats[mine] === theirs ? "won" : "lost",
    };
  }

  public gamePlayers(id: string): string[] { return this.games.get(id)?.players ?? []; }

  /** Every member currently in a game (cheaper than building the public state) */
  public playerIdsInGames(): string[] { return [...this.games.keys()]; }

  public roomGames(): RoomGame[] {
    return this.uniqueGames().map((game) => {
      const common = { id: game.id, players: game.players, position: game.position, rotation: game.rotation, hovered: game.hovered };
      return game.kind === "connect4" ? {
        ...common,
        kind: "connect4",
        board: game.board,
        turn: game.turn,
        winner: game.winner,
        draw: game.draw,
        lastDrop: game.lastDrop,
      } : {
        ...common,
        kind: "rps",
        revealedAt: game.revealedAt,
        picks: Object.fromEntries(game.players.map((id) => [id, game.revealedAt === null ? null : game.picks.get(id) ?? null])),
      };
    });
  }

  protected forgetChallenges(id: string): void {
    for (const [target, challenge] of this.challenges) if (target === id || challenge.fromId === id) this.challenges.delete(target);
  }

  private uniqueGames(): Game[] { return [...new Set(this.games.values())]; }
}
