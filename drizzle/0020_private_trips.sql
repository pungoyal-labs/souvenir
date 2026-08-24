CREATE TABLE "cards" (
	"market_id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"published_by" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"question" text NOT NULL,
	"verdict" text NOT NULL,
	"lines" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"trip_id" text NOT NULL,
	"author_id" text NOT NULL,
	"epoch" integer NOT NULL,
	"body" text NOT NULL,
	CONSTRAINT "events_body_size" CHECK (length("events"."body") <= 16384)
);
--> statement-breakpoint
CREATE TABLE "keyrings" (
	"member_id" text PRIMARY KEY NOT NULL,
	"blob" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rekeys" (
	"code" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"for_member_id" text NOT NULL,
	"minted_by" text NOT NULL,
	"wrapped_key" text NOT NULL,
	"epoch" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "wrapped_key" text;--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "epoch" integer;--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "preview" text;--> statement-breakpoint
ALTER TABLE "recoveries" ADD COLUMN "wrapped_key" text;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "key_epoch" integer;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "name_enc" text;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_published_by_members_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_author_id_members_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyrings" ADD CONSTRAINT "keyrings_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rekeys" ADD CONSTRAINT "rekeys_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rekeys" ADD CONSTRAINT "rekeys_for_member_id_members_id_fk" FOREIGN KEY ("for_member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rekeys" ADD CONSTRAINT "rekeys_minted_by_members_id_fk" FOREIGN KEY ("minted_by") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_trip_id_idx" ON "events" USING btree ("trip_id","id");--> statement-breakpoint
CREATE INDEX "rekeys_trip_member_idx" ON "rekeys" USING btree ("trip_id","for_member_id");