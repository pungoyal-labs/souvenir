import { describe, expect, it } from "vitest";
import {
  type CandidateMarket,
  type MarketHistory,
  recommend,
  type StakeSnapshot,
} from "./recommend.ts";

const NOW = new Date("2026-08-19T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

const stake = (memberId: string, side: "yes" | "no", pies: number): StakeSnapshot => ({
  memberId,
  side,
  stakeC: pies * 100,
});

function candidate(id: string, over: Partial<CandidateMarket> = {}): CandidateMarket {
  const stakes = over.stakes ?? [];
  return {
    id,
    creatorId: "creator",
    question: `Will thing ${id} happen`,
    createdAt: hoursAgo(48),
    yesPoolC: stakes.filter((s) => s.side === "yes").reduce((t, s) => t + s.stakeC, 0),
    noPoolC: stakes.filter((s) => s.side === "no").reduce((t, s) => t + s.stakeC, 0),
    stakes,
    actions: stakes.map((s) => ({ memberId: s.memberId, at: hoursAgo(48) })),
    ...over,
  };
}

function history(candidates: CandidateMarket[], extra: MarketHistory[] = []): MarketHistory[] {
  return [
    ...candidates.map((c) => ({
      id: c.id,
      creatorId: c.creatorId,
      question: c.question,
      participantIds: c.stakes.map((s) => s.memberId),
    })),
    ...extra,
  ];
}

function rank(candidates: CandidateMarket[], extra: MarketHistory[] = [], viewed: string[] = []) {
  return recommend({
    viewerId: "me",
    now: NOW,
    candidates,
    history: history(candidates, extra),
    viewedMarketIds: new Set(viewed),
    limit: 10,
  });
}

describe("eligibility", () => {
  it("drops markets the viewer created or already joined", () => {
    const mine = candidate("mine", { creatorId: "me" });
    const joined = candidate("joined", { stakes: [stake("me", "yes", 2)] });
    const open = candidate("open", { stakes: [stake("a", "yes", 2)] });
    expect(rank([mine, joined, open]).map((r) => r.marketId)).toEqual(["open"]);
  });

  it("returns empty for no eligible candidates, without touching history", () => {
    expect(rank([candidate("mine", { creatorId: "me" })])).toEqual([]);
  });
});

describe("signals", () => {
  it("ranks a market with recent action over an identical stale one", () => {
    const base = { stakes: [stake("a", "yes", 3), stake("b", "no", 3)] };
    const hot = candidate("hot", {
      ...base,
      actions: [
        { memberId: "a", at: hoursAgo(1) },
        { memberId: "b", at: hoursAgo(2) },
        { memberId: "a", at: hoursAgo(3) },
      ],
    });
    const stale = candidate("stale", {
      ...base,
      actions: [
        { memberId: "a", at: hoursAgo(300) },
        { memberId: "b", at: hoursAgo(300) },
        { memberId: "a", at: hoursAgo(300) },
      ],
    });
    const out = rank([hot, stale]);
    expect(out.map((r) => r.marketId)).toEqual(["hot", "stale"]);
    expect(out[0].reasons).toContainEqual({ kind: "hot", recentActions: 3 });
  });

  it("prefers a contested pool over a one-sided one of the same size", () => {
    const even = candidate("even", { stakes: [stake("a", "yes", 5), stake("b", "no", 5)] });
    const landslide = candidate("landslide", {
      stakes: [stake("a", "yes", 5), stake("b", "yes", 5)],
    });
    const out = rank([even, landslide]);
    expect(out.map((r) => r.marketId)).toEqual(["even", "landslide"]);
    expect(out[0].reasons).toContainEqual({ kind: "contested" });
  });

  it("prefers markets backed by the viewer's usual table-mates", () => {
    // "me" has shared two markets with "pal", none with "stranger".
    const shared: MarketHistory[] = [
      { id: "h1", creatorId: "x", question: "old one", participantIds: ["me", "pal"] },
      { id: "h2", creatorId: "x", question: "old two", participantIds: ["me", "pal"] },
    ];
    const palsTable = candidate("pals", { stakes: [stake("pal", "yes", 2)] });
    const strangers = candidate("strangers", { stakes: [stake("stranger", "yes", 2)] });
    const out = rank([palsTable, strangers], shared);
    expect(out.map((r) => r.marketId)).toEqual(["pals", "strangers"]);
    expect(out[0].reasons).toContainEqual({ kind: "friends", memberIds: ["pal"] });
  });

  it("prefers questions similar to the viewer's past bets", () => {
    const past: MarketHistory[] = [
      {
        id: "h1",
        creatorId: "x",
        question: "Will the cricket team win the series",
        participantIds: ["me"],
      },
    ];
    const cricket = candidate("cricket", {
      question: "Will the cricket team lose the final",
      stakes: [stake("a", "yes", 2)],
    });
    const weather = candidate("weather", {
      question: "Rain tomorrow evening in town",
      stakes: [stake("a", "yes", 2)],
    });
    const out = rank([cricket, weather], past);
    expect(out.map((r) => r.marketId)).toEqual(["cricket", "weather"]);
    expect(out[0].reasons).toContainEqual({ kind: "topic" });
  });

  it("surfaces a brand-new empty market via freshness (cold start)", () => {
    const empty = candidate("empty", { createdAt: hoursAgo(2) });
    const out = rank([empty]);
    expect(out).toHaveLength(1);
    expect(out[0].reasons).toContainEqual({ kind: "fresh" });
  });

  it("calls out big pools at the threshold, not below it", () => {
    const big = candidate("big", { stakes: [stake("a", "yes", 10), stake("b", "no", 10)] });
    const small = candidate("small", { stakes: [stake("a", "yes", 10), stake("b", "no", 9)] });
    const [bigRec, smallRec] = rank([big, small]);
    expect(bigRec.reasons).toContainEqual({ kind: "pool", poolC: 2000 });
    expect(smallRec.reasons.some((r) => r.kind === "pool")).toBe(false);
  });

  it("needs three recent actions for the hot chip", () => {
    const twoBets = candidate("two", {
      stakes: [stake("a", "yes", 2), stake("b", "no", 2)],
      actions: [
        { memberId: "a", at: hoursAgo(1) },
        { memberId: "b", at: hoursAgo(2) },
      ],
    });
    const [rec] = rank([twoBets]);
    expect(rec.reasons.some((r) => r.kind === "hot")).toBe(false);
  });

  it("draws the contested line between 70/30 and 80/20", () => {
    const close = candidate("close", { stakes: [stake("a", "yes", 7), stake("b", "no", 3)] });
    const lopsided = candidate("lop", { stakes: [stake("a", "yes", 8), stake("b", "no", 2)] });
    const out = rank([close, lopsided]);
    const closeRec = out.find((r) => r.marketId === "close")!;
    const lopRec = out.find((r) => r.marketId === "lop")!;
    expect(closeRec.reasons).toContainEqual({ kind: "contested" });
    expect(lopRec.reasons.some((r) => r.kind === "contested")).toBe(false);
  });

  it("skips the unseen chip on fresh markets — 'just opened' already covers it", () => {
    const freshUnseen = candidate("fresh", { createdAt: hoursAgo(3) });
    const [rec] = rank([freshUnseen]);
    expect(rec.reasons).toContainEqual({ kind: "fresh" });
    expect(rec.reasons.some((r) => r.kind === "unseen")).toBe(false);
  });

  it("orders reasons by how much each signal contributed", () => {
    const busyAndFresh = candidate("bf", {
      createdAt: hoursAgo(2),
      stakes: [stake("a", "yes", 1), stake("b", "yes", 1)],
      actions: [
        { memberId: "a", at: hoursAgo(1) },
        { memberId: "b", at: hoursAgo(1) },
        { memberId: "a", at: hoursAgo(2) },
        { memberId: "b", at: hoursAgo(2) },
      ],
    });
    const [rec] = rank([busyAndFresh]);
    expect(rec.reasons.map((r) => r.kind)).toEqual(["hot", "fresh"]);
  });

  it("flags older markets the viewer never opened, but not viewed ones", () => {
    const unseen = candidate("unseen", { stakes: [stake("a", "yes", 2)] });
    const seen = candidate("seen", { stakes: [stake("a", "yes", 2)] });
    const out = rank([unseen, seen], [], ["seen"]);
    expect(out.map((r) => r.marketId)).toEqual(["unseen", "seen"]);
    expect(out[0].reasons).toContainEqual({ kind: "unseen" });
    expect(out[1].reasons).not.toContainEqual({ kind: "unseen" });
  });
});

describe("output shape", () => {
  it("is deterministic, score-descending, and respects the limit", () => {
    const candidates = ["a", "b", "c", "d"].map((id) =>
      candidate(id, { stakes: [stake("x", "yes", 2)] }),
    );
    const full = rank(candidates);
    expect(full.map((r) => r.marketId)).toEqual(rank(candidates).map((r) => r.marketId));
    for (let i = 1; i < full.length; i++)
      expect(full[i - 1].score).toBeGreaterThanOrEqual(full[i].score);
    expect(
      recommend({
        viewerId: "me",
        now: NOW,
        candidates,
        history: history(candidates),
        viewedMarketIds: new Set(),
        limit: 2,
      }),
    ).toHaveLength(2);
  });

  it("breaks exact ties by newest, then id", () => {
    const twinA = candidate("a", { createdAt: hoursAgo(48) });
    const twinB = candidate("b", { createdAt: hoursAgo(48) });
    const newer = candidate("c", { createdAt: hoursAgo(24) });
    expect(rank([twinB, newer, twinA]).map((r) => r.marketId)).toEqual(["c", "a", "b"]);
  });

  it("defaults to three picks", () => {
    const candidates = ["a", "b", "c", "d", "e"].map((id) => candidate(id));
    const out = recommend({
      viewerId: "me",
      now: NOW,
      candidates,
      history: history(candidates),
      viewedMarketIds: new Set(),
    });
    expect(out).toHaveLength(3);
  });

  it("keeps scores in [0, 1] and handles a viewer with no history", () => {
    const busy = candidate("busy", {
      createdAt: hoursAgo(1),
      stakes: [stake("a", "yes", 9), stake("b", "no", 9), stake("c", "yes", 9)],
      actions: [
        { memberId: "a", at: hoursAgo(1) },
        { memberId: "b", at: hoursAgo(1) },
        { memberId: "c", at: hoursAgo(1) },
      ],
    });
    const [top] = rank([busy]);
    expect(top.score).toBeGreaterThan(0);
    expect(top.score).toBeLessThanOrEqual(1);
  });
});
