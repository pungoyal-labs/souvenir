CREATE TYPE "public"."market_reaction" AS ENUM('upvote', 'watch');--> statement-breakpoint
CREATE TABLE "market_reactions" (
	"market_id" text NOT NULL,
	"member_id" text NOT NULL,
	"kind" "market_reaction" NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "market_reactions_market_id_member_id_kind_pk" PRIMARY KEY("market_id","member_id","kind")
);
--> statement-breakpoint
ALTER TABLE "market_reactions" ADD CONSTRAINT "market_reactions_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_reactions" ADD CONSTRAINT "market_reactions_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "market_reactions_member_idx" ON "market_reactions" USING btree ("member_id");