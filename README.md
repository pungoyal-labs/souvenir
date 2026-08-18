# Chiang Pai

A private, social, peer-to-peer prediction market for one fixed group of
friends. Virtual units only, strictly zero-sum, no house. Every prediction
creates a position, every position has consequences, every outcome is recorded —
and over time the leaderboard reveals who is actually good at predicting things.

## The game

- Any member opens a **market**: one binary question plus explicit resolution
  criteria. The creator settles it later as **YES**, **NO**, or **void**.
- Members back either side, up to **10 units** total exposure per market
  (`MAX_STAKE_UNITS`). One side at a time; a **switch** moves your whole stake
  across before resolution.
- On resolution the winning side splits the **entire pool** pro-rata. Rounding
  uses the largest-remainder method so payouts sum to the pool exactly. Voided
  markets (and resolutions where nobody held the winning side) refund all stakes.
- Members have an **infinite bank**: there is no starting balance and no
  balance check — your headline number is lifetime net, and it can go negative.
- The **leaderboard** ranks by return on units wagered, and only once you have
  `RANKED_MIN_RESOLVED` (default 5) resolved predictions; before that you're
  "calibrating". No odds or implied probabilities are ever displayed.
- Each member has an **inbox**: new markets, moves on markets they're in, and
  verdicts on their calls. It is derived from the ledger at read time — the only
  stored state is a per-member "seen" timestamp.

## Accounting

The `ledger` table is append-only and is the single source of truth. Every unit
movement is a row (`bet`, `switch`, `payout`, `refund`); balances, positions,
pools, results, and the leaderboard are all derived by replaying it. Nothing is
ever overwritten, so every historical market and every member's full unit
history can be reconstructed. Units are stored as integer centi-units so the
zero-sum property survives fractional payouts; `lib/engine.ts` holds the pure
settlement math and `lib/engine.test.ts` fuzz-tests the invariant.

## Stack

Next.js 16 (App Router, server actions) · React 19 · TypeScript 7 ·
Tailwind CSS 4 · Google OAuth (no auth library) · Postgres 18 · Drizzle ORM ·
Biome · Vitest · pnpm 11 · Docker. Optional LLM polish of market drafts via any
Anthropic-compatible API (configured for MiniMax M3).

## Local development

```sh
cp .env.example .env          # fill in FOUNDING_MEMBERS at minimum
docker compose up -d db       # Postgres on 127.0.0.1:${DB_PORT:-5433}
pnpm install
pnpm db:migrate
pnpm seed                     # optional demo data
pnpm dev                      # http://localhost:3000
```

Without Google OAuth credentials, set `AUTH_DEV_LOGIN=true` to get a
passwordless dev login (any email, bypasses the invite list). **Never enable it
in production.**

Full stack in Docker instead: `docker compose up -d --build` (db → one-shot
`migrate` container → app).

## Configuration

All environment variables are validated in one place, `lib/env.ts` — see
`.env.example` for the complete annotated list. Highlights:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection (dev default matches compose) |
| `AUTH_URL` | Public base URL / domain; Google OAuth callbacks derive from it |
| `AUTH_GOOGLE_ID/SECRET` | Google OAuth app (redirect URI `{AUTH_URL}/api/auth/callback/google`) |
| `FOUNDING_MEMBERS` | Comma-separated emails: always allowed in, and the only members who can invite |
| `MAX_STAKE_UNITS` | Per-member exposure cap per market (default 10) |
| `RANKED_MIN_RESOLVED` | Resolved predictions needed to appear ranked (default 5) |
| `DB_PORT` / `APP_PORT` / `APP_BIND` / `PORT` | Fully configurable database and HTTP ports |
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | Optional Anthropic-compatible endpoint for draft polish (hidden when unset) |

Membership is controlled: Google sign-in is only accepted for emails in
`FOUNDING_MEMBERS` or invited via the members page (founders only).

## Quality gates

- `pnpm test` — settlement-engine tests (the only tests, by design)
- `pnpm lint` / `pnpm tsc --noEmit`
- Pre-commit hook (husky): Biome on staged files + typecheck + engine tests
- CI (`.github/workflows/ci.yml`): Biome → typecheck → tests → build, then
  a Docker image to GHCR, then deploy

## Deployment (OCI over SSH)

Push to `main` runs the pipeline on arm64 runners (matching the arm64 OCI
host): verify → build & push one arm64 GHCR image (`:sha`) → SSH into the OCI
box, pull the pinned tag, and `docker compose up -d` (compose runs the one-shot
`migrate` container from the same image, then bounces `app`).

Configure a GitHub **environment named `oracle-cloud`** with:

| Kind | Name | Value |
| --- | --- | --- |
| var | `OCI_HOST` | server hostname/IP |
| var | `OCI_USER` | ssh user |
| var | `OCI_SSH_PORT` | optional, defaults to 22 |
| var | `DEPLOY_DIR` | directory on the server holding `docker-compose.yml` + `.env` |
| secret | `OCI_SSH_KEY` | private key for the ssh user |

No registry credentials are needed: the deploy job logs the server into GHCR
with its own ephemeral `GITHUB_TOKEN` (`packages: read`), which is valid for
exactly as long as the deploy runs.

One-time server setup: install Docker, create `DEPLOY_DIR` containing this
repo's `docker-compose.yml` and a production `.env` (strong `AUTH_SECRET` and
`POSTGRES_PASSWORD`, real `AUTH_URL` domain, Google credentials,
`FOUNDING_MEMBERS`), and point your reverse proxy at
`127.0.0.1:${APP_PORT:-3000}`.
