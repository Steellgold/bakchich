import type { Gravity, Member, Style } from "#/features/court/engine";
import { columns } from "#/utils/postgres";
import { boolean, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Trials announced and waiting for their time, so a restart of the bot loses none of them */
export const tableHearing = pgTable("hearing", {
  id: uuid("id").primaryKey().defaultRandom(),
  channelId: text("channel_id").notNull(),
  accused: jsonb("accused").$type<Member[]>().notNull(),
  /** Lawyer of the defense: a member who accepted, or the AI lawyer; null for no lawyer */
  lawyer: jsonb("lawyer").$type<Member | null>(),
  plaintiffId: text("plaintiff_id").notNull(),
  plaintiffName: text("plaintiff_name").notNull(),
  crime: text("crime").notNull(),
  /** The message the request was a reply to, when there was one */
  context: text("context"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  /** Voice channel created by the bot for this hearing, deleted after it */
  voiceChannelId: text("voice_channel_id"),
  eventId: text("event_id"),
  /** Voice room of the defense preparation, deleted after it (or after a restart) */
  preparationChannelId: text("preparation_channel_id"),
  style: text("style", {
    enum: ["american", "french"],
  })
    .$type<Style>()
    .notNull()
    .default("american"),
  /** Given by the AI when it screens the accusation: it decides the judgment mode */
  gravity: text("gravity", {
    enum: ["light", "ordinary", "serious"],
  })
    .$type<Gravity>()
    .notNull()
    .default("ordinary"),
  /** The accused claimed a jury for a light case */
  juryRequested: boolean("jury_requested").notNull().default(false),
  status: text("status", {
    enum: ["scheduled", "started", "cancelled", "finished"],
  })
    .notNull()
    .default("scheduled"),
  createdAt: columns.createdAt,
});
