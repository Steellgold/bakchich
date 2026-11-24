import { columns } from "#/utils/postgres";
import { pgTable, serial, text } from "drizzle-orm/pg-core";

/** Decisions the judge rendered outside of any trial (« tranche : X ou Y »): the case law of the Royaume, numbered */
export const tableRuling = pgTable("ruling", {
  id: serial("id").primaryKey(),
  authorId: text("author_id").notNull(),
  authorName: text("author_name").notNull(),
  question: text("question").notNull(),
  decision: text("decision").notNull(),
  createdAt: columns.createdAt,
});
