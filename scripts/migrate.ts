// One-shot migration runner. Used by the `migrate` docker compose service
// (runs and exits) and by `npm run db:migrate` locally.
// Run with: node --env-file=.env scripts/migrate.ts   (env file optional)

import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "../lib/db/index.ts";

async function main() {
  await migrate(db, {
    migrationsFolder: path.join(process.cwd(), "drizzle"),
  });
  console.log("migrations applied");
  process.exit(0);
}

main().catch((err) => {
  console.error("migration failed:", err);
  process.exit(1);
});
