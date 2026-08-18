-- Gmail ignores dots in the local part, and every lookup now canonicalizes the
-- address first (lib/email.ts). Rows written with dots would stop matching the
-- account that signs in, so fold the existing ones onto the canonical spelling.
-- No-op on a database that never stored a dotted Gmail address.

-- An invite whose canonical twin is already listed is redundant.
DELETE FROM "allowlist" AS a
WHERE split_part(a."email", '@', 2) IN ('gmail.com', 'googlemail.com')
  AND strpos(split_part(a."email", '@', 1), '.') > 0
  AND EXISTS (
    SELECT 1
    FROM "allowlist" AS b
    WHERE b."email" =
      replace(split_part(a."email", '@', 1), '.', '') || '@' || split_part(a."email", '@', 2)
  );
--> statement-breakpoint
UPDATE "allowlist"
SET "email" =
  replace(split_part("email", '@', 1), '.', '') || '@' || split_part("email", '@', 2)
WHERE split_part("email", '@', 2) IN ('gmail.com', 'googlemail.com')
  AND strpos(split_part("email", '@', 1), '.') > 0;
--> statement-breakpoint
-- Members own ledger history, so a collision is never resolved by dropping a
-- row: canonicalize only where no canonical member exists yet, and leave a true
-- duplicate pair (two members, two ledgers, one human) to be merged by hand.
UPDATE "members" AS m
SET "email" =
  replace(split_part(m."email", '@', 1), '.', '') || '@' || split_part(m."email", '@', 2)
WHERE split_part(m."email", '@', 2) IN ('gmail.com', 'googlemail.com')
  AND strpos(split_part(m."email", '@', 1), '.') > 0
  AND NOT EXISTS (
    SELECT 1
    FROM "members" AS m2
    WHERE m2."email" =
      replace(split_part(m."email", '@', 1), '.', '') || '@' || split_part(m."email", '@', 2)
      AND m2."id" <> m."id"
  );
