import type { Member, TestTiming } from "./engine";

/** Test mode only: every phase of the real schedule, a few seconds to a minute each (about 5 minutes with the vote and the verdict) */
export const TEST_TIMING: TestTiming = {
  phases: {
    "opening": 10_000,
    "prosecution": 40_000,
    "defense": 40_000,
    "witnesses": 85_000,
    "closing-prosecution": 25_000,
    "closing-defense": 25_000,
  },
  vote: 30_000,
  deliberation: 10_000,
  witnessStage: 35_000,
  noWitness: 20_000,
};

/** What a guilty test accused is "sentenced" to: nothing is stored or enforced */
export const TEST_SENTENCE = "Peine fictive (procès test) : aucune conséquence, rien n'est enregistré.";

/** Virtual parties played by the bot: they are not Discord members */
export const TEST_PERSONAS = {
  accused: {
    id: "test-accused",
    name: "Gérard Prévenu",
  },
  prosecutor: {
    id: "test-prosecutor",
    name: "Mme Accusatrice",
  },
  witness: {
    id: "test-witness",
    name: "Josette Témoin",
  },
} satisfies Record<string, Member>;

/** Virtual jurors who vote in the test trial */
export const TEST_JURORS = ["test-juror-1", "test-juror-2", "test-juror-3", "test-juror-4"] as const;

/** The only server where a test trial can be started (and only in its AGENTS category) */
export const TEST_TRIAL_GUILD_ID = "1388591986914885652";

export const isTestGuild = (guildId: string): boolean => guildId === TEST_TRIAL_GUILD_ID;
