import type { Member, Trial } from "#/features/court/engine";
import { AI_LAWYER, formatNames, isTest } from "#/features/court/engine";
import { tableIncident } from "#/tables/incident";
import { tableTranscriptLine } from "#/tables/transcript-line";
import { tableTrial } from "#/tables/trial";
import { tableTrialAccused } from "#/tables/trial-accused";
import { postgres } from "#/utils/postgres";
import { and, asc, count, desc, eq, inArray, or, sql } from "drizzle-orm";

export const CLERK: Member = {
  id: "clerk",
  name: "Le Greffier",
};
export const JUDGE: Member = {
  id: "judge",
  name: "Le Juge",
};

const MAX_SEARCH_RESULTS = 3;
const MAX_QUOTES = 3;

export type TranscriptLine = {
  speakerName: string;
  role: string;
  text: string;
};

/** Role of a speaker in a trial, as the clerk writes it */
export const roleOf = (trial: Trial, speakerId: string): string => {
  if (speakerId === JUDGE.id) return "juge";
  if (speakerId === CLERK.id) return "greffier";
  if (speakerId === AI_LAWYER.id || speakerId === trial.lawyer?.id) return "défense";
  if (trial.accused.some((member) => member.id === speakerId)) return "accusé";
  if (speakerId === trial.plaintiff.id) return "accusation";
  if (trial.witness?.member.id === speakerId) return "témoin";

  return "public";
};

/** The transcript of the test trials in progress: kept in memory only, never in the database */
const testTranscripts = new Map<string, TranscriptLine[]>();

/** A test trial is over: its transcript goes away with it */
export const forgetTestTranscript = (trialId: string): void => {
  testTranscripts.delete(trialId);
};

/** The clerk types a line of the hearing (text only) */
export const recordLine = async (trial: Trial, speaker: Member, text: string): Promise<void> => {
  if (isTest(trial)) {
    testTranscripts.set(trial.id, [...(testTranscripts.get(trial.id) ?? []), {
      speakerName: speaker.name,
      role: roleOf(trial, speaker.id),
      text,
    }]);
    return;
  }

  await postgres.insert(tableTranscriptLine).values({
    trialId: trial.id,
    speakerId: speaker.id,
    speakerName: speaker.name,
    role: roleOf(trial, speaker.id),
    text,
  });
};

export const fetchTranscript = async (trialId: string): Promise<TranscriptLine[]> => testTranscripts.get(trialId) ?? postgres
  .select({
    speakerName: tableTranscriptLine.speakerName,
    role: tableTranscriptLine.role,
    text: tableTranscriptLine.text,
  })
  .from(tableTranscriptLine)
  .where(eq(tableTranscriptLine.trialId, trialId))
  .orderBy(asc(tableTranscriptLine.createdAt));

export const formatTranscript = (lines: TranscriptLine[]): string => lines.map((line) => `${line.speakerName} (${line.role}) : ${line.text}`).join("\n");

export type CaseFile = {
  date: Date;
  accused: string;
  plaintiffName: string;
  crime: string;
  guilty: boolean;
  sentence: string | null;
  summary: string | null;
  witnesses: Member[];
};

/** Past trials matching words (French full-text search on the crime, the case file and the transcript) or involving the given members */
export const searchArchives = async (query: string, memberIds: string[]): Promise<CaseFile[]> => {
  const words = sql`plainto_tsquery('french', ${query})`;
  const inTranscript = postgres
    .select({ id: tableTranscriptLine.trialId })
    .from(tableTranscriptLine)
    .where(sql`to_tsvector('french', ${tableTranscriptLine.text}) @@ ${words}`);
  const ofMembers = postgres
    .select({ id: tableTrialAccused.trialId })
    .from(tableTrialAccused)
    .where(inArray(tableTrialAccused.accusedId, memberIds.length === 0 ? [""] : memberIds));

  const trials = await postgres
    .select()
    .from(tableTrial)
    .where(
      or(
        sql`to_tsvector('french', ${tableTrial.crime} || ' ' || coalesce(${tableTrial.summary}, '')) @@ ${words}`,
        inArray(tableTrial.id, inTranscript),
        inArray(tableTrial.id, ofMembers),
        inArray(tableTrial.plaintiffId, memberIds.length === 0 ? [""] : memberIds),
      ),
    )
    .orderBy(desc(tableTrial.createdAt))
    .limit(MAX_SEARCH_RESULTS);

  const accused
    = trials.length === 0 ? [] : await postgres
      .select()
      .from(tableTrialAccused)
      .where(
        inArray(
          tableTrialAccused.trialId,
          trials.map((trial) => trial.id),
        ),
      );
  return trials.map((trial) => ({
    date: trial.createdAt,
    accused: formatNames(accused.filter((row) => row.trialId === trial.id).map((row) => row.accusedName)),
    plaintiffName: trial.plaintiffName,
    crime: trial.crime,
    guilty: trial.guilty,
    sentence: trial.sentence,
    summary: trial.summary,
    witnesses: trial.witnesses,
  }));
};

export const formatCaseFile = (file: CaseFile): string => [
  `Procès du ${file.date.toLocaleDateString("fr-FR")} : ${file.accused}, accusé par ${file.plaintiffName} de « ${file.crime} ».`,
  `Verdict : ${file.guilty ? "coupable" : "non coupable"}${file.sentence === null ? "" : `, peine : ${file.sentence}`}.`,
  file.witnesses.length === 0 ? "" : `Témoins : ${formatNames(file.witnesses.map((member) => member.name))}.`,
  file.summary ?? "",
]
  .filter((line) => line !== "")
  .join("\n");

export type Dossier = {
  prosecutions: number;
  prosecutionsWon: number;
  defenses: number;
  defensesWon: number;
  testimonies: number;
  incidents: number;
  quotes: string[];
};

/** What the archives know about a member besides the trials they were accused in: roles held, trials won, disorder, memorable lines */
export const fetchDossier = async (memberId: string): Promise<Dossier> => {
  const [prosecutions] = await postgres
    .select({
      total: count(),
      won: sql<number>`count(*) filter (where ${tableTrial.guilty})`.mapWith(Number),
    })
    .from(tableTrial)
    .where(eq(tableTrial.plaintiffId, memberId));

  const [defenses] = await postgres
    .select({
      total: count(),
      won: sql<number>`count(*) filter (where not ${tableTrial.guilty})`.mapWith(Number),
    })
    .from(tableTrial)
    .where(eq(tableTrial.lawyerId, memberId));

  const [testimonies] = await postgres
    .select({ total: count() })
    .from(tableTrial)
    .where(sql`${tableTrial.witnesses} @> ${JSON.stringify([{ id: memberId }])}::jsonb`);

  const [incidents] = await postgres.select({ total: count() }).from(tableIncident).where(eq(tableIncident.memberId, memberId));
  // The longest lines said in hearings make the best quotes:
  const quotes = await postgres
    .select({ text: tableTranscriptLine.text })
    .from(tableTranscriptLine)
    .where(and(eq(tableTranscriptLine.speakerId, memberId), sql`length(${tableTranscriptLine.text}) > 20`))
    .orderBy(desc(sql`length(${tableTranscriptLine.text})`))
    .limit(MAX_QUOTES);

  return {
    prosecutions: prosecutions?.total ?? 0,
    prosecutionsWon: prosecutions?.won ?? 0,
    defenses: defenses?.total ?? 0,
    defensesWon: defenses?.won ?? 0,
    testimonies: testimonies?.total ?? 0,
    incidents: incidents?.total ?? 0,
    quotes: quotes.map((quote) => quote.text),
  };
};

export const formatDossier = (dossier: Dossier): string => [
  `Procès lancés : ${String(dossier.prosecutions)} (${String(dossier.prosecutionsWon)} gagnés). Défenses : ${String(dossier.defenses)} (${String(dossier.defensesWon)} acquittements). Témoignages : ${String(dossier.testimonies)}.`,
  dossier.incidents === 0 ? "" : `Troubles à l'audience : ${String(dossier.incidents)}.`,
  dossier.quotes.length === 0 ? "" : `Répliques consignées :\n${dossier.quotes.map((quote) => `« ${quote} »`).join("\n")}`,
]
  .filter((line) => line !== "")
  .join("\n");

/** A fight in the courtroom ends in the casier */
export const recordIncident = async (member: Member): Promise<void> => {
  await postgres.insert(tableIncident).values({
    memberId: member.id,
    memberName: member.name,
    kind: "trouble",
  });
};
