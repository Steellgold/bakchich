import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";

export const VOTE_MS = 2 * 60_000;
export const DELIBERATION_MS = 20_000;
export const WITNESS_STAGE_MS = 45_000;
/** The witnesses phase ends early when nobody is called within this time */
export const NO_WITNESS_MS = 45_000;
export const REVERSAL_CHANCE = 0.15;
/** Weight of the judge's vote at the assizes */
export const JUDGE_VOTE_WEIGHT = 3;
/** Fewer possible voters than this and the judge decides alone */
export const MIN_JURY = 3;
export const MAX_CRIME_LENGTH = 200;
export const MAX_ACCUSED = 5;

export type Member = {
  id: string;
  name: string;
};

/** The court-appointed lawyer, played by the AI */
export const AI_LAWYER: Member = {
  id: "ai-lawyer",
  name: "Maître Commis d'Office",
};

/** American by default (objections, cross-examination), French on request (the judge leads, no objection) */
export type Style = "american" | "french";
export type Gravity = "light" | "ordinary" | "serious";
/** Popular jury, judge alone (bench trial), or jury and judge together (assizes) */
export type Mode = "jury" | "bench" | "assizes";
export type Side = "prosecution" | "defense";

export type Phase
  = "opening" | "examination" | "prosecution" | "defense" | "witnesses" | "closing-prosecution" | "closing-defense" | "last-word" | "vote" | "deliberation";

/** Who has the floor: given by the code, announced by the judge */
export type Floor = "judge" | "accused" | Side | "witness" | null;

const SCHEDULES: Record<
  Style,
  {
    phase: Phase;
    ms: number;
  }[]
> = {
  american: [
    {
      phase: "opening",
      ms: 45_000,
    },
    {
      phase: "prosecution",
      ms: 90_000,
    },
    {
      phase: "defense",
      ms: 90_000,
    },
    {
      phase: "witnesses",
      ms: 180_000,
    },
    {
      phase: "closing-prosecution",
      ms: 60_000,
    },
    {
      phase: "closing-defense",
      ms: 60_000,
    },
  ],
  french: [
    {
      phase: "opening",
      ms: 45_000,
    },
    {
      phase: "examination",
      ms: 90_000,
    },
    {
      phase: "prosecution",
      ms: 90_000,
    },
    {
      phase: "witnesses",
      ms: 180_000,
    },
    {
      phase: "defense",
      ms: 90_000,
    },
    {
      phase: "last-word",
      ms: 30_000,
    },
  ],
};

/** Total length of the debate before the vote or the deliberation */
export const debateMs = (style: Style): number => SCHEDULES[style].reduce((total, step) => total + step.ms, 0);

export type Witness = {
  member: Member;
  calledBy: Side;
  stage: "examination" | "cross";
  stageEndsAt: number;
};

export type Trial = {
  id: string;
  channelId: string;
  accused: Member[];
  plaintiff: Member;
  lawyer: Member | null;
  crime: string;
  /** The message the trial was opened on, as « name : content », null without one */
  context: string | null;
  style: Style;
  mode: Mode;
  phase: Phase;
  /** Member on the witness stand, called by the prosecution or the defense */
  witness: Witness | null;
  /** Every member called to the stand during the trial */
  witnessesCalled: Member[];
  /** Voter ID to vote (true means guilty) */
  votes: Map<string, boolean>;
  startedAt: Date;
  /** Epoch milliseconds when the current phase ends */
  phaseEndsAt: number;
};

export type Verdict = {
  guilty: boolean;
  reversed: boolean;
  coinFlip: boolean;
  guiltyVotes: number;
  innocentVotes: number;
  mode: Mode;
  judgeGuilty: boolean | null;
};

export type RecordEntry = {
  crime: string;
  plaintiffName: string;
  guilty: boolean;
  reversed: boolean;
  sentence: string | null;
  createdAt: Date;
};

export type ObjectionRuling = "sustained" | "overruled";

export type CourtEvent = {
  type: "opened";
  trial: Trial;
} | {
  type: "phase";
  trial: Trial;
} | {
  type: "witness";
  trial: Trial;
  witness: Witness | null;
} | {
  type: "objection";
  trial: Trial;
  objector: Member;
  ruling: ObjectionRuling;
} | {
  type: "vote-cast";
  trial: Trial;
} | {
  type: "verdict";
  trial: Trial;
  verdict: Verdict;
} | {
  type: "sentenced";
  trial: Trial;
  verdict: Verdict;
  sentence: string | null;
} | {
  type: "speech";
  trial: Trial;
  speakerId: string | null;
  text: string;
};

export type VoteResult = "ok" | "not-allowed" | "not-in-voice" | "closed" | "no-trial";
export type WitnessResult = "ok" | "no-trial" | "closed" | "busy";
export type ObjectionResult = ObjectionRuling | "no-trial" | "not-allowed" | "not-american";

/** "A", "A et B" or "A, B et C" */
export const formatNames = (names: string[]): string => (names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} et ${names.at(-1) ?? ""}`);

/** Trimmed crime, or null when empty or longer than MAX_CRIME_LENGTH */
export const normalizeCrime = (crime: string): string | null => {
  const trimmed = crime.trim();
  return trimmed === "" || trimmed.length > MAX_CRIME_LENGTH ? null : trimmed;
};

/** The judgment mode follows the gravity, except that too few voters leaves the judge alone and the accused may claim a jury for a light case */
export const judgmentMode = (gravity: Gravity, possibleVoters: number | null, juryRequested: boolean): Mode => {
  const enoughVoters = possibleVoters === null || possibleVoters >= MIN_JURY;

  if (gravity === "serious") return enoughVoters ? "assizes" : "bench";
  if (gravity === "light" && !juryRequested) return "bench";

  return enoughVoters ? "jury" : "bench";
};

/** Who speaks during a phase: during the witnesses, the side examining or cross-examining the witness */
export const floorOf = (trial: Pick<Trial, "phase" | "witness" | "style">): Floor => {
  if (trial.phase === "opening") return "judge";
  if (trial.phase === "examination" || trial.phase === "last-word") return "accused";
  if (trial.phase === "prosecution" || trial.phase === "closing-prosecution") return "prosecution";
  if (trial.phase === "defense" || trial.phase === "closing-defense") return "defense";
  if (trial.phase === "witnesses") {
    if (trial.witness === null) return null;
    if (trial.style === "french") return "judge";
    if (trial.witness.stage === "examination") return trial.witness.calledBy;

    return trial.witness.calledBy === "prosecution" ? "defense" : "prosecution";
  }

  return null;
};

/** IDs speaking for a side: the plaintiff for the prosecution, the lawyer for the defense (or the accused without a human lawyer) */
export const counselOf = (trial: Pick<Trial, "plaintiff" | "lawyer" | "accused">, side: Side): string[] => {
  if (side === "prosecution") return [trial.plaintiff.id];

  return trial.lawyer === null || trial.lawyer.id === AI_LAWYER.id ? trial.accused.map((member) => member.id) : [trial.lawyer.id];
};

export const sideOf = (trial: Pick<Trial, "plaintiff" | "lawyer" | "accused">, id: string): Side | null => {
  if (counselOf(trial, "prosecution").includes(id)) return "prosecution";
  if (counselOf(trial, "defense").includes(id)) return "defense";

  return null;
};

/** Majority verdict, with a coin flip on tie or no votes, then the corrupt judge's reversal roll. Alone, the judge decides; at the assizes, the judge's vote weighs three. */
export const computeVerdict = (votes: Map<string, boolean>, mode: Mode, judgeGuilty: boolean | null, rng: () => number): Verdict => {
  if (mode === "bench") return {
    guilty: judgeGuilty ?? rng() < 0.5,
    reversed: false,
    coinFlip: false,
    guiltyVotes: 0,
    innocentVotes: 0,
    mode,
    judgeGuilty,
  };

  const judgeWeight = mode === "assizes" && judgeGuilty !== null ? JUDGE_VOTE_WEIGHT : 0;
  const guiltyVotes = [...votes.values()].filter(Boolean).length + (judgeGuilty === true ? judgeWeight : 0);
  const innocentVotes = [...votes.values()].filter((guilty) => !guilty).length + (judgeGuilty === false ? judgeWeight : 0);

  const coinFlip = guiltyVotes === innocentVotes;
  const majority = coinFlip ? rng() < 0.5 : guiltyVotes > innocentVotes;
  const reversed = rng() < REVERSAL_CHANCE;

  return {
    guilty: reversed ? !majority : majority,
    reversed,
    coinFlip,
    guiltyVotes,
    innocentVotes,
    mode,
    judgeGuilty,
  };
};

/** Asked when the judge must vote (judge alone or assizes): true means guilty, null when the judge cannot answer */
export type JudgeVote = (trial: Trial) => Promise<boolean | null>;

/** Owns trials in progress (one per channel), their phases, timers and votes, and emits every change */
export class Court extends EventEmitter<{
  event: [CourtEvent];
}> {
  private readonly states = new Map<string, Trial>();
  private readonly witnessTimers = new Map<string, ReturnType<typeof setTimeout>>();

  public constructor(
    private readonly judgeVote: JudgeVote,
    private readonly rng: () => number = Math.random,
  ) {
    super();
  }

  public get(channelId: string): Trial | undefined {
    return this.states.get(channelId);
  }

  /** Every trial in progress */
  public list(): Trial[] {
    return [...this.states.values()];
  }

  /** Relay a line said in the trial (speakerId null is the judge), ignored without trial */
  public say(channelId: string, speakerId: string | null, text: string): void {
    const trial = this.get(channelId);
    if (trial !== undefined) this.emit("event", {
      type: "speech",
      trial,
      speakerId,
      text,
    });
  }

  /** The sentence was written: the verdict is complete */
  public sentenced(trial: Trial, verdict: Verdict, sentence: string | null): void {
    this.emit("event", {
      type: "sentenced",
      trial,
      verdict,
      sentence,
    });
  }

  public open(input: {
    channelId: string;
    accused: Member[];
    plaintiff: Member;
    lawyer: Member | null;
    crime: string;
    context: string | null;
    style: Style;
    mode: Mode;
  }): Trial | "busy" {
    if (this.states.has(input.channelId)) return "busy";

    const [first] = SCHEDULES[input.style];

    if (first === undefined) throw new Error(`No phase for the ${input.style} style`);

    const trial: Trial = {
      ...input,
      id: randomUUID(),
      phase: first.phase,
      witness: null,
      witnessesCalled: [],
      votes: new Map(),
      startedAt: new Date(),
      phaseEndsAt: Date.now() + first.ms,
    };
    this.states.set(input.channelId, trial);
    this.emit("event", {
      type: "opened",
      trial,
    });
    this.armPhase(trial, 0);
    return trial;
  }

  /** Put a member on the witness stand during the witnesses phase: examined by the side who called them, then cross-examined (American style) */
  public callWitness(channelId: string, witness: Member, calledBy: Side): WitnessResult {
    const trial = this.get(channelId);

    if (trial === undefined) return "no-trial";
    if (trial.phase !== "witnesses") return "closed";
    if (trial.witness !== null) return "busy";

    trial.witness = {
      member: witness,
      calledBy,
      stage: "examination",
      stageEndsAt: Date.now() + WITNESS_STAGE_MS,
    };
    if (!trial.witnessesCalled.some((member) => member.id === witness.id)) trial.witnessesCalled.push(witness);
    this.emit("event", {
      type: "witness",
      trial,
      witness: trial.witness,
    });
    this.armWitness(trial);
    return "ok";
  }

  public dismissWitness(channelId: string): void {
    const trial = this.get(channelId);
    if (trial?.witness !== null && trial !== undefined) this.releaseWitness(trial);
  }

  /** American style: counsel of the side without the floor objects, and the code rules at random. Never during the judge's turn or the vote. */
  public object(channelId: string, objector: Member): ObjectionResult {
    const trial = this.get(channelId);

    if (trial === undefined) return "no-trial";
    if (trial.style !== "american") return "not-american";

    const floor = floorOf(trial);
    const side = sideOf(trial, objector.id);

    if (side === null || (floor !== "prosecution" && floor !== "defense") || floor === side) return "not-allowed";

    const ruling: ObjectionRuling = this.rng() < 0.5 ? "sustained" : "overruled";
    this.emit("event", {
      type: "objection",
      trial,
      objector,
      ruling,
    });
    return ruling;
  }

  public vote(channelId: string, voterId: string, guilty: boolean): VoteResult {
    const trial = this.get(channelId);

    if (trial === undefined) return "no-trial";
    if (trial.phase !== "vote") return "closed";
    if (trial.accused.some((member) => member.id === voterId) || voterId === trial.plaintiff.id) return "not-allowed";

    trial.votes.set(voterId, guilty);
    this.emit("event", {
      type: "vote-cast",
      trial,
    });
    return "ok";
  }

  private armPhase(trial: Trial, index: number): void {
    const schedule = SCHEDULES[trial.style];
    const step = schedule[index];

    if (step === undefined) return;

    if (step.phase === "witnesses") {
      setTimeout(() => {
        if (trial.phase === "witnesses" && trial.witnessesCalled.length === 0 && this.get(trial.channelId) === trial) this.advance(trial, index + 1);
      }, NO_WITNESS_MS).unref();
    }

    setTimeout(() => {
      if (trial.phase === step.phase && this.get(trial.channelId) === trial) this.advance(trial, index + 1);
    }, step.ms).unref();
  }

  private advance(trial: Trial, index: number): void {
    if (trial.witness !== null) this.releaseWitness(trial);

    const step = SCHEDULES[trial.style][index];

    if (step !== undefined) {
      trial.phase = step.phase;
      trial.phaseEndsAt = Date.now() + step.ms;
      this.emit("event", {
        type: "phase",
        trial,
      });
      this.armPhase(trial, index);
      return;
    }

    // The debate is over: the people vote, or the judge deliberates alone.
    const judgeOnly = trial.mode === "bench";
    trial.phase = judgeOnly ? "deliberation" : "vote";
    trial.phaseEndsAt = Date.now() + (judgeOnly ? DELIBERATION_MS : VOTE_MS);
    this.emit("event", {
      type: "phase",
      trial,
    });

    setTimeout(
      () => {
        void this.close(trial);
      },
      judgeOnly ? DELIBERATION_MS : VOTE_MS,
    ).unref();
  }

  private async close(trial: Trial): Promise<void> {
    // The judge's own vote comes from the AI, which never throws (it falls back to null):
    const judgeGuilty = trial.mode === "jury" ? null : await this.judgeVote(trial);
    this.states.delete(trial.channelId);
    this.emit("event", {
      type: "verdict",
      trial,
      verdict: computeVerdict(trial.votes, trial.mode, judgeGuilty, this.rng),
    });
  }

  private armWitness(trial: Trial): void {
    clearTimeout(this.witnessTimers.get(trial.channelId));
    this.witnessTimers.set(
      trial.channelId,
      setTimeout(() => {
        const witness = trial.witness;

        if (witness === null || this.get(trial.channelId) !== trial) return;

        // American style: after the examination comes the cross-examination by the other side; then the witness goes back.
        if (witness.stage === "examination" && trial.style === "american") {
          trial.witness = {
            ...witness,
            stage: "cross",
            stageEndsAt: Date.now() + WITNESS_STAGE_MS,
          };
          this.emit("event", {
            type: "witness",
            trial,
            witness: trial.witness,
          });
          this.armWitness(trial);
          return;
        }

        this.releaseWitness(trial);
      }, WITNESS_STAGE_MS).unref(),
    );
  }

  private releaseWitness(trial: Trial): void {
    clearTimeout(this.witnessTimers.get(trial.channelId));
    this.witnessTimers.delete(trial.channelId);
    trial.witness = null;
    this.emit("event", {
      type: "witness",
      trial,
      witness: null,
    });
  }
}
