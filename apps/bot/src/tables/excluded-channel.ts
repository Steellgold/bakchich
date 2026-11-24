import { columns } from "#/utils/postgres";
import { pgTable, text } from "drizzle-orm/pg-core";

/** Channels and categories where sentences are not enforced (serious channels), managed with /chexclude */
export const tableExcludedChannel = pgTable("excluded_channel", {
  channelId: text("channel_id").primaryKey(),
  createdAt: columns.createdAt,
});
