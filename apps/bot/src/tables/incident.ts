import { columns } from "#/utils/postgres";
import { index, pgTable, text, uuid } from "drizzle-orm/pg-core";

/** Disorder in the courtroom (a fight broken up by the police), written in the casier of the member */
export const tableIncident = pgTable(
  "incident",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: text("member_id").notNull(),
    memberName: text("member_name").notNull(),
    kind: text("kind", {
      enum: ["trouble"],
    }).notNull(),
    createdAt: columns.createdAt,
  },
  (table) => [index("incident_member_id_idx").on(table.memberId)],
);
