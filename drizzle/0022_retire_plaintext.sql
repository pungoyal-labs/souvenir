ALTER TABLE "bill_entries" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bill_revisions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bills" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "comment_mentions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "comments" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "keyrings" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ledger" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "market_reactions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "market_views" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "markets" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "bill_entries" CASCADE;--> statement-breakpoint
DROP TABLE "bill_revisions" CASCADE;--> statement-breakpoint
DROP TABLE "bills" CASCADE;--> statement-breakpoint
DROP TABLE "comment_mentions" CASCADE;--> statement-breakpoint
DROP TABLE "comments" CASCADE;--> statement-breakpoint
DROP TABLE "keyrings" CASCADE;--> statement-breakpoint
DROP TABLE "ledger" CASCADE;--> statement-breakpoint
DROP TABLE "market_reactions" CASCADE;--> statement-breakpoint
DROP TABLE "market_views" CASCADE;--> statement-breakpoint
DROP TABLE "markets" CASCADE;--> statement-breakpoint
ALTER TABLE "trips" ALTER COLUMN "name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "trip_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
DROP TYPE "public"."bill_kind";--> statement-breakpoint
DROP TYPE "public"."bill_split";--> statement-breakpoint
DROP TYPE "public"."ledger_kind";--> statement-breakpoint
DROP TYPE "public"."market_reaction";--> statement-breakpoint
DROP TYPE "public"."market_status";--> statement-breakpoint
DROP TYPE "public"."side";