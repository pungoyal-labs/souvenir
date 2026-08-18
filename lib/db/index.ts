import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../env.ts";
import * as schema from "./schema.ts";

// Migrations are NOT run here. They run as an explicit one-shot step:
// `npm run db:migrate` locally, or the `migrate` service in docker compose.

// Survive Next.js dev-server module reloads with a single pool.
const globalForDb = globalThis as unknown as { __cpPool?: Pool };

if (!globalForDb.__cpPool) {
  globalForDb.__cpPool = new Pool({ connectionString: env.DATABASE_URL });
}
const pool = globalForDb.__cpPool;

export const db = drizzle(pool, { schema });
