// The rules of a sealed trip, run on every phone. See docs/private-trips.md §4.7.
//
// The server orders events and cannot read them, so nothing there can say
// whether a call was over the cap or a resolve came from the creator. This
// does: given the trip's configuration and its events in server order, it
// produces the state every page shows, applying each event only if the rules
// allow it — and every honest phone, running the same code over the same log,
// arrives at the same state. An event that breaks a rule is skipped with a
// reason, never patched; a modified client that posts one only lies to its own
// screen.
//
// Settlement math is lib/engine's, untouched. The derived `ledger` is in the
// shape of the old ledger rows so lib/stats keeps working over it unchanged.

import {
  computePositions,
  exposure,
  type MarketEvent,
  otherSide,
  type Position,
  refundAll,
  type Side,
  settle,
} from "./engine.ts";
import type { EventPayload, OpenEvent, UnknownEvent } from "./events.ts";
import { MAX_PHRASES } from "./phrases.ts";
import { CENTS } from "./pies.ts";
import type { LedgerRow } from "./rows.ts";
import { type BillEntry, buildEntries, SplitError } from "./split.ts";

export interface ReplayConfig {
  tripId: string;
  /** The first organiser, before any `member.role` says otherwise. */
  creatorId: string;
  maxStakePies: number;
  /** The currencies a bill may be in: the trip's home one, and the foreign one if any. */
  currencies: readonly string[];
}

export interface MarketState {
  id: string;
  creatorId: string;
  question: string;
  criteria: string;
  createdAt: Date;
  status: "open" | Side | "refunded";
  resolvedAt: Date | null;
  resolutionNote: string | null;
  positions: Map<string, Position>;
  /** What each member still holds from the settlement: payouts and refunds, less reversals. */
  outstanding: Map<string, number>;
}

export interface CommentState {
  id: string;
  authorId: string;
  at: Date;
  marketId?: string;
  billId?: string;
  body: string;
  mentions: string[];
}

export interface ReactionState {
  marketId: string;
  memberId: string;
  kind: "upvote" | "watch";
  at: Date;
}

export interface BillRevisionState {
  editorId: string;
  at: Date;
  kind: "expense" | "settlement";
  description: string;
  currency: string;
  split: "equal" | "custom";
  entries: BillEntry[];
  onDate: string;
  deleted: boolean;
}

export interface BillState {
  id: string;
  createdAt: Date;
  /** Oldest first; the last one is the bill as it stands. */
  revisions: BillRevisionState[];
}

export interface PhraseState {
  id: string;
  memberId: string;
  createdAt: Date;
  slug: string;
  name: string;
  side: "us" | "them";
  heard: string;
  said: string;
  roman: string | null;
  literal: string | null;
  language: string;
  tag: string;
}

export interface HelloState {
  at: Date;
  /** The epoch the hello was sealed under: proof the member held that key. */
  epoch: number;
  mkPub: JsonWebKey | null;
}

export interface Rejection {
  id: number;
  authorId: string;
  type: string;
  reason: string;
}

export interface TripState {
  organiserIds: Set<string>;
  markets: Map<string, MarketState>;
  /** Every pie movement, derived, in the ledger shape and in event order. */
  ledger: LedgerRow[];
  comments: CommentState[];
  reactions: ReactionState[];
  bills: Map<string, BillState>;
  phrases: Map<string, PhraseState>;
  hellos: Map<string, HelloState>;
  /** Events this build could not apply, with why. */
  rejected: Rejection[];
  /** Events of a type this build does not know — a newer app has been here. */
  unknown: number;
}

/** A rule said no. Thrown inside `apply`, caught into `rejected`. */
class Refused extends Error {}

function refuse(reason: string): never {
  throw new Refused(reason);
}

interface Ctx {
  config: ReplayConfig;
  state: TripState;
  nextLedgerId: number;
}

export function replayTrip(config: ReplayConfig, events: readonly OpenEvent[]): TripState {
  const state: TripState = {
    organiserIds: new Set([config.creatorId]),
    markets: new Map(),
    ledger: [],
    comments: [],
    reactions: [],
    bills: new Map(),
    phrases: new Map(),
    hellos: new Map(),
    rejected: [],
    unknown: 0,
  };
  const ctx: Ctx = { config, state, nextLedgerId: 1 };
  for (const ev of events) {
    if (ev.payload.t === "unknown") {
      state.unknown += 1;
      continue;
    }
    try {
      apply(ctx, ev, ev.payload);
    } catch (err) {
      if (!(err instanceof Refused)) throw err;
      state.rejected.push({
        id: ev.id,
        authorId: ev.authorId,
        type: ev.payload.t,
        reason: err.message,
      });
    }
  }
  return state;
}

function apply(ctx: Ctx, ev: OpenEvent, p: Exclude<EventPayload, UnknownEvent>): void {
  const { state } = ctx;
  switch (p.t) {
    case "market.create": {
      if (state.markets.has(p.id)) refuse("id already taken");
      state.markets.set(p.id, {
        id: p.id,
        creatorId: ev.authorId,
        question: p.question,
        criteria: p.criteria,
        createdAt: ev.at,
        status: "open",
        resolvedAt: null,
        resolutionNote: null,
        positions: new Map(),
        outstanding: new Map(),
      });
      return;
    }
    case "call": {
      const market = openMarket(state, p.marketId);
      if (!Number.isInteger(p.amountC) || p.amountC < CENTS || p.amountC % CENTS !== 0) {
        refuse("a call is a whole number of pies, at least 1");
      }
      const pos = market.positions.get(ev.authorId) ?? { yesC: 0, noC: 0 };
      if ((p.side === "yes" ? pos.noC : pos.yesC) > 0) refuse("already on the other side");
      if (exposure(pos) + p.amountC > ctx.config.maxStakePies * CENTS) {
        refuse("over the exposure cap");
      }
      move(ctx, ev, market, { kind: "bet", side: p.side, amountC: p.amountC }, -p.amountC);
      return;
    }
    case "switch": {
      const market = openMarket(state, p.marketId);
      const pos = market.positions.get(ev.authorId);
      const stakeC = pos ? exposure(pos) : 0;
      if (!pos || stakeC === 0) refuse("no call to switch");
      const to = otherSide(pos.yesC > 0 ? "yes" : "no");
      move(ctx, ev, market, { kind: "switch", side: to, amountC: stakeC }, 0);
      return;
    }
    case "resolve": {
      const market = marketOf(state, p.marketId);
      if (market.creatorId !== ev.authorId) refuse("only the creator resolves");
      if (market.status !== "open") refuse("already resolved");
      let paid: Map<string, number>;
      let kind: LedgerRow["kind"];
      if (p.outcome === "refunded") {
        paid = refundAll(market.positions);
        kind = "refund";
      } else {
        const result = settle(market.positions, p.outcome);
        paid = result.payoutsC;
        kind = result.autoRefunded ? "refund" : "payout";
      }
      for (const [memberId, amountC] of paid) {
        pushLedger(ctx, ev, {
          marketId: market.id,
          memberId,
          kind,
          amountC,
          balanceDeltaC: amountC,
        });
        market.outstanding.set(memberId, amountC);
      }
      market.status = p.outcome;
      market.resolvedAt = ev.at;
      market.resolutionNote = p.note.trim() || null;
      return;
    }
    case "reopen": {
      const market = marketOf(state, p.marketId);
      if (!state.organiserIds.has(ev.authorId)) refuse("only an organiser reopens");
      if (market.status === "open") refuse("already open");
      for (const [memberId, amountC] of market.outstanding) {
        if (amountC <= 0) continue;
        pushLedger(ctx, ev, {
          marketId: market.id,
          memberId,
          kind: "reversal",
          amountC,
          balanceDeltaC: -amountC,
        });
      }
      market.outstanding = new Map();
      market.status = "open";
      market.resolvedAt = null;
      market.resolutionNote = null;
      return;
    }
    case "comment": {
      if (state.comments.some((c) => c.id === p.id)) refuse("id already taken");
      if (p.marketId !== undefined) {
        marketOf(state, p.marketId);
      } else if (p.billId === undefined || !liveBill(state, p.billId)) {
        refuse("no such bill");
      }
      state.comments.push({
        id: p.id,
        authorId: ev.authorId,
        at: ev.at,
        marketId: p.marketId,
        billId: p.billId,
        body: p.body,
        mentions: [...new Set(p.mentions)],
      });
      return;
    }
    case "react": {
      marketOf(state, p.marketId);
      const i = state.reactions.findIndex(
        (r) => r.marketId === p.marketId && r.memberId === ev.authorId && r.kind === p.kind,
      );
      if (p.on) {
        if (i >= 0) refuse("already on");
        state.reactions.push({
          marketId: p.marketId,
          memberId: ev.authorId,
          kind: p.kind,
          at: ev.at,
        });
      } else {
        if (i < 0) refuse("already off");
        state.reactions.splice(i, 1);
      }
      return;
    }
    case "bill.rev": {
      if (!ctx.config.currencies.includes(p.currency)) refuse("not a currency on this trip");
      let entries: BillEntry[] = [];
      if (!p.deleted) {
        try {
          entries = buildEntries(p.split, p.entries);
        } catch (err) {
          if (err instanceof SplitError) refuse(err.message);
          throw err;
        }
      }
      let bill = state.bills.get(p.billId);
      if (!bill) {
        if (p.deleted) refuse("no such bill");
        bill = { id: p.billId, createdAt: ev.at, revisions: [] };
        state.bills.set(p.billId, bill);
      }
      bill.revisions.push({
        editorId: ev.authorId,
        at: ev.at,
        kind: p.kind,
        description: p.description,
        currency: p.currency,
        split: p.split,
        entries,
        onDate: p.onDate,
        deleted: p.deleted ?? false,
      });
      return;
    }
    case "phrase.keep": {
      if (state.phrases.has(p.id)) refuse("id already taken");
      if (state.phrases.size >= MAX_PHRASES) refuse("the phrasebook is full");
      for (const other of state.phrases.values()) {
        if (other.slug === p.slug) refuse("that name is taken");
      }
      state.phrases.set(p.id, {
        id: p.id,
        memberId: p.keeper && state.organiserIds.has(ev.authorId) ? p.keeper : ev.authorId,
        createdAt: ev.at,
        slug: p.slug,
        name: p.name,
        side: p.side,
        heard: p.heard,
        said: p.said,
        roman: p.roman ?? null,
        literal: p.literal ?? null,
        language: p.language,
        tag: p.tag,
      });
      return;
    }
    case "phrase.drop": {
      const phrase = state.phrases.get(p.id) ?? refuse("no such phrase");
      if (phrase.memberId !== ev.authorId && !state.organiserIds.has(ev.authorId)) {
        refuse("only the keeper or an organiser drops a phrase");
      }
      state.phrases.delete(p.id);
      return;
    }
    case "member.hello": {
      // A later hello without a key keeps the announced one: a phone may say hello before it has an mk.
      const before = state.hellos.get(ev.authorId);
      state.hellos.set(ev.authorId, {
        at: ev.at,
        epoch: ev.epoch,
        mkPub: p.mkPub ?? before?.mkPub ?? null,
      });
      return;
    }
    case "member.role": {
      if (!state.organiserIds.has(ev.authorId)) refuse("only an organiser changes roles");
      if (p.role === "organiser") {
        state.organiserIds.add(p.memberId);
      } else {
        if (state.organiserIds.size === 1 && state.organiserIds.has(p.memberId)) {
          refuse("the last organiser cannot step down");
        }
        state.organiserIds.delete(p.memberId);
      }
      return;
    }
    default: {
      const never: never = p;
      throw new Error(`unhandled event ${(never as { t: string }).t}`);
    }
  }
}

function marketOf(state: TripState, id: string): MarketState {
  return state.markets.get(id) ?? refuse("no such prediction");
}

function openMarket(state: TripState, id: string): MarketState {
  const market = marketOf(state, id);
  if (market.status !== "open") refuse("prediction is closed");
  return market;
}

function liveBill(state: TripState, id: string): boolean {
  const bill = state.bills.get(id);
  return !!bill && !bill.revisions[bill.revisions.length - 1]!.deleted;
}

/** Positions as the bet events that would rebuild them — one per held side. */
function positionsAsEvents(positions: Map<string, Position>): MarketEvent[] {
  const out: MarketEvent[] = [];
  for (const [memberId, pos] of positions) {
    if (pos.yesC > 0) out.push({ memberId, kind: "bet", side: "yes", amountC: pos.yesC });
    if (pos.noC > 0) out.push({ memberId, kind: "bet", side: "no", amountC: pos.noC });
  }
  return out;
}

/** The author's pies move on a market: positions recomputed by lib/engine, one ledger row. */
function move(
  ctx: Ctx,
  ev: OpenEvent,
  market: MarketState,
  action: { kind: "bet" | "switch"; side: Side; amountC: number },
  balanceDeltaC: number,
): void {
  market.positions = computePositions([
    ...positionsAsEvents(market.positions),
    { memberId: ev.authorId, ...action },
  ]);
  pushLedger(ctx, ev, { marketId: market.id, ...action, balanceDeltaC });
}

function pushLedger(
  ctx: Ctx,
  ev: OpenEvent,
  row: {
    marketId: string;
    memberId?: string;
    kind: LedgerRow["kind"];
    side?: Side;
    amountC: number;
    balanceDeltaC: number;
  },
): void {
  ctx.state.ledger.push({
    id: ctx.nextLedgerId++,
    at: ev.at,
    tripId: ctx.config.tripId,
    memberId: row.memberId ?? ev.authorId,
    marketId: row.marketId,
    kind: row.kind,
    side: row.side ?? null,
    amountC: row.amountC,
    balanceDeltaC: row.balanceDeltaC,
    note: null,
  });
}

// --- derived views ------------------------------------------------------------

/** Each member's net on the trip: the sum of every balance delta. */
export function netByMember(state: TripState): Map<string, number> {
  const net = new Map<string, number>();
  for (const row of state.ledger) {
    net.set(row.memberId, (net.get(row.memberId) ?? 0) + row.balanceDeltaC);
  }
  return net;
}

/** The ledger rows of one market, for lib/stats. */
export function marketRows(state: TripState, marketId: string): LedgerRow[] {
  return state.ledger.filter((r) => r.marketId === marketId);
}

/** Every market's rows in one pass, for the views that walk the whole board. */
export function rowsByMarket(state: TripState): Map<string, LedgerRow[]> {
  const by = new Map<string, LedgerRow[]>();
  for (const row of state.ledger) {
    if (row.marketId === null) continue;
    const rows = by.get(row.marketId);
    if (rows) rows.push(row);
    else by.set(row.marketId, [row]);
  }
  return by;
}
