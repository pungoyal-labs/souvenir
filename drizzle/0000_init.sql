CREATE TYPE "public"."ledger_kind" AS ENUM('grant', 'bet', 'switch', 'payout', 'refund');--> statement-breakpoint
CREATE TYPE "public"."market_status" AS ENUM('open', 'yes', 'no', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."side" AS ENUM('yes', 'no');--> statement-breakpoint
CREATE TABLE "allowlist" (
	"email" text PRIMARY KEY NOT NULL,
	"invited_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"member_id" text NOT NULL,
	"market_id" text,
	"kind" "ledger_kind" NOT NULL,
	"side" "side",
	"amount_c" integer NOT NULL,
	"balance_delta_c" integer NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "markets" (
	"id" text PRIMARY KEY NOT NULL,
	"creator_id" text NOT NULL,
	"question" text NOT NULL,
	"criteria" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "market_status" DEFAULT 'open' NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolution_note" text
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"image" text,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "members_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "allowlist" ADD CONSTRAINT "allowlist_invited_by_members_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger" ADD CONSTRAINT "ledger_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger" ADD CONSTRAINT "ledger_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "markets" ADD CONSTRAINT "markets_creator_id_members_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;