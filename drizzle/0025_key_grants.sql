CREATE TABLE "key_grants" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"epoch" integer NOT NULL,
	"to_member_id" text NOT NULL,
	"from_member_id" text NOT NULL,
	"wrapped" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"taken_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "key_stale_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "key_grants" ADD CONSTRAINT "key_grants_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "key_grants" ADD CONSTRAINT "key_grants_to_member_id_members_id_fk" FOREIGN KEY ("to_member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "key_grants" ADD CONSTRAINT "key_grants_from_member_id_members_id_fk" FOREIGN KEY ("from_member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "key_grants_to_idx" ON "key_grants" USING btree ("trip_id","to_member_id","epoch");