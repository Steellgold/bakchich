import { columns } from "#/utils/postgres";
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Sentences the bot enforces on Discord: what the convicted must do in every message, until when */
export const tablePenalty = pgTable(
  "penalty",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: text("member_id").notNull(),
    memberName: text("member_name").notNull(),
    guildId: text("guild_id").notNull(),
    kind: text("kind", {
      enum: ["suffix", "prefix", "banned-word", "uppercase"],
    }).notNull(),
    /** The phrase to end or start with, or the banned word; empty for uppercase */
    text: text("text").notNull(),
    /** Reaction on a forgotten message between two reminders */
    emoji: text("emoji").notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    createdAt: columns.createdAt,
  },
  (table) => [index("penalty_member_id_idx").on(table.memberId)],
);
