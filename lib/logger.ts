// The single shared logger: pino, JSON lines on stdout (synchronous, so
// nothing is lost when scripts exit). Level comes from LOG_LEVEL, defaulting
// to info in production and debug everywhere else.
//
// What a line may say: ids (member, trip, market), roles, counts, timings,
// and errors. What it never says: an email, a link code, a key, a cookie, or
// anything from a sealed trip — the server cannot read those, and the log
// must not become the one place it could. `redact` backstops the keys a
// secret is most likely to arrive under; it is not permission to pass one.

import { format } from "node:util";
import { pino } from "pino";
import { build } from "./build.ts";
import { env } from "./env.ts";

// `err.code` is an errno and stays; a link's code only ever lands at the top.
const REDACT = [
  "code",
  "secret",
  "token",
  "password",
  "email",
  "*.secret",
  "*.token",
  "*.password",
  "*.email",
  "headers.cookie",
  "headers.authorization",
  "*.headers.cookie",
  "*.headers.authorization",
];

export const logger = pino({
  level: env.LOG_LEVEL ?? (env.NODE_ENV === "production" ? "info" : "debug"),
  // Which build wrote the line — the first question a stale-client error asks.
  base: build ? { service: "souvenir", build: build.short } : { service: "souvenir" },
  timestamp: pino.stdTimeFunctions.isoTime,
  // The level as a word: every collector reads "error"; not all read 50.
  formatters: { level: (label) => ({ level: label }) },
  redact: { paths: REDACT, censor: "[redacted]" },
});

// Next.js reports its own errors (deployment skew, render failures, its
// uncaught-exception handler) with bare console calls — multi-line plain text
// on stderr between our JSON lines, which a log collector can only mark
// unparseable. There is no config for it, so in production instrumentation.ts
// routes console through the logger: one JSON record per call, the stack
// under `err`. Dev keeps the readable console. pino writes to the fd
// directly, so nothing recurses.
const CONSOLE_LEVELS = [
  ["error", "error"],
  ["warn", "warn"],
  ["log", "info"],
  ["info", "info"],
  ["debug", "debug"],
] as const;

export function consoleToLogger() {
  for (const [method, level] of CONSOLE_LEVELS) {
    console[method] = (...args: unknown[]) => {
      const err = args.find((a): a is Error => a instanceof Error);
      if (err) {
        const rest = args.filter((a) => a !== err);
        logger[level](err, rest.length > 0 ? format(...rest) : err.message);
      } else {
        logger[level](format(...args));
      }
    };
  }
}
