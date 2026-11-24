import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Members known by the bot (anyone who interacted with it), shown seated in the courtroom */
export const tableMember = pgTable("member", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  /** What the judge knows about the member: temperament, humor, habits, memorable actions (notes written by the clerk) */
  profile: text("profile"),
  profiledAt: timestamp("profiled_at", { withTimezone: true }),
  /** The member asked the judge to forget them (« oublie-moi »): no notes are taken any more */
  forgotten: boolean("forgotten").notNull().default(false),
});
