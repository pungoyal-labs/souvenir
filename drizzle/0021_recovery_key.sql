ALTER TABLE "recoveries" ADD COLUMN "trip_id" text;--> statement-breakpoint
ALTER TABLE "recoveries" ADD COLUMN "epoch" integer;--> statement-breakpoint
ALTER TABLE "recoveries" ADD CONSTRAINT "recoveries_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;