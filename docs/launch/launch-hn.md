# Launch HN draft

**Title:** Launch HN: Souvenir – a zero-sum, play-money prediction game for your friends' trip

**Body:**

Hi HN. I built this for my own friend group's trip to Chiang Mai and it turned into the only reason the trip happened.

The problem every group chat has: someone says "Thailand in November?", eleven people say "yes yes", and in October four have booked. The planner does 30 unpaid hours and gets blamed for the hotel. Then everyone falls out over who paid for the tuk-tuk.

Souvenir is a private prediction game about the trip itself. Anyone opens a call — "Will everyone have flights booked by Friday?", "Will Rohan be last to the airport?" — with plain resolution rules. Everyone backs YES or NO with stamps, a made-up unit. When it resolves, winners split exactly what losers put in: zero-sum, no house, no odds displayed. There's a leaderboard per trip, head-to-head "nemesis" records, and a recap when you get home.

Some things I think are interesting:

- **Nothing is stored as a balance.** The ledger is append-only and every number — pools, positions, the leaderboard — is replayed from it at read time. Reopening a wrong verdict writes reversal rows rather than deleting anything. Settlement uses largest-remainder rounding and is fuzz-tested to sum exactly to the pool.
- **No money, deliberately.** India banned real-money online games in 2025 (PROGA); the line in the Act is whether the token was *purchased*. Stamps are never bought or cashed out, and the app refuses to record money on a prediction at all. That one design decision is what makes it legal everywhere and keeps it off the "simulated gambling 18+" store ratings. Loser buys dinner is your business; the app just keeps score.
- **Join by link, no app, no email.** Your friends tap a WhatsApp link, see the table before they sign up, pick a name, and make a passkey. WebAuthn verified on `node:crypto` with no auth library. An invite code is a bearer token, so links are short-lived and revocable instead of unguessable.
- **Every trip is end-to-end encrypted.** Predictions, calls, verdicts, comments, bills, the phrasebook, even the trip's name are sealed on the phone under a key the server never holds. The server orders the log and counts bytes; every phone replays the rules (cap, one side, zero-sum) over the whole log itself, so a rule refusal comes from your own phone. The key travels only through people — in an invite link's URL fragment, in short-lived key links between members — and is backed up under each passkey's PRF secret, so a synced passkey restores it on a new phone. A seat that leaves marks the trip for key rotation. The image is built by CI with a Sigstore attestation, so a member who asks can check the code that ran was the code they were told about.
- **Bills in exactly two currencies**, decided when the trip opens (the destination's and your home one; one currency for a domestic trip), settled in the fewest transfers — and, when you're home, in one currency at the day's rate plus the forex charge the card took. And a tap-to-talk interpreter with a shared phrasebook, because Google Translate doesn't know we're eight people and one of us is vegetarian. Twenty-one destinations; each is one line of configuration (language, currency, timezone), nothing in the code is about a country.
- It's a PWA. No store.

Stack: Next.js 16 App Router, Postgres via Drizzle, TypeScript, WebCrypto, ~390 tests on the pure modules (the tests are the spec). One arm64 container. Free, and it will stay free for groups.

Try it with your next trip: [URL]. Source: [repo, if public]. I'd love to hear what your group argues about.
