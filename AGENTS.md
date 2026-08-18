# Chiang Pai — agent notes

Private zero-sum prediction game for one friend group. Next.js 16 App Router +
server actions, Postgres via Drizzle, dependency-free Google OAuth + invite
allowlist (`lib/auth.ts`).

## Commands (pnpm 11)

- `pnpm dev` — dev server (needs `docker compose up -d db` and a `.env`)
- `pnpm test` — vitest; the only tests are `lib/engine.test.ts` (settlement math). Keep it that way — no UI tests.
- `pnpm lint` / `pnpm format` — Biome (2-space, 100 cols, double quotes)
- `pnpm tsc --noEmit` — typecheck
- `pnpm db:generate` — new Drizzle migration after editing `lib/db/schema.ts`
- `pnpm db:migrate` — apply migrations (also run by the `migrate` compose service)
- `pnpm seed` — demo data (dev only)
- `pnpm lingo:gen` — compile `lingo.yaml` into `lib/lingo.data.ts` (`dev` and
  `build` run it first, so you rarely call it by hand)

Pre-commit (husky): biome on staged files, tsc, engine tests.

## Architecture rules

- `lib/ledger` model: the `ledger` table is append-only; balances and positions
  are always derived by replaying it. Never store or overwrite a balance.
- All settlement math lives in `lib/engine.ts` (pure, tested). Zero-sum is the
  invariant: payouts must sum exactly to the pool (largest-remainder rounding).
- Pies are integer centi-pies end to end; format only at the edge (`lib/pies.ts`).
- `lib/env.ts` is the only file that reads `process.env` — everything else
  imports `env` from there (zod-validated).
- Relative imports inside `lib/` and `scripts/` carry explicit `.ts` extensions
  so plain `node scripts/*.ts` runs them (Node type stripping).
- Members have an infinite bank: no starting grant, net can go negative, the
  per-market exposure cap (`MAX_STAKE_PIES`) is the only brake.
- The inbox is derived from markets + ledger at read time; the only stored
  notification state is `members.inbox_seen_at`.
- Every flavored string lives in `lingo.yaml` (edited by hand), never in a
  component. `lib/lingo.data.ts` is generated from it and gitignored
  (`postinstall`, `dev`, and `build` all regenerate it); `english` is the
  reference — the generator rejects a lingo whose fields don't match it.
- Addresses are canonicalized through `normalizeEmail` (`lib/email.ts`) before
  any lookup or write: Gmail ignores dots, so the allowlist, `members.email`,
  and `FOUNDING_MEMBERS` all key off the dotless spelling.
- The UI says *prediction*, *bet*, *resolve*, *pool*, *pie*; the code and schema
  say `market`, `stake`, `settle*`, `amountC`. Don't half-rename either side.
- pnpm uses the hoisted node linker (see pnpm-workspace.yaml) so Next.js
  standalone output works identically locally and in Docker.
- One Docker image serves the app AND runs migrations: next.config.ts
  (`outputFileTracingIncludes`) bundles scripts/, drizzle/, lib/, and the raw
  drizzle-orm/pg/zod packages into the standalone output. Everything is arm64
  (GitHub arm runners, OCI arm host, Apple Silicon dev).
- Honor pnpm's supply-chain `minimumReleaseAge` policy: if an install fails on a
  too-fresh package, pin an older version — never add exclusions without the
  owner's approval.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
