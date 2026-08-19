// Ranking math for the "For you" rail. Pure and deterministic like
// lib/engine.ts: callers hand in plain data (open markets, the full market
// history, which markets the viewer has looked at) and get back an ordered
// list of markets the viewer hasn't joined, each with the reasons it ranked.
//
// The score is a weighted blend of eight signals, every one derived from the
// ledger and view log — nothing is stored:
//   heat       time-decayed betting action (24h half-life) — busy tables rank
//   pool       pies on the line
//   contested  how close the yes/no split is (a 50/50 pot beats a landslide)
//   crowd      how many members hold a stake
//   social     how often the viewer bets alongside this market's backers
//   topic      TF-IDF similarity between this question and the viewer's past bets
//   fresh      newly opened markets get an exploration boost (72h half-life)
//   unseen     the viewer hasn't even opened the page yet
// Weights sum to 1 so a score is always in [0, 1].

import type { Side } from "./engine.ts";

export interface StakeSnapshot {
  memberId: string;
  side: Side;
  stakeC: number;
}

/** One bet or switch, reduced to who and when — the heat signal's input. */
export interface ActionEvent {
  memberId: string;
  at: Date;
}

export interface CandidateMarket {
  id: string;
  creatorId: string;
  question: string;
  createdAt: Date;
  yesPoolC: number;
  noPoolC: number;
  stakes: StakeSnapshot[];
  actions: ActionEvent[];
}

/** Any market, open or resolved — the affinity and topic corpora. */
export interface MarketHistory {
  id: string;
  creatorId: string;
  question: string;
  /** Members holding a final stake (after switches). */
  participantIds: string[];
}

export type Reason =
  | { kind: "hot"; recentActions: number }
  | { kind: "pool"; poolC: number }
  | { kind: "contested" }
  | { kind: "friends"; memberIds: string[] }
  | { kind: "topic" }
  | { kind: "fresh" }
  | { kind: "unseen" };

export interface Recommendation {
  marketId: string;
  score: number;
  /** Ordered by how much each signal contributed. */
  reasons: Reason[];
}

const WEIGHTS = {
  heat: 0.28,
  pool: 0.1,
  contested: 0.14,
  crowd: 0.08,
  social: 0.15,
  topic: 0.1,
  fresh: 0.1,
  unseen: 0.05,
} as const;

const HEAT_HALF_LIFE_H = 24;
const FRESH_HALF_LIFE_H = 72;
const HOT_WINDOW_H = 48;
const HOT_MIN_ACTIONS = 3;
const BIG_POOL_C = 2000; // 20 pies on the line is worth calling out
const CONTESTED_MIN = 0.8; // yes share between ~28% and ~72%
const TOPIC_MIN = 0.25;
const FRIENDS_MIN_AFFINITY = 2;

const HOURS = 3_600_000;

function decay(since: Date, now: Date, halfLifeH: number): number {
  const hours = Math.max(0, (now.getTime() - since.getTime()) / HOURS);
  return 2 ** (-hours / halfLifeH);
}

/** Squash an unbounded count into [0, 1); `mid` is the halfway point. */
function squash(x: number, mid: number): number {
  return x / (x + mid);
}

// ---------- social affinity ----------

/**
 * How often the viewer shares a table with each other member: one point per
 * market where both were involved (staked or created it).
 */
function affinityByMember(viewerId: string, history: MarketHistory[]): Map<string, number> {
  const affinity = new Map<string, number>();
  for (const market of history) {
    const involved = new Set([...market.participantIds, market.creatorId]);
    if (!involved.has(viewerId)) continue;
    for (const memberId of involved) {
      if (memberId === viewerId) continue;
      affinity.set(memberId, (affinity.get(memberId) ?? 0) + 1);
    }
  }
  return affinity;
}

// ---------- topic similarity ----------

// Question-scale stopwords; anything both sides share ("will", "before") says
// nothing about taste. IDF handles the rest of the common-word problem.
const STOPWORDS = new Set(
  (
    "a an and are at be before by can does for from get has have his her if in is it its of on or " +
    "our than that the their they this to was we what when who will with you your"
  ).split(" "),
);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

type Vector = Map<string, number>;

function cosine(a: Vector, b: Vector): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [term, w] of a) {
    na += w * w;
    const bw = b.get(term);
    if (bw) dot += w * bw;
  }
  for (const w of b.values()) nb += w * w;
  return na > 0 && nb > 0 ? dot / Math.sqrt(na * nb) : 0;
}

/** TF-IDF vectors for every market question, IDF taken over the whole corpus. */
function questionVectors(history: MarketHistory[]): Map<string, Vector> {
  const docs = new Map(history.map((m) => [m.id, tokenize(m.question)]));
  const df = new Map<string, number>();
  for (const tokens of docs.values()) {
    for (const term of new Set(tokens)) df.set(term, (df.get(term) ?? 0) + 1);
  }
  const n = docs.size;
  const vectors = new Map<string, Vector>();
  for (const [id, tokens] of docs) {
    const vector: Vector = new Map();
    for (const term of tokens) {
      const idf = Math.log((n + 1) / ((df.get(term) ?? 0) + 1)) + 1;
      vector.set(term, (vector.get(term) ?? 0) + idf);
    }
    vectors.set(id, vector);
  }
  return vectors;
}

/** The viewer's taste: the summed vectors of every question they engaged with. */
function tasteVector(
  viewerId: string,
  history: MarketHistory[],
  vectors: Map<string, Vector>,
): Vector {
  const taste: Vector = new Map();
  for (const market of history) {
    if (market.creatorId !== viewerId && !market.participantIds.includes(viewerId)) continue;
    for (const [term, w] of vectors.get(market.id) ?? []) {
      taste.set(term, (taste.get(term) ?? 0) + w);
    }
  }
  return taste;
}

// ---------- the ranking ----------

export function recommend(input: {
  viewerId: string;
  now: Date;
  /** Open markets; the viewer's own and ones they already joined are dropped here. */
  candidates: CandidateMarket[];
  /** Every market ever, including the candidates. */
  history: MarketHistory[];
  /** Markets the viewer has opened the page of. */
  viewedMarketIds: ReadonlySet<string>;
  limit?: number;
}): Recommendation[] {
  const { viewerId, now, candidates, history, viewedMarketIds, limit = 3 } = input;

  const eligible = candidates.filter(
    (m) => m.creatorId !== viewerId && !m.stakes.some((s) => s.memberId === viewerId),
  );
  if (eligible.length === 0) return [];

  const affinity = affinityByMember(viewerId, history);
  const vectors = questionVectors(history);
  const taste = tasteVector(viewerId, history, vectors);

  const scored = eligible.map((market) => {
    const poolC = market.yesPoolC + market.noPoolC;
    const backers = market.stakes.length;
    const recentActions = market.actions.filter(
      (a) => now.getTime() - a.at.getTime() <= HOT_WINDOW_H * HOURS,
    ).length;

    const heat = squash(
      market.actions.reduce((s, a) => s + decay(a.at, now, HEAT_HALF_LIFE_H), 0),
      2,
    );
    const pool = squash(poolC, 1000);
    const yesShare = poolC > 0 ? market.yesPoolC / poolC : 0;
    const contested = market.yesPoolC > 0 && market.noPoolC > 0 ? 4 * yesShare * (1 - yesShare) : 0;
    const crowd = squash(backers, 3);

    const involved = new Set([...market.stakes.map((s) => s.memberId), market.creatorId]);
    const friendScore = [...involved].reduce((s, id) => s + (affinity.get(id) ?? 0), 0);
    const social = squash(friendScore, 5);

    const topic = cosine(vectors.get(market.id) ?? new Map(), taste);
    const fresh = decay(market.createdAt, now, FRESH_HALF_LIFE_H);
    const unseen = viewedMarketIds.has(market.id) ? 0 : 1;

    const parts: { reason: Reason | null; contribution: number }[] = [
      {
        reason: recentActions >= HOT_MIN_ACTIONS ? { kind: "hot", recentActions } : null,
        contribution: WEIGHTS.heat * heat,
      },
      {
        reason: poolC >= BIG_POOL_C ? { kind: "pool", poolC } : null,
        contribution: WEIGHTS.pool * pool,
      },
      {
        reason: contested >= CONTESTED_MIN ? { kind: "contested" } : null,
        contribution: WEIGHTS.contested * contested,
      },
      { reason: null, contribution: WEIGHTS.crowd * crowd },
      {
        reason:
          friendScore >= FRIENDS_MIN_AFFINITY
            ? {
                kind: "friends",
                memberIds: [...involved]
                  .filter((id) => (affinity.get(id) ?? 0) > 0)
                  .sort(
                    (a, b) => (affinity.get(b) ?? 0) - (affinity.get(a) ?? 0) || (a < b ? -1 : 1),
                  )
                  .slice(0, 2),
              }
            : null,
        contribution: WEIGHTS.social * social,
      },
      {
        reason: topic >= TOPIC_MIN ? { kind: "topic" } : null,
        contribution: WEIGHTS.topic * topic,
      },
      {
        reason: now.getTime() - market.createdAt.getTime() <= 24 * HOURS ? { kind: "fresh" } : null,
        contribution: WEIGHTS.fresh * fresh,
      },
      {
        // "you haven't looked" only earns a chip once the market has been
        // around a while — on a brand-new market "fresh" already says it.
        reason:
          unseen === 1 && now.getTime() - market.createdAt.getTime() > 24 * HOURS
            ? { kind: "unseen" }
            : null,
        contribution: WEIGHTS.unseen * unseen,
      },
    ];

    return {
      marketId: market.id,
      createdAt: market.createdAt,
      score: parts.reduce((s, p) => s + p.contribution, 0),
      reasons: parts
        .filter((p): p is { reason: Reason; contribution: number } => p.reason !== null)
        .sort((a, b) => b.contribution - a.contribution)
        .map((p) => p.reason),
    };
  });

  return scored
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.createdAt.getTime() - a.createdAt.getTime() ||
        (a.marketId < b.marketId ? -1 : 1),
    )
    .slice(0, limit)
    .map(({ marketId, score, reasons }) => ({ marketId, score, reasons }));
}
