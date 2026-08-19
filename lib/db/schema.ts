import { bigserial, index, integer, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

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

export type Member = typeof members.$inferSelect;
export type Market = typeof markets.$inferSelect;
export type LedgerRow = typeof ledger.$inferSelect;
export type MarketViewRow = typeof marketViews.$inferSelect;
