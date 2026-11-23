import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";

export const DEBATE_MS = 5 * 60_000;
export const VOTE_MS = 2 * 60_000;
export const REVERSAL_CHANCE = 0.15;
export const MAX_CRIME_LENGTH = 200;
export const MAX_ACCUSED = 5;

export type Member = { id: string; name: string };

/** The court-appointed lawyer, played by the AI */
export const AI_LAWYER: Member = { id: "ai-lawyer", name: "Maître Commis d'Office" };
export type Phase = "debate" | "vote";

export type Trial = {
  id: string;
  channelId: string;
  accused: Member[];
  plaintiff: Member;
  lawyer: Member | null;
  /** Member on the witness stand, called by the prosecution or the defense */
  witness: Member | null;
  crime: string;
  phase: Phase;
  /** Voter ID to vote (true means guilty) */
  votes: Map<string, boolean>;
  startedAt: Date;
  /** Epoch milliseconds when the current phase ends */
  phaseEndsAt: number;
};

export type Verdict = { guilty: boolean; reversed: boolean; coinFlip: boolean; guiltyVotes: number; innocentVotes: number };

export type RecordEntry = { crime: string; plaintiffName: string; guilty: boolean; reversed: boolean; sentence: string | null; createdAt: Date };

export type CourtEvent
  = | { type: "opened"; trial: Trial }
    | { type: "vote-started"; trial: Trial }
    | { type: "vote-cast"; trial: Trial }
    | { type: "verdict"; trial: Trial; verdict: Verdict }
    /** Someone spoke in the trial channel, speakerId null being the judge */
    | { type: "speech"; trial: Trial; speakerId: string | null; text: string };

export type VoteResult = "ok" | "not-allowed" | "not-in-voice" | "closed" | "no-trial";

/** "A", "A et B" or "A, B et C" */
export const formatNames = (names: string[]): string => (names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} et ${names.at(-1) ?? ""}`);

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

/** Owns trials in progress (one per channel), their timers and votes, and emits every change */
export class Court extends EventEmitter<{ event: [CourtEvent] }> {
  private readonly states = new Map<string, Trial>();

  public constructor(private readonly rng: () => number = Math.random) {
    super();
  }

  public get(channelId: string): Trial | undefined {
    return this.states.get(channelId);
  }

  /** Every trial in progress */
  public list(): Trial[] {
    return [...this.states.values()];
  }

  /** Relay a line of the judge (null speaker) to the courtroom, ignored without trial */
  public say(channelId: string, speakerId: string | null, text: string): void {
    const trial = this.get(channelId);
    if (trial !== undefined) this.emit("event", { type: "speech", trial, speakerId, text });
  }

  public open(input: { channelId: string; accused: Member[]; plaintiff: Member; lawyer: Member | null; crime: string }): Trial | "busy" {
    if (this.states.has(input.channelId)) return "busy";

    const trial: Trial = { ...input, id: randomUUID(), witness: null, phase: "debate", votes: new Map(), startedAt: new Date(), phaseEndsAt: Date.now() + DEBATE_MS };
    this.states.set(input.channelId, trial);
    this.emit("event", { type: "opened", trial });

    setTimeout(() => {
      trial.phase = "vote";
      trial.witness = null;
      trial.phaseEndsAt = Date.now() + VOTE_MS;
      this.emit("event", { type: "vote-started", trial });

      setTimeout(() => {
        this.states.delete(input.channelId);
        this.emit("event", { type: "verdict", trial, verdict: computeVerdict(trial.votes, this.rng) });
      }, VOTE_MS).unref();
    }, DEBATE_MS).unref();

    return trial;
  }

  /** Put a member on the witness stand during the debate, replacing the previous witness */
  public callWitness(channelId: string, witness: Member): "ok" | "no-trial" | "closed" {
    const trial = this.get(channelId);
    if (trial === undefined) return "no-trial";
    if (trial.phase !== "debate") return "closed";

    trial.witness = witness;
    return "ok";
  }

  public dismissWitness(channelId: string): void {
    const trial = this.get(channelId);
    if (trial !== undefined) trial.witness = null;
  }

  public vote(channelId: string, voterId: string, guilty: boolean): VoteResult {
    const trial = this.get(channelId);
    if (trial === undefined) return "no-trial";
    if (trial.phase !== "vote") return "closed";
    if (trial.accused.some((member) => member.id === voterId) || voterId === trial.plaintiff.id) return "not-allowed";

    trial.votes.set(voterId, guilty);
    this.emit("event", { type: "vote-cast", trial });
    return "ok";
  }
}
