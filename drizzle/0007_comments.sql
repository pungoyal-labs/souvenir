CREATE TABLE "comment_mentions" (
	"comment_id" bigint NOT NULL,
	"member_id" text NOT NULL,
	CONSTRAINT "comment_mentions_comment_id_member_id_pk" PRIMARY KEY("comment_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"author_id" text NOT NULL,
	"market_id" text,
	"bill_id" text,
	"body" text NOT NULL,
	CONSTRAINT "comments_one_subject" CHECK (("market_id" IS NULL) <> ("bill_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "comment_mentions" ADD CONSTRAINT "comment_mentions_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_mentions" ADD CONSTRAINT "comment_mentions_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_members_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comment_mentions_member_idx" ON "comment_mentions" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "comments_market_idx" ON "comments" USING btree ("market_id");--> statement-breakpoint
CREATE INDEX "comments_bill_idx" ON "comments" USING btree ("bill_id");