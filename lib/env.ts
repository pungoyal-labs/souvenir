// The single place environment configuration is read and validated.
// Next.js (and `node --env-file=.env` for scripts) loads .env; this module
// validates it with zod and every other file imports `env` from here —
// never process.env directly.

import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // 127.0.0.1, not localhost: the compose port bind is IPv4-only, and
  // localhost can resolve to ::1 first and refuse the connection.
  DATABASE_URL: z.string().default("postgres://souvenir:souvenir@127.0.0.1:5566/souvenir"),

  /** Pino level. Defaults to info in production, debug otherwise (lib/logger.ts). */
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).optional(),

  // Required everywhere — sessions are HMAC-signed with it, so there is no
  // safe fallback value. Build machines export a placeholder (see Dockerfile
  // and ci.yml); the running server gets its real value from .env.
  AUTH_SECRET: z
    .string()
    .min(16, "AUTH_SECRET is required — generate one with `openssl rand -base64 32`"),
  /**
   * Public base URL. Google callbacks, cookie `secure`, and the passkey rp id
   * all derive from it. Unlike DATABASE_URL above, this one says `localhost`
   * and must not be "made consistent" with 127.0.0.1: a relying party id has
   * to be a domain name, and no browser will register a passkey against an IP
   * address (lib/auth.ts, passkeysConfigured).
   */
  AUTH_URL: z
    .url()
    .default("http://localhost:3000")
    .transform((u) => u.replace(/\/+$/, "")),
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),

  /** Local development only: enables a passwordless fake login. Never set in production. */
  AUTH_DEV_LOGIN: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  /** Resolved markets required before a member appears in the ranked leaderboard. */
  /** Where a member writes: grievances, and a request to see the code they are running. */
  CONTACT_EMAIL: z.string().email().optional(),
  /** The commit the running image was built from (Dockerfile); absent in dev. */
  GIT_SHA: z.string().optional(),
  RANKED_MIN_RESOLVED: z.coerce.number().int().positive().default(5),

  // Optional LLM used to polish market drafts before publishing.
  // Any Anthropic-compatible endpoint works (e.g. MiniMax M3 via its
  // Anthropic-style API). The feature is hidden unless URL + key are set.
  LLM_BASE_URL: z.string().optional(),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().default("MiniMax-M3"),

  // Optional voice for the talk page, for phones with no voice of their own.
  // Unset, the page still works: it types, it reads, and the device speaks if
  // it can.
  SPEECH_BASE_URL: z.string().optional(),
  SPEECH_API_KEY: z.string().optional(),
  SPEECH_TTS_MODEL: z.string().default("speech-2.6-turbo"),
  /**
   * Which MiniMax voice says which language: `th=Thai_male_1_sample8,hi=…`,
   * one entry per language code a trip can speak (lib/talk.ts). Its voices
   * are cross-lingual — `language_boost` says which language the words are in
   * and the voice reads them in its own accent — so a language with no entry
   * falls back to the side's voice below: the group's own side to an Indian
   * voice rather than an American one, and the local side to whatever
   * `SPEECH_VOICE_THEM` names, or to nothing, since a deploy serves trips to
   * many places and no one voice is the local one everywhere. Deliberately
   * never the same person on both sides: the whole point of the page is that
   * two people are talking.
   */
  SPEECH_VOICES: z.string().default(""),
  SPEECH_VOICE_US: z.string().default("hindi_female_1_v2"),
  SPEECH_VOICE_THEM: z.string().optional(),
  /**
   * How the local side is delivered. Semitones down and a little under speed:
   * lower and slower than the voice's own register, which is what carries
   * across a market stall. MiniMax takes pitch in semitones, -12 to 12.
   */
  SPEECH_VOICE_THEM_PITCH: z.coerce.number().min(-12).max(12).default(-5),
  SPEECH_VOICE_THEM_SPEED: z.coerce.number().min(0.5).max(2).default(0.9),
  /** Only where the account still requires it on the query. */
  SPEECH_GROUP_ID: z.string().optional(),

  /**
   * Where the day's exchange rate comes from, for settling a two-currency trip
   * in the home currency (lib/rates.ts). Any host serving currency-api's
   * shape (`/v1/currencies/{code}.min.json`). Unreachable, the bills page
   * settles each currency on its own.
   */
  FX_BASE_URL: z
    .url()
    .default("https://latest.currency-api.pages.dev")
    .transform((u) => u.replace(/\/+$/, "")),
});

// A blank line (`SPEECH_VOICE_THEM=`) is the variable not set, not set to
// nothing: the deploy renders every known name from the GitHub environment and
// leaves the unused ones empty, and a default or `optional()` must still hold.
const present = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ""));

export const env = envSchema.parse(present);

export type Env = typeof env;
