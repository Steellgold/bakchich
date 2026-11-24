CREATE TABLE "incident" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" text NOT NULL,
	"member_name" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcript_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trial_id" uuid NOT NULL,
	"speaker_id" text NOT NULL,
	"speaker_name" text NOT NULL,
	"role" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trial" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "hearing" ADD COLUMN "preparation_channel_id" text;--> statement-breakpoint
ALTER TABLE "hearing" ADD COLUMN "style" text DEFAULT 'american' NOT NULL;--> statement-breakpoint
ALTER TABLE "hearing" ADD COLUMN "gravity" text DEFAULT 'ordinary' NOT NULL;--> statement-breakpoint
ALTER TABLE "hearing" ADD COLUMN "jury_requested" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "trial" ADD COLUMN "style" text DEFAULT 'american' NOT NULL;--> statement-breakpoint
ALTER TABLE "trial" ADD COLUMN "mode" text DEFAULT 'jury' NOT NULL;--> statement-breakpoint
ALTER TABLE "trial" ADD COLUMN "witnesses" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "trial" ADD COLUMN "summary" text;--> statement-breakpoint
CREATE INDEX "incident_member_id_idx" ON "incident" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "transcript_line_trial_id_idx" ON "transcript_line" USING btree ("trial_id");--> statement-breakpoint
CREATE INDEX "transcript_line_speaker_id_idx" ON "transcript_line" USING btree ("speaker_id");