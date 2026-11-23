import { columns } from "#/utils/postgres";
import { boolean, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";

/** Finished trials: the court records (casier) */
export const tableTrial = pgTable("trial", {
  id: uuid("id").primaryKey().defaultRandom(),
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
  createdAt: columns.createdAt,
});
