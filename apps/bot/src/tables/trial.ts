import type { Member, Mode, Style } from "#/features/court/engine";
import { columns } from "#/utils/postgres";
import { boolean, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";

/** Finished trials: the court records (casier) and the case files of the clerk; the ID is the one of the trial in progress, shared with its transcript */
export const tableTrial = pgTable("trial", {
  id: uuid("id").primaryKey(),
  channelId: text("channel_id").notNull(),
  plaintiffId: text("plaintiff_id").notNull(),
  plaintiffName: text("plaintiff_name").notNull(),
  lawyerId: text("lawyer_id"),
  crime: text("crime").notNull(),
  guilty: boolean("guilty").notNull(),
  reversed: boolean("reversed").notNull(),
  coinFlip: boolean("coin_flip").notNull(),
  guiltyVotes: integer("guilty_votes").notNull(),
  innocentVotes: integer("innocent_votes").notNull(),
  sentence: text("sentence"),
  style: text("style", {
    enum: ["american", "french"],
  })
    .$type<Style>()
    .notNull()
    .default("american"),
  mode: text("mode", {
    enum: ["jury", "bench", "assizes"],
  })
    .$type<Mode>()
    .notNull()
    .default("jury"),
  witnesses: jsonb("witnesses").$type<Member[]>().notNull().default([]),
  /** Case file written by the AI from the transcript: what happened, the key arguments */
  summary: text("summary"),
  createdAt: columns.createdAt,
});
