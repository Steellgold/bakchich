import type { Member } from "#/court/engine";
import { columns } from "#/utils/postgres";
import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Trials announced and waiting for their time, so a restart of the bot loses none of them */
export const tableHearing = pgTable("hearing", {
  id: uuid("id").primaryKey().defaultRandom(),
  channelId: text("channel_id").notNull(),
  accused: jsonb("accused").$type<Member[]>().notNull(),
  plaintiffId: text("plaintiff_id").notNull(),
  plaintiffName: text("plaintiff_name").notNull(),
  crime: text("crime").notNull(),
  /** The message the request was a reply to, when there was one */
  context: text("context"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  eventId: text("event_id"),
  status: text("status", { enum: ["scheduled", "started", "cancelled"] }).notNull().default("scheduled"),
  createdAt: columns.createdAt,
});
