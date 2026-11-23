CREATE TABLE "trial_accused" (
	"trial_id" uuid NOT NULL,
	"accused_id" text NOT NULL,
	"accused_name" text NOT NULL,
	CONSTRAINT "trial_accused_trial_id_accused_id_pk" PRIMARY KEY("trial_id","accused_id")
);
--> statement-breakpoint
ALTER TABLE "trial_accused" ADD CONSTRAINT "trial_accused_trial_id_trial_id_fk" FOREIGN KEY ("trial_id") REFERENCES "public"."trial"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trial_accused_accused_id_idx" ON "trial_accused" USING btree ("accused_id");--> statement-breakpoint
INSERT INTO "trial_accused" ("trial_id", "accused_id", "accused_name") SELECT "id", "accused_id", "accused_name" FROM "trial";--> statement-breakpoint
ALTER TABLE "trial" DROP COLUMN "accused_id";--> statement-breakpoint
ALTER TABLE "trial" DROP COLUMN "accused_name";