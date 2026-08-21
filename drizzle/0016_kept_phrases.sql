CREATE TYPE "public"."talk_side" AS ENUM('us', 'them');--> statement-breakpoint
CREATE TABLE "phrases" (
	"id" text PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"slug" text NOT NULL,
	"side" "talk_side" NOT NULL,
	"heard" text NOT NULL,
	"said" text NOT NULL,
	"roman" text,
	"literal" text,
	"language" text NOT NULL,
	"tag" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "phrases" ADD CONSTRAINT "phrases_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "phrases_member_idx" ON "phrases" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "phrases_member_slug_idx" ON "phrases" USING btree ("member_id","slug");