// Pure accounting derived from ledger rows: replay into positions, roll a
// market's rows into per-member outcomes, and roll outcomes into the stats the
// UI shows. No I/O — lib/data.ts feeds it rows and lib/stats.test.ts pins the
// behavior. Settlement itself lives in lib/engine.ts; this file is everything
// downstream of it.

import type { LedgerRow, Market } from "./db/schema.ts";
import {
  computePositions,
  exposure,
  type MarketEvent,
  type Position,
  type Side,
} from "./engine.ts";

/** The bet/switch rows as engine events, in ledger order. */
export function toEvents(rows: LedgerRow[]): MarketEvent[] {
  return rows
    .filter((r) => r.kind === "bet" || r.kind === "switch")
    .map((r) => ({
      memberId: r.memberId,
      kind: r.kind as "bet" | "switch",
      side: r.side as Side,
      amountC: r.amountC,
    }));
}

export function replay(rows: LedgerRow[]): Map<string, Position> {
  return computePositions(toEvents(rows));
}

/**
 * Per-participant outcome of one market: final side/stake plus what came back.
 * `rows` must be in ledger order — a `reversal` only means "forget the
 * settlement so far" if what came before it is known.
 */
export interface MemberOutcome {
  side: Side;
  stakeC: number;
  payoutC: number;
  refundC: number;
}

export function marketOutcomes(rows: LedgerRow[]): Map<string, MemberOutcome> {
  const outcomes = new Map<string, MemberOutcome>();
  for (const [memberId, pos] of replay(rows)) {
    const stakeC = exposure(pos);
    if (stakeC === 0) continue;
    outcomes.set(memberId, {
      side: pos.yesC > 0 ? "yes" : "no",
      stakeC,
      payoutC: 0,
      refundC: 0,
    });
  }
  for (const row of rows) {
    const outcome = outcomes.get(row.memberId);
    if (!outcome) continue;
    if (row.kind === "payout") outcome.payoutC += row.amountC;
    if (row.kind === "refund") outcome.refundC += row.amountC;
    // Reopening hands the whole settlement back, so a market resolved twice
    // counts only what the resolution that stands paid out. Rows arrive in
    // ledger order, which is what makes "everything before this" the right
    // thing to forget.
    if (row.kind === "reversal") {
      outcome.payoutC = 0;
      outcome.refundC = 0;
    }
  }
  return outcomes;
}

export interface MarketResult {
  market: Market;
  side: Side;
  stakeC: number;
  returnedC: number;
  profitC: number;
  noContest: boolean; // voided or auto-refunded: stake returned, no stats impact
}

/**
 * One member's result in one resolved market. A refund — whether the market
 * was voided or the winning side was empty — means no contest: the stake came
 * back and the market carries no skill signal.
 */
export function toResult(market: Market, outcome: MemberOutcome): MarketResult {
  const noContest = market.status === "refunded" || outcome.refundC > 0;
  return {
    market,
    side: outcome.side,
    stakeC: outcome.stakeC,
    returnedC: outcome.payoutC + outcome.refundC,
    profitC: noContest ? 0 : outcome.payoutC - outcome.stakeC,
    noContest,
  };
}

/** Pure roll-up of a member's resolved results, for profile/home stat strips. */
export function summarizeResults(results: MarketResult[]) {
  const contested = results.filter((r) => !r.noContest);
  const wageredC = contested.reduce((s, r) => s + r.stakeC, 0);
  const profitC = contested.reduce((s, r) => s + r.profitC, 0);
  return {
    resolvedCount: contested.length,
    wins: contested.filter((r) => r.profitC > 0).length,
    losses: contested.filter((r) => r.profitC <= 0).length,
    wageredC,
    profitC,
    roi: wageredC > 0 ? profitC / wageredC : null,
    biggestWinC: contested.reduce((m, r) => Math.max(m, r.profitC), 0),
    biggestLossC: contested.reduce((m, r) => Math.min(m, r.profitC), 0),
  };
}
