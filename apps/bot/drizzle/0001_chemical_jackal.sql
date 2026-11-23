CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"avatar_url" text,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
