import { describe, expect, it } from "vitest";
import type { LedgerRow, Market } from "./db/schema.ts";
import type { Side } from "./engine.ts";
import { marketOutcomes, summarizeResults, toEvents, toResult } from "./stats.ts";

const market = (over: Partial<Market> = {}): Market => ({
  id: "m1",
  creatorId: "creator",
  question: "Will it happen?",
  criteria: "Somehow.",
  createdAt: new Date("2026-08-01T00:00:00Z"),
  status: "yes",
  resolvedAt: new Date("2026-08-02T00:00:00Z"),
  resolutionNote: null,
  ...over,
});

let seq = 0;
const row = (
  memberId: string,
  kind: LedgerRow["kind"],
  over: Partial<LedgerRow> = {},
): LedgerRow => ({
  id: ++seq,
  at: new Date("2026-08-01T12:00:00Z"),
  memberId,
  marketId: "m1",
  side: null,
  amountC: 0,
  balanceDeltaC: 0,
  note: null,
  ...over,
  kind,
});

const bet = (memberId: string, side: Side, pies: number) =>
  row(memberId, "bet", { side, amountC: pies * 100, balanceDeltaC: -pies * 100 });
const payout = (memberId: string, side: Side, amountC: number) =>
  row(memberId, "payout", { side, amountC, balanceDeltaC: amountC });
const refund = (memberId: string, amountC: number) =>
  row(memberId, "refund", { amountC, balanceDeltaC: amountC });

describe("toEvents", () => {
  it("keeps only bets and switches, in order, with engine fields", () => {
    const events = toEvents([
      bet("a", "yes", 3),
      payout("a", "yes", 600),
      refund("b", 200),
      row("a", "switch", { side: "no", amountC: 300 }),
    ]);
    expect(events).toEqual([
      { memberId: "a", kind: "bet", side: "yes", amountC: 300 },
      { memberId: "a", kind: "switch", side: "no", amountC: 300 },
    ]);
  });
});

describe("marketOutcomes", () => {
  it("rolls stakes and returns into per-member outcomes", () => {
    const outcomes = marketOutcomes([
      bet("a", "yes", 3),
      bet("a", "yes", 2),
      bet("b", "no", 4),
      payout("a", "yes", 900),
    ]);
    expect(outcomes.get("a")).toEqual({ side: "yes", stakeC: 500, payoutC: 900, refundC: 0 });
    expect(outcomes.get("b")).toEqual({ side: "no", stakeC: 400, payoutC: 0, refundC: 0 });
  });

  it("reports the final side after a switch", () => {
    const outcomes = marketOutcomes([
      bet("a", "yes", 5),
      row("a", "switch", { side: "no", amountC: 500 }),
    ]);
    expect(outcomes.get("a")).toEqual({ side: "no", stakeC: 500, payoutC: 0, refundC: 0 });
  });

  it("ignores return rows for members with no stake", () => {
    const outcomes = marketOutcomes([bet("a", "yes", 1), refund("ghost", 300)]);
    expect(outcomes.has("ghost")).toBe(false);
  });

  it("sums multiple refund rows", () => {
    const outcomes = marketOutcomes([bet("a", "yes", 4), refund("a", 100), refund("a", 300)]);
    expect(outcomes.get("a")).toEqual({ side: "yes", stakeC: 400, payoutC: 0, refundC: 400 });
  });
});

describe("toResult", () => {
  it("computes profit for a win", () => {
    const r = toResult(market(), { side: "yes", stakeC: 500, payoutC: 900, refundC: 0 });
    expect(r).toMatchObject({ profitC: 400, returnedC: 900, noContest: false });
  });

  it("computes loss as the full stake when nothing came back", () => {
    const r = toResult(market(), { side: "no", stakeC: 400, payoutC: 0, refundC: 0 });
    expect(r).toMatchObject({ profitC: -400, returnedC: 0, noContest: false });
  });

  it("treats a voided market as no contest with zero profit", () => {
    const r = toResult(market({ status: "refunded" }), {
      side: "yes",
      stakeC: 500,
      payoutC: 0,
      refundC: 500,
    });
    expect(r).toMatchObject({ profitC: 0, returnedC: 500, noContest: true });
  });

  it("treats an auto-refund (empty winning side) as no contest even when the market resolved", () => {
    const r = toResult(market({ status: "yes" }), {
      side: "no",
      stakeC: 300,
      payoutC: 0,
      refundC: 300,
    });
    expect(r).toMatchObject({ profitC: 0, noContest: true });
  });
});

describe("summarizeResults", () => {
  const win = toResult(market({ id: "w" }), { side: "yes", stakeC: 500, payoutC: 900, refundC: 0 });
  const loss = toResult(market({ id: "l" }), { side: "no", stakeC: 300, payoutC: 0, refundC: 0 });
  const voided = toResult(market({ id: "v", status: "refunded" }), {
    side: "yes",
    stakeC: 1000,
    payoutC: 0,
    refundC: 1000,
  });

  it("rolls wins, losses, wagered, profit, roi and extremes", () => {
    const s = summarizeResults([win, loss]);
    expect(s).toEqual({
      resolvedCount: 2,
      wins: 1,
      losses: 1,
      wageredC: 800,
      profitC: 100,
      roi: 100 / 800,
      biggestWinC: 400,
      biggestLossC: -300,
    });
  });

  it("excludes no-contest results from every stat", () => {
    expect(summarizeResults([win, loss, voided])).toEqual(summarizeResults([win, loss]));
  });

  it("returns null roi and zeroes with no contested results", () => {
    const s = summarizeResults([voided]);
    expect(s).toEqual({
      resolvedCount: 0,
      wins: 0,
      losses: 0,
      wageredC: 0,
      profitC: 0,
      roi: null,
      biggestWinC: 0,
      biggestLossC: 0,
    });
  });

  it("counts an exact break-even as a loss (no profit, no glory)", () => {
    const even = toResult(market({ id: "e" }), {
      side: "yes",
      stakeC: 500,
      payoutC: 500,
      refundC: 0,
    });
    const s = summarizeResults([even]);
    expect(s.wins).toBe(0);
    expect(s.losses).toBe(1);
    expect(s.profitC).toBe(0);
  });
});
