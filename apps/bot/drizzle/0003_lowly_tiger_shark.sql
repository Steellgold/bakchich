CREATE TABLE "hearing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" text NOT NULL,
	"accused" jsonb NOT NULL,
	"plaintiff_id" text NOT NULL,
	"plaintiff_name" text NOT NULL,
	"crime" text NOT NULL,
	"context" text,
	"starts_at" timestamp with time zone NOT NULL,
	"event_id" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
