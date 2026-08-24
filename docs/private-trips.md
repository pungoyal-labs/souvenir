# Private trips — end-to-end encryption, planned properly

Status: decisions settled 2026-08-24; Phase 0 in review (`private-trips-phase-0`). Written against the codebase at `a654787`.

## 0. The promise, stated precisely

> A trip is readable only on the phones of the people on it. The server keeps
> the trip sealed: it can count and order, it cannot read.

**Protected** (every phone on the trip can read it; the server and anyone with
its database cannot): predictions, criteria, resolution notes, every call —
side and pies — results, the leaderboard, comments and mentions, reactions,
page views, bills and every amount in them, kept phrases, the trip's name.

**Protected against**: a database dump, a backup, a compromised host, an
operator holding `DATABASE_URL`, a legal demand for the database, and (from
Phase 3) a member who was removed and later gets hold of a copy.

**Not protected, and said plainly on `/privacy`** — the shape of the trip, not
its content: that a trip exists; its destination, dates, currencies and cap
(v1 — see §8); who is on it (name, and email if they sign in with Google) and
with what role; when each member did something and how large it was; invite,
rekey and recovery lineage. Words sent to the polisher, the interpreter and
the speech service pass through the server to the model provider for the
duration of the request, exactly as today, and are still never stored.

**The web caveat.** The server serves the code that holds the keys. A
malicious deploy could ship a client that leaks them. No web app escapes this;
what we can do is make a bad deploy detectable (Phase 5: reproducible build,
the image digest published on `/privacy`, the client source public) and make
sure no server-side path can ever *ask* a client for a key. The honest line for
`/privacy`: *"We cannot read your trip. We could, in principle, ship you code
that could — which is why the code is public and every release is signed."*

## 1. Principles

1. **Keys travel between people, never through the server in the clear.**
   Every key-bearing link carries its secret in the URL fragment (`#…`), which
   browsers never send. The server stores keys only wrapped under secrets it
   has never seen.
2. **No device gets a key without a tap on a device that already has one.**
   This closes the ghost-device attack that breaks most E2EE designs: the
   server cannot add a "new phone" for a member and have everyone's client
   silently encrypt to it, because nothing ever encrypts to a key the server
   handed over.
3. **The server is a sealed, ordered, append-only log.** It enforces the seat
   (membership), the order (a sequence number), the size, the rate and the key
   epoch. It never enforces content, because it cannot see any. The ledger's
   philosophy — derive everything by replay — becomes the whole trip's.
4. **The rules are code every phone runs.** Exposure cap, one side per
   prediction, zero-sum settlement, who may resolve, one slug per phrase: all
   deterministic replay in pure, fuzz-tested modules. An event that breaks a
   rule is ignored by every honest client. A modified client can only lie to
   its own screen.
5. **The seat and the key are two different things.** Sign-in (passkey or
   Google) grants the seat; the key grants reading. Either alone gets nobody
   in. A stolen session on a keyless phone sees ciphertext; a leaked link with
   no seat cannot even fetch it.
6. **Nothing quiet.** Every key hand-over — join, rekey, recovery, new device,
   rotation — lands in the sealed log as an event the whole table sees, the
   way recoveries are announced on the members page today.

## 2. Cryptography

WebCrypto only — `globalThis.crypto.subtle` exists in every target browser and
in Node ≥ 20, so vitest runs the same code. No library, matching
`lib/webauthn.ts` and `lib/cbor.ts`.

| Primitive | Use |
|---|---|
| AES-256-GCM, 96-bit random IV | every envelope, every wrap |
| HKDF-SHA-256 | link secret → wrap key; PRF output → keyring wrap key |
| ECDH P-256 + HKDF | rotated trip keys to a member's long-term key (Phase 3) |
| `crypto.getRandomValues` | keys, IVs, link secrets |

### Keys

| Key | Lives | Made by | Purpose |
|---|---|---|---|
| **TK[trip, epoch]** trip key | keyring | the creator's client at epoch 0; the rotating client after | encrypts every event on the trip. Epoch bumps on every rotation; old epochs stay in the keyring so history stays readable |
| **KK[member]** keyring key | IndexedDB (non-extractable); wrapped under each passkey's PRF secret on the server (Phase 4) | the member's client on first use | encrypts the keyring blob |
| **MK[member]** member key | keyring | the member's client at first keyring | P-256 ECDH pair; the public half is announced *inside the log* (`member.hello`) so rotation can encrypt a new trip key to it without trusting any server column |
| **s** link secret | the URL fragment, and the keyring of whoever minted it (so they can re-share) | the minting client | 256 random bits; `HKDF(s, "invite" \| "rekey" \| "recover" \| "preview" \| "device")` wraps what the link carries |
| **PRF secret** | the passkey authenticator | the authenticator, per credential | stable across a synced passkey's copies, so wrapping KK under it is a free cross-device backup |

### Keyring

```
{ v: 1,
  mk: <P-256 private JWK>,
  trips: { [tripId]: { [epoch]: <AES key raw> } },
  links: { [code]: s } }          // secrets of links this member minted
```

Encrypted under KK; stored as an opaque blob in `keyrings` (optimistic
`version`) and mirrored in IndexedDB. The server learns its size and when it
changed.

### Envelope

```
v1.<epoch>.<iv b64url>.<ciphertext b64url>
AAD = `${tripId}|${authorId}|${epoch}`
```

The server sets `author_id` from the session, never from the body. Because the
author is bound into the AAD by the *writer*, a member cannot post as somebody
else (their AAD would name themselves, the row would name them; readers'
decrypt would fail) and an operator cannot relabel a row (same failure). No
signatures needed.

### Event payload (inside the envelope)

```
{ t: "market.create" | "call" | "switch" | "resolve" | "reopen"
   | "comment" | "react" | "view"
   | "bill.rev" | "bill.settle"
   | "phrase.keep" | "phrase.drop"
   | "member.hello" | "member.key" | "member.role" | "trip.rename",
  id?: string,        // client-minted random id for markets/bills/phrases
  marketId?: string,  // etc. — exactly what today's rows carry, minus what the server needs
  ... }
```

Versioned (`v` on the envelope, `t` on the payload). Replay ignores types it
does not know, so old clients keep working through a new event type.

`member.role` is in the log as well as in `memberships.role`: the server
gates invites and recoveries on its column, replay judges a reopen by who
organised *at the time*, and Phase 1 writes both from one action. Without it
a role change would silently re-judge history on every phone.

Uniqueness that used to be a database constraint — a phrase slug per trip, a
market id — is a replay rule: the *first* event to claim it wins, later ones
are rejected. No blind indexes, nothing for the server to check.

## 3. Data model

### New tables

- `events(id bigserial pk, trip_id, author_id, at, epoch int, body text)` —
  index `(trip_id, id)`. Append-only. The server checks: the author holds a
  seat on the trip; `epoch = trips.key_epoch`; `length(body) ≤ 16 KiB`; a
  per-member rate. Nothing else.
- `keyrings(member_id pk, blob text, version int, updated_at)` — opaque.
- `keyring_wraps(credential_id pk, member_id, wrapped_kk text)` — KK under a
  passkey's PRF secret. Phase 4.
- `key_grants(id, trip_id, epoch, to_member_id, from_member_id, wrapped text,
  at, taken_at)` — TK[epoch] encrypted to the recipient's MK. Phase 3.
- `rekeys(code pk, trip_id, for_member_id, minted_by, wrapped_key, epoch,
  expires_at, used_at)` — a key for a member who already has a seat. Any
  member can mint one for any member. 30 minutes, one use, redeemable only by
  a session that *is* `for_member_id`.
- `cards(market_id pk, trip_id, published_by, at, question, verdict, lines
  json)` — the one deliberate plaintext: a member tapped *share*.

### Changed tables

- `trips`: `+key_epoch int`, null until the trip is sealed — the flag that
  tells a sealed trip from one still on the plaintext tables; `name` →
  `name_enc` (the join preview gets the name through the link).
- `invites`: `+wrapped_key`, `+preview` (encrypted under `HKDF(s,"preview")`),
  `+epoch`.
- `recoveries`: `+wrapped_key` nullable — null when minted from the console,
  which can restore a seat and nothing else.

### Retired (Phase 4, after migration)

`markets`, `ledger`, `market_views`, `market_reactions`, `comments`,
`comment_mentions`, `bills`, `bill_revisions`, `bill_entries`, `phrases`. Each
is an event type now. The ledger's comment in `schema.ts` — "balances and
positions are always derived by replaying it" — becomes true of everything.

### Stays plaintext, on purpose

`members` (name, email, lingo, terms), `memberships` (seat, role, invited_with,
inbox cursor), `credentials`, `avatars`, `invites`/`recoveries`/`rekeys`
metadata, `trips` shape (destination, dates, currencies, cap, epoch). §8 lists
what could still move.

## 4. Flows

### 4.1 A device wakes up

After sign-in the client looks for a keyring: IndexedDB first; then the
server's `keyrings` row, which it can open only with a KK — from IndexedDB, or
(Phase 4) from a PRF-wrapped copy after a passkey sign-in. A member with no
keyring anywhere gets a fresh one (new MK). A member whose keyring exists but
cannot be opened on this device is **keyless**: they have their seats, they
see the roster, and every trip page shows *Get the key* (§4.8) instead of
content.

### 4.2 Open a trip

The creator's client: `TK[0] ← random`, into the keyring, keyring uploaded,
`createTrip({ name_enc, destination, dates, … })`. Then the first event:
`member.hello { mkPub }`.

### 4.3 Mint an invite

The organiser's client: `s ← random`; `wrapped_key = AES(HKDF(s,"invite"),
TK[cur])`; `preview = AES(HKDF(s,"preview"), { name, names, questions })`;
`mintInvite(label, isOpen, epoch, wrapped_key, preview)`. The link shown is
`/join/<code>#<s>`. `s` is kept in the minter's keyring so the members page
can show the full link again. Other organisers cannot re-share a link they did
not mint; they mint their own.

### 4.4 Join

`/join/[code]` becomes client-rendered: it reads the fragment, fetches the
invite row (public, as today), decrypts the preview, and shows the table — to
link holders only, which is truer to the intent than today. Joining runs the
existing passkey/Google ceremony (member + seat + `use_count`, one
transaction, unchanged), then the client unwraps TK, builds a keyring, uploads
it, and posts `member.hello`. A link that arrives without its fragment seats
the member keyless → §4.8.

### 4.5 Read

Server component: `requireTrip` (unchanged), then `eventsSince(tripId,
cursor)` — ciphertext only — into a client component. The client store
decrypts, validates (§4.7), replays with `lib/engine`, `lib/stats`,
`lib/recommend`, `lib/split`, `lib/phrases`, `lib/starters` — all pure, all
already isomorphic — and renders. Decrypted state is cached in IndexedDB per
trip; fetches are incremental by `id`; the page polls every ~15 s while
visible. Every page under `/t/[tripId]` becomes a thin server shell around a
client tree. Side effect: the trip reads offline.

### 4.6 Write

The client builds a payload, encrypts it under TK[cur], and calls
`appendEvent(tripId, envelope)`. The server checks seat, epoch, size, rate, and
inserts. The client applies it optimistically and reconciles on the next
fetch. Two members calling at once need no lock: the server's `id` is the
order, and replay decides.

### 4.7 Rules, replayed everywhere

`lib/replay.ts` — pure, tested — takes the trip's config and the decrypted
events in server order and produces state, skipping every event that breaks a
rule, with a reason:

- a `call` on a closed or unknown market; from a member on the other side;
  or that would push exposure past `max_stake_pies`
- a `resolve` from anyone but the creator; a `reopen` from anyone but an
  organiser (as `data.ts` has it today)
- a `market.create`, `bill.rev`, `phrase.keep` whose id or slug is taken
- a `comment` on nothing; a `react` that toggles nothing
- any event whose AAD did not open (already dropped in decrypt)

Same log, same state on every phone. The fuzz test that today proves payouts
sum to the pool now runs over logs seeded with invalid and adversarial events
and proves the same thing.

### 4.8 Get the key

A keyless member sees three ways in, in this order:

1. **Your other phone.** On a device that has the key: *Send this device the
   key* → `/link/<code>#<s>` as a QR or a link. Carries the whole keyring
   wrapped under `HKDF(s,"device")`. Redeemable only by a session that is the
   same member.
2. **Anyone on the trip.** The members page shows who has no `member.hello`
   for the current epoch — *Rahul hasn't got the key yet* — with *Send the
   key*. Any member mints a rekey (§3) and passes it on however they talk.
   Redeemable only by a session that is Rahul. A leaked rekey link therefore
   adds the key only to a phone that already holds Rahul's seat: the
   account-compromise case, no worse than today.
3. **Your passkey.** Phase 4: a PRF-capable passkey opens the keyring by
   itself. Nothing to do.

### 4.9 Recovery — lost every passkey

Unchanged in every part that matters: an organiser confirms out of band and
mints; 30 minutes, one use, one live per member, announced, revocable, the
banner follows the member. New: the organiser's client also puts TK[cur] on
the row under `HKDF(s,"recover")`, and the link is `/recover/<code>#<s>`. The
ceremony restores the seat; the fragment restores the key; a new MK is made
and `member.hello` says so — *Rahul is back on a new phone* — for the whole
table. `pnpm recovery:link` from the console restores the seat only; the key
comes from §4.8. **The server alone can no longer make an intruder a reading
member**, which is the largest single security gain of the whole plan.

### 4.10 Leaving, removal, deletion (Phase 3)

The organiser's client removes the seat (server), then rotates:
`TK[e+1] ← random`; for each remaining member, a `key_grant` encrypted to the
MK public key read *from that member's latest `member.hello` in the log*,
never from a server column; then `bumpEpoch(tripId, e+1)`, which the server
accepts only when a grant row exists for every current seat. Live invites are
revoked (they carried TK[e]); the organiser is prompted to mint a new group
link. Members pick up their grant on next load, add TK[e+1] to their keyring,
and re-upload it. `deleteAccount` rotates every trip the member was on and
drops their keyring; their events stay, sealed, under *Departed member*.

Without Phase 3, removal revokes the seat (no more fetching) but not the
historical key. That is the state to document until Phase 3 ships.

### 4.11 The two deliberate disclosures

- `/card/[marketId]`: the share button now first posts a plaintext snapshot
  (question, verdict, first names, pies) to `cards`; the page and OG image
  render from it. Unpublish by the publisher or an organiser. Nothing is on
  that page a member did not choose to put there — which is what the rule in
  `AGENTS.md` already asks.
- `/join/[code]`: the preview is a snapshot at mint time, encrypted under the
  link; re-sharing from the members page refreshes it.

### 4.12 Polisher, interpreter, speech

Unchanged: transient, through the server, never stored. `keepPhraseAction`
becomes a `phrase.keep` event encrypted on the client; `language`/`tag` are
resolved on the client from the trip's pair (still configuration, still
`pairFor`).

## 5. What the server enforces — and cannot

| The server still does | The server can no longer do |
|---|---|
| sign-in, sessions, passkey verification, Google | read a question, a call, a pie, a comment, a bill, a phrase |
| seats, roles, name distinctness, terms, 18+ | enforce the cap, one-side, zero-sum, resolution authority |
| order events, cap size, rate-limit, enforce epoch | render a card or a join preview unaided |
| invites, recoveries, rekeys: TTL, single use, revocation | seat a *reading* intruder by itself |
| `pnpm stats`: trips, rosters, founding rate | `pnpm seed` without a printed invite link; polish a draft it has not been sent |
| serve the client, the OG image, the avatars | moderate content (it never did) |

## 6. Security review

**Stronger.** A database breach reveals shape, never content. Recovery needs a
human holding the key, not just the server's word. The console break-glass is
demoted to seat-only. Relabelled or moved rows fail to open and are reported.
Every key-bearing device is announced in the sealed log. Removed members lose
future reads (Phase 3). Backups become harmless.

**Unchanged.** Passkey ceremonies and purposes, PKCE + nonce for Google, the
signed-cookie session, `requireTrip`, append-only everything.

**New risks, and the answer to each.**

| Risk | Answer |
|---|---|
| Link secrets sit in group chats | Same trust as today's invite: a seat. Short TTLs; revocation; rotation on removal; the group link is worth exactly one seat plus the current epoch |
| Key loss on a device (Safari evicts IndexedDB after 7 days without use for non-installed sites) | Three layers: other device (§4.8.1), anyone on the trip (§4.8.2), passkey PRF (§4.8.3). Nudge PWA install on iOS |
| Ghost device inserted by a malicious server | Impossible by construction: keys are only ever encrypted to (a) the reader's own device, (b) a link secret, (c) an MK public key read from the sealed log |
| A modified client submits rule-breaking events | Every honest client's replay drops them; the cheater's screen is the only one that lies |
| Garbage events (storage DoS) | Seat required, 16 KiB cap, per-member rate, per-trip quota |
| Malicious deploy | Phase 5: reproducible build, digest on `/privacy`, public client source, PWA cache |
| Bug in a rule ships to phones, not a server | Rules are versioned in the envelope; a fix is a new client and a re-replay, never a data migration |

**Metadata the operator still sees**: §0, and every line of it goes on
`/privacy`.

## 7. Phases

Estimates are one engineer, full time, and rough.

### Phase 0 — Foundations (≈1 week)

- `lib/crypto.ts` + test: envelope seal/open, AAD tamper → reject, wrong epoch
  → reject, link wrap/unwrap for each `info`, key export/import.
- `lib/keys.ts` + test: keyring shape, versioning, fragment parse/format, link
  secret lifecycle.
- `lib/events.ts` + test: payload types, codec, unknown-type tolerance.
- `lib/replay.ts` + test: every rule in §4.7; fuzz over adversarial logs; the
  zero-sum invariant.
- `lib/db/schema.ts` + migration: `events`, `keyrings`, `rekeys`, `cards`;
  `trips.key_epoch`, `name_enc`; `invites`/`recoveries` wrapped columns.
- `components/keyring.tsx`: IndexedDB store, `useKeyring()`, `useTripKey()`.
- This document into `docs/`, threat model text drafted for `/privacy`.
- Exit: `pnpm test` green with the four new modules; no page touched.

### Phase 1 — Private predictions (≈3 weeks)

- Create trip → TK, keyring upload, `member.hello`.
- Invite mint with fragment; `/join` client-rendered with decrypted preview;
  join unwraps and uploads.
- `appendEvent` / `eventsSince` in `lib/data.ts` (I/O only, as ever).
- Client trip store; `/t/[id]`, `/p/[id]`, `/member/[id]`, `/members`,
  `/inbox`, `/recap` as client trees fed by the store. Read the Next 16 docs in
  `node_modules/next/dist/docs/` before touching a page.
- Markets, calls, switches, resolve/reopen, comments, mentions, reactions,
  views as events; For-you and inbox derived on the client.
- Rekey links (§4.8.2) and device links (§4.8.1); *Get the key* screen.
- `GROUP_INVITE_TTL_MS` → 7 days (`lib/invites.ts` + test): a link that carries
  the key does not sit in a chat for a month. One-tap re-mint on the members
  page.
- `/card` publish step; `cards` table; OG from it.
- Exit: a new trip is fully playable with the plaintext tables empty for it.
  Old trips untouched (feature flag: `trips.key_epoch IS NOT NULL`).

### Phase 2 — Bills, phrases, name (≈1 week)

- `bill.rev`/`bill.settle` events; `lib/split` on the client; `/bills` as a
  client tree.
- `phrase.keep`/`phrase.drop`; slug uniqueness by replay; `/talk` phrasebook
  reads the store.
- `trip.rename` event; `name_enc`; layout header from the store.
- Exit: nothing content-bearing is written to a plaintext column for a new
  trip.

### Phase 3 — Member keys and rotation (≈1.5 weeks)

- MK in the keyring; `member.hello` carries the public key; `member.key` on
  new devices.
- `key_grants`; `bumpEpoch` with the all-seats check; rotation on removal,
  leaving, deletion; invite revocation on rotation.
- Members page: keyless members, new-device announcements, alongside
  recoveries.
- Exit: a removed member holding a DB copy cannot open anything after their
  removal.

### Phase 4 — Keys that survive, migration, retirement (≈1.5 weeks)

- Passkey PRF: request the extension in `beginPasskey*`, parse the output
  (`lib/webauthn.ts` + test — today it deliberately rejects extensions),
  `keyring_wraps`. Silent for passkey members; nothing to explain.
- One-off migration of the single existing trip: `pnpm private:migrate
  "<trip>"` (a `scripts/` file, `DATABASE_URL` only, like `recovery:link`)
  generates TK[0], encrypts every plaintext row into `events`, sets
  `key_epoch`, and prints one rekey link per member with the key in its
  fragment, to be handed out by hand. The operator sees that trip's plaintext
  once — which is exactly what they can see today, and never again after.
  No in-app migration UI; the script is deleted with the plaintext tables.
- Drop the retired tables; `pnpm seed` prints an invite link with its
  fragment; `pnpm stats` unchanged.
- `/privacy` rewritten to §0; `AGENTS.md` gains §9; lingo strings.
- Exit: no plaintext content column exists in the schema.

### Phase 5 — Verifiable client (≈1 week, optional but the centrepiece needs it)

- Reproducible image build; digest published on `/privacy` and in the
  footer; release tags signed.
- Repository public. Nothing about the server or the data changes; it is
  the only honest answer to the web caveat in §0.
- Per-trip hash chain: each event carries the hash of the last one its author
  saw; forks and gaps show on the members page. Tamper-*evident* ordering on
  top of tamper-*proof* content.

## 8. Decisions — settled 2026-08-24

1. **Destination, dates, currencies, cap stay plaintext in v1.** They drive
   `tripToday`, `tripPhase`, `pairFor`, the voice and the currency on the
   server, and they are the trip's shape rather than its content. Moving them
   is a later, self-contained step (the layout header becomes client-rendered).
2. **Names stay plaintext.** Mentions, distinctness, the roster on `/join`;
   the social graph is already visible through emails and seats.
3. **The one existing trip is migrated by script**, not by an in-app flow —
   Phase 4. No grandfathering code, no dual-mode reads to maintain: once the
   script has run, every trip is sealed.
4. **The repository goes public** in Phase 5.
5. **Group link TTL drops to 7 days** in Phase 1, with a one-tap re-mint.

## 9. Rules for `AGENTS.md` (draft)

- **A trip is sealed.** Every content-bearing write is an encrypted event in
  `events`; the server checks seat, epoch, size and rate, and nothing else.
  The rules of the game are `lib/replay.ts`, run on every phone; never add a
  server-side check that needs plaintext, because there is none.
- **Keys move only through people.** A key reaches a device through a link
  fragment or a `key_grant` to an MK public key read from the sealed log.
  Never encrypt to a public key the server supplied; never add a path that
  returns a key to the server.
- **Two deliberate disclosures**, `cards` and the invite preview, both posted
  by a client on a member's tap. Never a third without that test.
- **The console restores seats, never keys.**
- **Plaintext columns are shape, not content**: members, seats, roles,
  credentials, trip configuration, link metadata. Before adding one, ask
  whether an operator should be able to read it.

## 10. Copy (into `lingo.yaml`, in the app's voice)

- Trip settings, first line: *This trip lives on the phones that joined it.
  Nobody else can read it — not even us.*
- Keyless: *You've got a seat, not the key. Open the app on your other phone,
  or ask anyone on the trip to send it.*
- Members page: *Rahul hasn't got the key yet.* — *Send the key*
- Rotation: *Rahul's off the trip. The lock's been changed — share a fresh
  group link.*
- Share card: *This puts the verdict on a public page, first names and pies.
  Everything else stays sealed.*
