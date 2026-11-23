import type { RecordEntry, Trial, Verdict } from "./engine";
import { tableTrial } from "#/tables/trial";
import { postgres } from "#/utils/postgres";
import { desc, eq } from "drizzle-orm";

const MAX_RECORD_ENTRIES = 20;

export const saveTrial = async (trial: Trial, verdict: Verdict, sentence: string | null): Promise<void> => {
  await postgres.insert(tableTrial).values({
    channelId: trial.channelId,
    accusedId: trial.accused.id,
    accusedName: trial.accused.name,
    plaintiffId: trial.plaintiff.id,
    plaintiffName: trial.plaintiff.name,
    lawyerId: trial.lawyer?.id ?? null,
    crime: trial.crime,
    guilty: verdict.guilty,
    reversed: verdict.reversed,
    coinFlip: verdict.coinFlip,
    guiltyVotes: verdict.guiltyVotes,
    innocentVotes: verdict.innocentVotes,
    sentence,
  });
};

/** Latest trials of a member as the accused, newest first */
export const fetchRecord = async (userId: string): Promise<RecordEntry[]> => postgres
  .select({
    crime: tableTrial.crime,
    plaintiffName: tableTrial.plaintiffName,
    guilty: tableTrial.guilty,
    reversed: tableTrial.reversed,
    sentence: tableTrial.sentence,
    createdAt: tableTrial.createdAt,
  })
  .from(tableTrial)
  .where(eq(tableTrial.accusedId, userId))
  .orderBy(desc(tableTrial.createdAt))
  .limit(MAX_RECORD_ENTRIES);
