-- Each trip's events get their own order, 1, 2, 3…, assigned under the trip row's lock from
-- here on; existing rows are numbered in id order, which is the order phones already read them in.
DROP INDEX "events_trip_id_idx";--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "seq" integer;--> statement-breakpoint
UPDATE "events" AS e SET "seq" = numbered.rn
FROM (SELECT "id", row_number() OVER (PARTITION BY "trip_id" ORDER BY "id") AS rn FROM "events") AS numbered
WHERE e."id" = numbered."id";--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "seq" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "events_trip_seq_idx" ON "events" USING btree ("trip_id","seq");
