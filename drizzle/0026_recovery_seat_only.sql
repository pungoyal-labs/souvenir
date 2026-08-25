ALTER TABLE "recoveries" DROP CONSTRAINT "recoveries_trip_id_trips_id_fk";
--> statement-breakpoint
ALTER TABLE "recoveries" DROP COLUMN "wrapped_key";--> statement-breakpoint
ALTER TABLE "recoveries" DROP COLUMN "trip_id";--> statement-breakpoint
ALTER TABLE "recoveries" DROP COLUMN "epoch";