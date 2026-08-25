import { env } from "./env.ts";

/** The commit this server was built from, or null for a local build. */
export const build = env.GIT_SHA ? { sha: env.GIT_SHA, short: env.GIT_SHA.slice(0, 7) } : null;
