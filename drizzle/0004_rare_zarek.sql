CREATE TABLE "market_views" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"member_id" text NOT NULL,
	"market_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "market_views" ADD CONSTRAINT "market_views_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_views" ADD CONSTRAINT "market_views_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "market_views_member_market_idx" ON "market_views" USING btree ("member_id","market_id");