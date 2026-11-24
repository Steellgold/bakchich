import { tableRuling } from "#/tables/ruling";
import { postgres } from "#/utils/postgres";
import { desc, sql } from "drizzle-orm";

const MAX_PRECEDENTS = 3;
const MAX_TEXT_LENGTH = 300;

export type Ruling = typeof tableRuling.$inferSelect;

/** Files a decision in the case law of the Royaume, and returns its number */
export const saveRuling = async (input: {
  authorId: string;
  authorName: string;
  question: string;
  decision: string;
}): Promise<number> => {
  const [saved] = await postgres.insert(tableRuling).values(input).returning({ id: tableRuling.id });

  if (saved === undefined) throw new Error("The ruling was not saved");

  return saved.id;
};

/** Past decisions sharing words with a message, newest first (any word matches, websearch syntax never fails on user text) */
export const searchRulings = async (text: string): Promise<Ruling[]> => {
  const words = text.match(/\p{L}{4,}/gu) ?? [];

  if (words.length === 0) return [];

  const query = sql`websearch_to_tsquery('french', ${words.join(" or ")})`;
  return postgres
    .select()
    .from(tableRuling)
    .where(sql`to_tsvector('french', ${tableRuling.question} || ' ' || ${tableRuling.decision}) @@ ${query}`)
    .orderBy(desc(tableRuling.createdAt))
    .limit(MAX_PRECEDENTS);
};

/** One precedent as the judge reads it */
export const formatRuling = (ruling: Ruling): string => `Décision n°${String(ruling.id)} du ${ruling.createdAt.toLocaleDateString("fr-FR")}, demandée par ${ruling.authorName} : « ${ruling.question.slice(0, MAX_TEXT_LENGTH)} » : ${ruling.decision.slice(0, MAX_TEXT_LENGTH)}`;
