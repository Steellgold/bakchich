import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";

export const DEBATE_MS = 5 * 60_000;
export const VOTE_MS = 2 * 60_000;
export const REVERSAL_CHANCE = 0.15;
export const MAX_CRIME_LENGTH = 200;

export type Member = { id: string; name: string };
export type Phase = "debate" | "vote";

export type Trial = {
  id: string;
  channelId: string;
  accused: Member;
  plaintiff: Member;
  lawyer: Member | null;
  crime: string;
  phase: Phase;
  /** Voter ID to vote (true means guilty) */
  votes: Map<string, boolean>;
  startedAt: Date;
};

export type Verdict = { guilty: boolean; reversed: boolean; coinFlip: boolean; guiltyVotes: number; innocentVotes: number };

export type RecordEntry = { crime: string; plaintiffName: string; guilty: boolean; reversed: boolean; sentence: string | null; createdAt: Date };

export type CourtEvent
  = | { type: "opened"; trial: Trial }
    | { type: "vote-started"; trial: Trial }
    | { type: "vote-cast"; trial: Trial }
    | { type: "verdict"; trial: Trial; verdict: Verdict };

export type VoteResult = "ok" | "not-allowed" | "closed" | "no-trial";

/** Trimmed crime, or null when empty or longer than MAX_CRIME_LENGTH */
export const normalizeCrime = (crime: string): string | null => {
  const trimmed = crime.trim();
  return trimmed === "" || trimmed.length > MAX_CRIME_LENGTH ? null : trimmed;
};

/** Random lawyer among unique candidates not excluded, or null when nobody is left */
export const pickLawyer = (candidates: Member[], excludedIds: string[], rng: () => number): Member | null => {
  const eligible = [...new Map(candidates.map((member) => [member.id, member])).values()]
    .filter((member) => !excludedIds.includes(member.id));

  return eligible[Math.floor(rng() * eligible.length)] ?? null;
};

/** Majority verdict, with a coin flip on tie or no votes, then the corrupt judge's reversal roll */
export const computeVerdict = (votes: Map<string, boolean>, rng: () => number): Verdict => {
  const guiltyVotes = [...votes.values()].filter(Boolean).length;
  const innocentVotes = votes.size - guiltyVotes;

  const coinFlip = guiltyVotes === innocentVotes;
  const majority = coinFlip ? rng() < 0.5 : guiltyVotes > innocentVotes;
  const reversed = rng() < REVERSAL_CHANCE;

  return { guilty: reversed ? !majority : majority, reversed, coinFlip, guiltyVotes, innocentVotes };
};

type TrialState = { trial: Trial; pleas: number; pleaThreshold: number };

/** Owns trials in progress (one per channel), their timers and votes, and emits every change */
export class Court extends EventEmitter<{ event: [CourtEvent] }> {
  private readonly states = new Map<string, TrialState>();

  public constructor(private readonly rng: () => number = Math.random) {
    super();
  }

  public get(channelId: string): Trial | undefined {
    return this.states.get(channelId)?.trial;
  }

  public open(input: { channelId: string; accused: Member; plaintiff: Member; lawyer: Member | null; crime: string }): Trial | "busy" {
    if (this.states.has(input.channelId)) return "busy";

    const trial: Trial = { ...input, id: randomUUID(), phase: "debate", votes: new Map(), startedAt: new Date() };
    this.states.set(input.channelId, { trial, pleas: 0, pleaThreshold: this.drawPleaThreshold() });
    this.emit("event", { type: "opened", trial });

    setTimeout(() => {
      trial.phase = "vote";
      this.emit("event", { type: "vote-started", trial });

      setTimeout(() => {
        this.states.delete(input.channelId);
        this.emit("event", { type: "verdict", trial, verdict: computeVerdict(trial.votes, this.rng) });
      }, VOTE_MS).unref();
    }, DEBATE_MS).unref();

    return trial;
  }

  public vote(channelId: string, voterId: string, guilty: boolean): VoteResult {
    const trial = this.get(channelId);
    if (trial === undefined) return "no-trial";
    if (trial.phase !== "vote") return "closed";
    if (voterId === trial.accused.id || voterId === trial.plaintiff.id) return "not-allowed";

    trial.votes.set(voterId, guilty);
    this.emit("event", { type: "vote-cast", trial });
    return "ok";
  }

  /** Count a debate message, true when the judge should intervene */
  public plea(channelId: string): boolean {
    const state = this.states.get(channelId);
    if (state?.trial.phase !== "debate") return false;

    state.pleas += 1;
    if (state.pleas < state.pleaThreshold) return false;

    state.pleas = 0;
    state.pleaThreshold = this.drawPleaThreshold();
    return true;
  }

  private drawPleaThreshold(): number {
    return 4 + Math.floor(this.rng() * 2);
  }
}
