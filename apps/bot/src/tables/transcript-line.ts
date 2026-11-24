import { columns } from "#/utils/postgres";
import { index, pgTable, text, uuid } from "drizzle-orm/pg-core";

/** What the clerk typed during a hearing: every line said, by whom and in which role. Only text, never any audio. */
export const tableTranscriptLine = pgTable(
  "transcript_line",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** ID of the trial in progress, which becomes the ID of the finished trial */
    trialId: uuid("trial_id").notNull(),
    /** Discord ID, or "judge", "clerk" and the AI lawyer ID */
    speakerId: text("speaker_id").notNull(),
    speakerName: text("speaker_name").notNull(),
    role: text("role").notNull(),
    text: text("text").notNull(),
    createdAt: columns.createdAt,
  },
  (table) => [
    index("transcript_line_trial_id_idx").on(table.trialId),
    index("transcript_line_speaker_id_idx").on(table.speakerId),
  ],
);
