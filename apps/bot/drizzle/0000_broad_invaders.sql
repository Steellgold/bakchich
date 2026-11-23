CREATE TABLE "trial" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" text NOT NULL,
	"accused_id" text NOT NULL,
	"accused_name" text NOT NULL,
	"plaintiff_id" text NOT NULL,
	"plaintiff_name" text NOT NULL,
	"lawyer_id" text,
	"crime" text NOT NULL,
	"guilty" boolean NOT NULL,
	"reversed" boolean NOT NULL,
	"coin_flip" boolean NOT NULL,
	"guilty_votes" integer NOT NULL,
	"innocent_votes" integer NOT NULL,
	"sentence" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
