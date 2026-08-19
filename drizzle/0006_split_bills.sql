CREATE TYPE "public"."bill_kind" AS ENUM('expense', 'settlement');--> statement-breakpoint
CREATE TYPE "public"."bill_split" AS ENUM('equal', 'custom');--> statement-breakpoint
CREATE TYPE "public"."currency" AS ENUM('inr', 'thb');--> statement-breakpoint
CREATE TABLE "bill_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"revision_id" bigint NOT NULL,
	"member_id" text NOT NULL,
	"paid_c" integer DEFAULT 0 NOT NULL,
	"owed_c" integer DEFAULT 0 NOT NULL,
	"participant" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bill_revisions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"bill_id" text NOT NULL,
	"editor_id" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"kind" "bill_kind" DEFAULT 'expense' NOT NULL,
	"on_date" date NOT NULL,
	"description" text NOT NULL,
	"currency" "currency" NOT NULL,
	"split" "bill_split" DEFAULT 'equal' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bills" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bill_entries" ADD CONSTRAINT "bill_entries_revision_id_bill_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."bill_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_entries" ADD CONSTRAINT "bill_entries_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_revisions" ADD CONSTRAINT "bill_revisions_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_revisions" ADD CONSTRAINT "bill_revisions_editor_id_members_id_fk" FOREIGN KEY ("editor_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bill_entries_revision_idx" ON "bill_entries" USING btree ("revision_id");--> statement-breakpoint
CREATE INDEX "bill_revisions_bill_idx" ON "bill_revisions" USING btree ("bill_id");