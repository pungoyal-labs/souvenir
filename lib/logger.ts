// The single shared logger: pino, JSON lines on stdout (synchronous, so
// nothing is lost when scripts exit). Level comes from LOG_LEVEL, defaulting
// to info in production and debug everywhere else.

import { pino } from "pino";
import { env } from "./env.ts";

export const logger = pino({
  level: env.LOG_LEVEL ?? (env.NODE_ENV === "production" ? "info" : "debug"),
});
