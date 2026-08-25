-- Every trip is sealed. A pre-sealing trip with no epoch becomes epoch 0 with nobody holding the
-- key — the same keyless state the phones already handle, and what it was in practice.
UPDATE "trips" SET "key_epoch" = 0 WHERE "key_epoch" IS NULL;--> statement-breakpoint
ALTER TABLE "trips" ALTER COLUMN "key_epoch" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "trips" ALTER COLUMN "key_epoch" SET NOT NULL;
