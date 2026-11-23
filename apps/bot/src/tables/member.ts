import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Members known by the bot (anyone who interacted with it), shown seated in the courtroom */
export const tableMember = pgTable("member", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
});
