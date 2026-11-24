CREATE TABLE "excluded_channel" (
	"channel_id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "penalty" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" text NOT NULL,
	"member_name" text NOT NULL,
	"guild_id" text NOT NULL,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"emoji" text NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "penalty_member_id_idx" ON "penalty" USING btree ("member_id");--> statement-breakpoint
-- Serious channels of « Le Royaume » where sentences are never enforced:
INSERT INTO "excluded_channel" ("channel_id") VALUES ('1455622155357130854'), ('1455622005389787187') ON CONFLICT DO NOTHING;
