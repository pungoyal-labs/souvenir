# Deploy checklist

Pushing to `main` is the deploy: CI runs the gates, builds one arm64 image,
and over SSH pulls it on the box and runs `docker compose up -d` — the
one-shot `migrate` service against the live database, then `app`
(`README.md`, *Deployment*). The box's `.env` is **rendered on every deploy
from the GitHub environment `oracle-cloud`** (`.github/workflows/ci.yml`):
a variable lives there or nowhere, and editing the file on the box lasts
until the next push. Nothing here needs a hand on the running containers;
what needs a hand is that environment, and a backup when the schema moves.

## Every release

1. **Read the diff for two things**: a new migration under `drizzle/`, and
   a new or changed variable in `lib/env.ts` (`.env.example` documents each).
2. **Migration?** Back up first — `docker exec chiang-pai-db-1 pg_dump -U chiangpai chiangpai > backup-$(date +%F).sql` on the box. Migrations are forward-only, and some have been destructive (`docs/private-trips.md` §7).
3. **New variable?** Add it to `ci.yml`'s `.env` heredoc and set it in the
   `oracle-cloud` environment *before* pushing; a required one missing stops
   the app at boot (`lib/env.ts` refuses to start), an optional one missing
   silently hides its feature. A blank value is the same as unset.
4. **Push `main`.** Watch the Actions run to the deploy job.
5. **Verify**: the footer names the new build (`GIT_SHA`);
   `docker compose run --rm migrate node scripts/stats.ts` still reads the
   trips; open the live trip on a phone that holds the key.

## This release — destinations, no country in code

No migration. Production has never had a server voice (`SPEECH_*` was not in
the rendered `.env`), so the talk page speaks with the phone's own voice and
says so where a phone has none. This release makes the server voice per
language and puts its variables in the deploy; turning it on is optional and
can happen after the push:

- In the `oracle-cloud` environment: var `SPEECH_BASE_URL`
  (`https://api.minimax.io`), var `SPEECH_VOICES=th=Thai_male_1_sample8`
  (one entry per language a live trip speaks), and var `SPEECH_VOICE_THEM`
  naming one voice as the fallback for every other language — without it a
  language with no entry gets the device's voice or none. The key is
  `LLM_API_KEY` unless a `SPEECH_API_KEY` secret says otherwise: one vendor.
  `POST /v1/get_voice` lists the account's voices.
- **Check before anyone hears it**: run the *Speech check* workflow from the
  Actions tab. It runs `pnpm speech:check` with the environment's values —
  a greeting in every language a trip can speak, failing on any the vendor
  refuses — and uploads one clip per language for a person to play. Only
  then redeploy (re-run the last deploy job, or push). The same script runs
  locally against a `.env`, or on the box:
  `docker compose run --rm -v "$PWD/clips:/app/clips" migrate node scripts/speech-check.ts`.
- On the Thailand trip's `/talk`: the ครับ/ค่ะ toggle shows, a turn
  interprets, and on a phone with no Thai voice the server speaks — or the
  page says it couldn't.

## Earlier releases, for the record

- **Trips release** (migrations 0017–0018): the one table became trip
  `chiang-mai`, founders became organisers; `FOUNDING_MEMBERS`,
  `MAX_STAKE_PIES`, `GROUP_LANGUAGE`, `GROUP_DESTINATION` left `.env`;
  `/privacy` and `/terms` were added to the Google OAuth consent screen; the
  18+ bar appeared once for members who predated it.
- **Private trips** (0019–0028): the cutovers are recorded in
  `docs/private-trips.md` §7, including the `pg_dump` before `0022` dropped
  the plaintext tables.
