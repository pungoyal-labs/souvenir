// One-shot migration runner. Used by the `migrate` docker compose service
// (runs and exits) and by `npm run db:migrate` locally.
// Run with: node --env-file=.env scripts/migrate.ts   (env file optional)

import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "../lib/db/index.ts";
import { logger } from "../lib/logger.ts";

async function main() {
  await migrate(db, {
    migrationsFolder: path.join(process.cwd(), "drizzle"),
  });
  logger.info("migrations applied");
  process.exit(0);
}

main().catch((err) => {
  logger.error({ err }, "migration failed");
  process.exit(1);
});
