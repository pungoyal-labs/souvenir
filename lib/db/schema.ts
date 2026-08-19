import {
  bigint,
  bigserial,
  boolean,
  customType,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const sideEnum = pgEnum("side", ["yes", "no"]);
export const marketStatusEnum = pgEnum("market_status", ["open", "yes", "no", "refunded"]);
export const ledgerKindEnum = pgEnum("ledger_kind", ["grant", "bet", "switch", "payout", "refund"]);

export const members = pgTable("members", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  image: text("image"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  // The lingo the UI speaks to this member in; a lib/lingo.ts key.
  lingo: text("lingo").notNull().default("english"),
  // Inbox read cursor: events after this instant count as unread. The inbox
  // itself is derived entirely from markets + ledger — no notification rows.
  inboxSeenAt: timestamp("inbox_seen_at", { withTimezone: true }),
  // Set when the member uploaded their own picture (see `avatars`); it wins
  // over `image` and doubles as the cache-buster in the avatar URL.
  avatarUpdatedAt: timestamp("avatar_updated_at", { withTimezone: true }),
});

// Uploaded profile pictures, one per member, overriding the Google `image`.
// The bytes live in their own table so the frequent full-members scans in
// lib/data.ts never drag image data along.
export const avatars = pgTable("avatars", {
  memberId: text("member_id")
    .primaryKey()
    .references(() => members.id),
  contentType: text("content_type").notNull(),
  data: bytea("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const allowlist = pgTable("allowlist", {
  email: text("email").primaryKey(),
  invitedBy: text("invited_by").references(() => members.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const markets = pgTable("markets", {
  id: text("id").primaryKey(),
  creatorId: text("creator_id")
    .notNull()
    .references(() => members.id),
  question: text("question").notNull(),
  criteria: text("criteria").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  status: marketStatusEnum("status").notNull().default("open"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolutionNote: text("resolution_note"),
});

// Append-only. Every pie movement in the system is a row here; balances and
// positions are always derived by replaying it, never stored elsewhere.
//   grant   +amount   pies issued to a member on joining
//   bet     -amount   stake committed to a market side
//   switch   0        stake moved to the other side (side = destination)
//   payout  +amount   winning share of a resolved market's pool
//   refund  +amount   stake returned (voided market or empty winning side)
export const ledger = pgTable("ledger", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  memberId: text("member_id")
    .notNull()
    .references(() => members.id),
  marketId: text("market_id").references(() => markets.id),
  kind: ledgerKindEnum("kind").notNull(),
  side: sideEnum("side"),
  amountC: integer("amount_c").notNull(),
  balanceDeltaC: integer("balance_delta_c").notNull(),
  note: text("note"),
});

// Append-only, like the ledger: one row each time a member opens a prediction
// page. Pure telemetry — never touches settlement. The "For you" ranking and
// the watcher count are derived from it at read time.
export const marketViews = pgTable(
  "market_views",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id),
    marketId: text("market_id")
      .notNull()
      .references(() => markets.id),
  },
  (t) => [index("market_views_member_market_idx").on(t.memberId, t.marketId)],
);

// ---------- split bills (real money, separate from the pie ledger) ----------

export const currencyEnum = pgEnum("currency", ["inr", "thb"]);
export const billKindEnum = pgEnum("bill_kind", ["expense", "settlement"]);
export const billSplitEnum = pgEnum("bill_split", ["equal", "custom"]);

/** Identity only — everything about a bill lives in its revisions. */
export const bills = pgTable("bills", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Append-only, in the ledger's spirit: every add, edit, or delete of a bill is
// a new full snapshot here, so any member can change any bill and the whole
// trail stays on the record. A bill's current state is its latest revision;
// `deleted: true` retires it. A `settlement` is a bill where the payer paid
// and the receiver owes — the same replay that nets expenses cancels it.
export const billRevisions = pgTable(
  "bill_revisions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    billId: text("bill_id")
      .notNull()
      .references(() => bills.id),
    editorId: text("editor_id")
      .notNull()
      .references(() => members.id),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    deleted: boolean("deleted").notNull().default(false),
    kind: billKindEnum("kind").notNull().default("expense"),
    // The day the money moved, as the member stated it — no timezone games.
    onDate: date("on_date", { mode: "string" }).notNull(),
    description: text("description").notNull(),
    currency: currencyEnum("currency").notNull(),
    split: billSplitEnum("split").notNull().default("equal"),
  },
  (t) => [index("bill_revisions_bill_idx").on(t.billId)],
);

// One member's line on one revision. Owed shares are computed at write time by
// lib/split.ts (largest-remainder, like engine's settle) so paid and owed each
// sum to the bill total and historical bills never re-split.
export const billEntries = pgTable(
  "bill_entries",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    revisionId: bigint("revision_id", { mode: "number" })
      .notNull()
      .references(() => billRevisions.id),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id),
    paidC: integer("paid_c").notNull().default(0),
    owedC: integer("owed_c").notNull().default(0),
    participant: boolean("participant").notNull().default(true),
  },
  (t) => [index("bill_entries_revision_idx").on(t.revisionId)],
);

export type Member = typeof members.$inferSelect;
export type Market = typeof markets.$inferSelect;
export type LedgerRow = typeof ledger.$inferSelect;
export type MarketViewRow = typeof marketViews.$inferSelect;
export type BillRevisionRow = typeof billRevisions.$inferSelect;
export type BillEntryRow = typeof billEntries.$inferSelect;
