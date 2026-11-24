import type { RecordEntry, Trial, Verdict } from "./engine";
import { tableTrial } from "#/tables/trial";
import { tableTrialAccused } from "#/tables/trial-accused";
import { postgres } from "#/utils/postgres";
import { desc, eq } from "drizzle-orm";

const MAX_RECORD_ENTRIES = 20;

/** The finished trial becomes a record and a case file, under the ID its transcript already uses */
export const saveTrial = async (trial: Trial, verdict: Verdict, sentence: string | null, summary: string | null): Promise<void> => {
  await postgres.transaction(async (transaction) => {
    const [saved] = await transaction
      .insert(tableTrial)
      .values({
        id: trial.id,
        channelId: trial.channelId,
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
        style: trial.style,
        mode: trial.mode,
        witnesses: trial.witnessesCalled,
        summary,
      })
      .returning({ id: tableTrial.id });

    if (saved === undefined) throw new Error("The trial was not saved");

    await transaction.insert(tableTrialAccused).values(
      trial.accused.map((member) => ({
        trialId: saved.id,
        accusedId: member.id,
        accusedName: member.name,
      })),
    );
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
  .from(tableTrialAccused)
  .innerJoin(tableTrial, eq(tableTrial.id, tableTrialAccused.trialId))
  .where(eq(tableTrialAccused.accusedId, userId))
  .orderBy(desc(tableTrial.createdAt))
  .limit(MAX_RECORD_ENTRIES);
