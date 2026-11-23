import { tableTrial } from "./trial";
import { index, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";

/** Who was accused in each finished trial: one row per accused, so every casier shows the trial */
export const tableTrialAccused = pgTable("trial_accused", {
  trialId: uuid("trial_id").notNull().references(() => tableTrial.id, { onDelete: "cascade" }),
  accusedId: text("accused_id").notNull(),
  accusedName: text("accused_name").notNull(),
}, (table) => [
  primaryKey({ columns: [table.trialId, table.accusedId] }),
  index("trial_accused_accused_id_idx").on(table.accusedId),
]);
