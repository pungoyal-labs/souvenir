import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const members = pgTable("members", {
  id: text("id").primaryKey(),
  // Null for a member who joined by link: they have no address anywhere in
  // the system. Google sign-ins still fill it, until the column goes entirely.
  email: text("email").unique(),
  name: text("name").notNull(),
  /** Google's picture URL; nothing reads it any more (avatars are uploads or monograms). */
  image: text("image"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  /** The lingo the UI speaks to this member in; a lib/lingo.ts key. */
  lingo: text("lingo").notNull().default("english"),
  /** Set when the member uploaded a picture (see `avatars`); doubles as the cache-buster in the avatar URL. */
  avatarUpdatedAt: timestamp("avatar_updated_at", { withTimezone: true }),
  /**
   * When they ticked "I'm 18+ and I agree to the terms". Null only for
   * members who predate the gate; the layout nags them once to accept.
   */
  termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
  /**
   * Set when the member deleted their account. The row stays because the
   * ledger and bills reference it — append-only means the accounting cannot
   * lose a name — but everything identifying is scrubbed at the same moment
   * (lib/data.ts deleteAccount) and nothing signs in as them again.
   */
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// ---------- trips ----------
//
// A trip is the season: one friend group, one destination, a start and an end.
// Everything a member does — a prediction, a pie, a bill, a kept phrase — is
// scoped to exactly one. A member can be on many; the leaderboard, the inbox,
// the exposure cap are all per trip, because "who can actually predict things"
// is a question about one roster over one stretch of days.
//
// Money is decided here and nowhere else: `home_currency` is what the group
// settles in; `foreign_currency` is what the destination spends, or null for a
// domestic trip, in which case no bill ever asks which. The language pair
// `/talk` interprets between is derived from `destination` and
// `home_language` at read time (lib/trips.ts), never stored twice.

export const membershipRoleEnum = pgEnum("membership_role", ["organiser", "member"]);

export const trips = pgTable("trips", {
  id: text("id").primaryKey(),
  /** A key of lib/talk DESTINATIONS — where the group is going. */
  destination: text("destination").notNull(),
  /** A key of lib/talk HOME — what the group speaks among themselves. */
  homeLanguage: text("home_language").notNull().default("en"),
  /** ISO 4217 lowercased; what bills settle in. */
  homeCurrency: text("home_currency").notNull(),
  /** What the destination spends, or null when it is the home currency too. */
  foreignCurrency: text("foreign_currency"),
  startsOn: date("starts_on", { mode: "string" }),
  endsOn: date("ends_on", { mode: "string" }),
  /** Exposure cap per prediction, in whole pies. */
  maxStakePies: integer("max_stake_pies").notNull().default(10),
  /**
   * Which trip-key epoch new events must be sealed under (docs/private-trips.md).
   * Every trip is created at 0; the column is nullable only by history.
   */
  keyEpoch: integer("key_epoch"),
  /** The name, sealed under the trip key (lib/keys `sealName`). */
  nameEnc: text("name_enc"),
  /** Set when a seat went (removal, leaving, deletion) and the key has not been rotated since. */
  keyStaleSince: timestamp("key_stale_since", { withTimezone: true }),
  createdBy: text("created_by")
    .notNull()
    .references(() => members.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Who is on which trip, and with what powers. An organiser invites, mints
// recovery links, reopens a wrong resolution, and hands the role around —
// never down to none. The inbox cursor lives here because the inbox is per
// trip: what happened on one trip is not unread on another.
export const memberships = pgTable(
  "memberships",
  {
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id),
    role: membershipRoleEnum("role").notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    /** Which invite brought them, if any — the trace a founding rate is read from. */
    invitedWith: text("invited_with"),
    /** Inbox read cursor: events after this instant count as unread. The inbox itself is derived on the phone. */
    inboxSeenAt: timestamp("inbox_seen_at", { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.tripId, t.memberId] }),
    index("memberships_member_idx").on(t.memberId),
  ],
);

// Uploaded profile pictures, one per member. The bytes live in their own
// table so the frequent full-members scans in lib/data.ts never drag image
// data along.
export const avatars = pgTable("avatars", {
  memberId: text("member_id")
    .primaryKey()
    .references(() => members.id),
  contentType: text("content_type").notNull(),
  data: bytea("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Invite links. Two kinds: a personal one, spent by the first person to walk
// through it, and an open group link anyone in the chat can use. Both are
// readable capabilities — the code is stored so an organiser can re-share what
// they already sent — and both survive on being short-lived and revocable
// instead (lib/invites.ts). Acceptance runs in the transaction that creates
// the member, with the row locked, so a personal link cannot be spent twice.
export const invites = pgTable("invites", {
  tripId: text("trip_id")
    .notNull()
    .references(() => trips.id),
  /** The code from the link, and the only name this row has. */
  code: text("code").primaryKey(),
  /** Who the inviter says this is for — a name, so the pending list reads. */
  label: text("label").notNull(),
  /** An open link never spends: anyone holding it can join until it expires. */
  isOpen: boolean("is_open").notNull().default(false),
  /** What spends a personal invite, and what counts arrivals through an open one. */
  useCount: integer("use_count").notNull().default(0),
  /**
   * The trip key wrapped under the link's secret, which lives in the URL
   * fragment and never reaches this server; the epoch it is; and the join
   * page's peek at the table, wrapped under the same secret.
   */
  wrappedKey: text("wrapped_key"),
  epoch: integer("epoch"),
  preview: text("preview"),
  invitedBy: text("invited_by")
    .notNull()
    .references(() => members.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

// Recovery links: the way back to an existing seat, minted by an organiser for
// a member who has lost every passkey they held. Nothing like an invite, despite
// the shape — walking through one makes you somebody who is already at the
// table, so the trade is the opposite way round and the guards are tighter
// (lib/recovery.ts): half an hour, one use, one live row per member, and named
// on the members page the whole time so the table sees it happen.
// `used_at` is what spends it; a spent row stays as the record.
export const recoveries = pgTable(
  "recoveries",
  {
    /** The code from the link, and the only name this row has. */
    code: text("code").primaryKey(),
    /** Whose seat this link opens. */
    memberId: text("member_id")
      .notNull()
      .references(() => members.id),
    /** The organiser who vouched — null when it came from scripts/recovery-link.ts. */
    mintedBy: text("minted_by").references(() => members.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** Set the moment a passkey is added through it; the row is spent from then on. */
    usedAt: timestamp("used_at", { withTimezone: true }),
    /**
     * One trip's key under the link's secret, put there by the organiser's
     * phone, with which trip and which epoch it is. Null when minted from the
     * console, which can give a seat back and nothing more.
     */
    wrappedKey: text("wrapped_key"),
    tripId: text("trip_id").references(() => trips.id),
    epoch: integer("epoch"),
  },
  (t) => [index("recoveries_member_idx").on(t.memberId)],
);

// Passkeys. A member may hold several — laptop, phone, a spare — and any one
// of them signs them in. Nothing here identifies anyone: a random credential
// id the authenticator chose, a public key, and a counter. The aaguid (which
// make and model of authenticator) is deliberately not among them.
export const credentials = pgTable(
  "credentials",
  {
    /** The authenticator's credential id, base64url — what a sign-in is looked up by. */
    id: text("id").primaryKey(),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id),
    /** SPKI DER, as node:crypto exports it (lib/webauthn.ts). */
    publicKey: bytea("public_key").notNull(),
    /** COSE algorithm: -7 (ES256) or -257 (RS256). */
    alg: integer("alg").notNull(),
    /** Authenticator's own counter; a value that goes backwards means a clone. */
    signCount: bigint("sign_count", { mode: "number" }).notNull().default(0),
    /** The key is synced to a credential manager, so losing the device isn't losing it. */
    backedUp: boolean("backed_up").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => [index("credentials_member_idx").on(t.memberId)],
);

// ---------- private trips (docs/private-trips.md) ----------
//
// A sealed trip is one append-only table of envelopes the server orders and
// cannot open, a keyring backup per passkey it cannot open either, and links
// and grants that carry keys under secrets it never sees.

/**
 * Every event on a sealed trip, in the order the server received them, under
 * the trip key for `epoch`. The server checks the author holds a seat, that
 * `epoch` is the trip's current one, and the body's size and shape — and can
 * check nothing else, because the type and everything after it is inside the
 * envelope. Positions, balances, bills, the phrasebook: all replayed from
 * here on the phone (lib/replay.ts).
 */
export const events = pgTable(
  "events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id),
    authorId: text("author_id")
      .notNull()
      .references(() => members.id),
    epoch: integer("epoch").notNull(),
    /** `v1.<epoch>.<iv>.<ct>` — lib/crypto.ts. */
    body: text("body").notNull(),
  },
  (t) => [
    index("events_trip_id_idx").on(t.tripId, t.id),
    check("events_body_size", sql`length(${t.body}) <= 16384`),
  ],
);

/**
 * A member's keyring under a key only their passkey can derive: the PRF
 * extension gives the same secret every time that credential signs in, so a
 * new phone that signs in with a synced passkey opens its keys by itself.
 * Opaque here — the server learns its size and when it changed. Dropping the
 * credential drops the backup with it.
 */
export const keyringWraps = pgTable(
  "keyring_wraps",
  {
    credentialId: text("credential_id")
      .primaryKey()
      .references(() => credentials.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    blob: text("blob").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("keyring_wraps_member_idx").on(t.memberId)],
);

/**
 * A rotated trip key on its way to a member: TK[epoch] wrapped to the member
 * key they announced in the log (lib/crypto `wrapToMember`), by the organiser
 * phone that rotated. Opaque here. `bumpEpoch` accepts a rotation only with
 * one of these for every seat, so nobody is left behind by it.
 */
export const keyGrants = pgTable(
  "key_grants",
  {
    id: text("id").primaryKey(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id),
    epoch: integer("epoch").notNull(),
    toMemberId: text("to_member_id")
      .notNull()
      .references(() => members.id),
    fromMemberId: text("from_member_id")
      .notNull()
      .references(() => members.id),
    wrapped: text("wrapped").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    takenAt: timestamp("taken_at", { withTimezone: true }),
  },
  (t) => [index("key_grants_to_idx").on(t.tripId, t.toMemberId, t.epoch)],
);

/**
 * A key for a member who already has a seat: how a phone that lost its
 * keyring gets one back from anyone on the trip. Same primitive as an invite
 * — a code in a URL, the key under the fragment's secret — pointed at a
 * member instead of a stranger, so it is short-lived, single-use, and
 * redeemable only by a session that *is* `for_member_id`. A stray one adds a
 * key to a phone that already holds that member's seat, and nothing else.
 */
export const rekeys = pgTable(
  "rekeys",
  {
    code: text("code").primaryKey(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id),
    forMemberId: text("for_member_id")
      .notNull()
      .references(() => members.id),
    mintedBy: text("minted_by")
      .notNull()
      .references(() => members.id),
    wrappedKey: text("wrapped_key").notNull(),
    epoch: integer("epoch").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (t) => [index("rekeys_trip_member_idx").on(t.tripId, t.forMemberId)],
);

/**
 * The one deliberate plaintext on a sealed trip: a prediction's verdict, put
 * on the public card page by a member who tapped *share*. First names and
 * pies, as the card shows today — chosen, not leaked. Anyone on the trip can
 * take it down.
 */
export const cards = pgTable("cards", {
  marketId: text("market_id").primaryKey(),
  tripId: text("trip_id")
    .notNull()
    .references(() => trips.id),
  publishedBy: text("published_by")
    .notNull()
    .references(() => members.id),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  /** The trip's name as the publishing phone printed it: the server cannot read the real one. */
  tripName: text("trip_name").notNull().default(""),
  question: text("question").notNull(),
  verdict: text("verdict").notNull(),
  /** `[{ name, pies }]` — what the card prints, nothing the card does not. */
  lines: text("lines").notNull(),
});

export type Member = typeof members.$inferSelect;
export type Trip = typeof trips.$inferSelect;
export type MembershipRow = typeof memberships.$inferSelect;
export type MembershipRole = MembershipRow["role"];
export type CredentialRow = typeof credentials.$inferSelect;
export type InviteRow = typeof invites.$inferSelect;
export type RecoveryRow = typeof recoveries.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type RekeyRow = typeof rekeys.$inferSelect;
export type CardRow = typeof cards.$inferSelect;
