// All reads and pie-moving writes. Every mutation runs in a transaction,
// locks the rows it checks, and only ever appends to the ledger.

import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "./db/index.ts";
import {
  allowlist,
  type LedgerRow,
  ledger,
  type Market,
  type Member,
  markets,
  members,
} from "./db/schema.ts";
import { normalizeEmail } from "./email.ts";
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
import { env } from "./env.ts";
import { logger } from "./logger.ts";
import { toCents } from "./pies.ts";

/** User-facing failures (insufficient pies, market closed, …). */
export class DataError extends Error {}

// ---------- derived shapes ----------

export interface ParticipantPosition {
  member: Member;
  side: Side;
  stakeC: number;
}

export interface MarketView {
  market: Market;
  creator: Member;
  yesPoolC: number;
  noPoolC: number;
  participants: ParticipantPosition[];
  mySide: Side | null;
  myStakeC: number;
}

export interface ActivityItem {
  row: LedgerRow;
  member: Member;
  market: Market | null;
}

export interface MarketResult {
  market: Market;
  side: Side;
  stakeC: number;
  returnedC: number;
  profitC: number;
  noContest: boolean; // voided or auto-refunded: stake returned, no stats impact
}

export interface MemberStats {
  member: Member;
  netC: number;
  committedC: number;
  resolvedCount: number;
  wins: number;
  losses: number;
  wageredC: number;
  profitC: number;
  roi: number | null;
  ranked: boolean;
  biggestWinC: number;
  biggestLossC: number;
}

// ---------- replay helpers ----------

function toEvents(rows: LedgerRow[]): MarketEvent[] {
  return rows
    .filter((r) => r.kind === "bet" || r.kind === "switch")
    .map((r) => ({
      memberId: r.memberId,
      kind: r.kind as "bet" | "switch",
      side: r.side as Side,
      amountC: r.amountC,
    }));
}

function replay(rows: LedgerRow[]): Map<string, Position> {
  return computePositions(toEvents(rows));
}

function positionsToParticipants(
  positions: Map<string, Position>,
  memberById: Map<string, Member>,
): ParticipantPosition[] {
  const out: ParticipantPosition[] = [];
  for (const [memberId, pos] of positions) {
    const stakeC = exposure(pos);
    if (stakeC === 0) continue;
    const member = memberById.get(memberId);
    if (!member) continue;
    out.push({ member, side: pos.yesC > 0 ? "yes" : "no", stakeC });
  }
  return out.sort((a, b) => b.stakeC - a.stakeC || a.member.name.localeCompare(b.member.name));
}

async function marketLedger(marketIds: string[]): Promise<Map<string, LedgerRow[]>> {
  const byMarket = new Map<string, LedgerRow[]>();
  if (marketIds.length === 0) return byMarket;
  const rows = await db
    .select()
    .from(ledger)
    .where(inArray(ledger.marketId, marketIds))
    .orderBy(asc(ledger.id));
  for (const row of rows) {
    const list = byMarket.get(row.marketId!) ?? [];
    list.push(row);
    byMarket.set(row.marketId!, list);
  }
  return byMarket;
}

async function membersById(): Promise<Map<string, Member>> {
  const all = await db.select().from(members);
  return new Map(all.map((m) => [m.id, m]));
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Every write starts the same way: take the row lock so concurrent bets on one
 * market serialize, then read back the stake events to replay. Callers check
 * `status` themselves — the message differs between betting and resolving.
 */
async function lockMarket(tx: Tx, marketId: string): Promise<Market> {
  const [market] = await tx.select().from(markets).where(eq(markets.id, marketId)).for("update");
  if (!market) throw new DataError("Prediction not found.");
  return market;
}

function requireOpen(market: Market): void {
  if (market.status !== "open") throw new DataError("This prediction has already been resolved.");
}

/** The bet/switch rows for one market, oldest first — the replay input. */
async function stakeRows(tx: Tx, marketId: string): Promise<LedgerRow[]> {
  return tx
    .select()
    .from(ledger)
    .where(and(eq(ledger.marketId, marketId), inArray(ledger.kind, ["bet", "switch"])))
    .orderBy(asc(ledger.id));
}

// ---------- membership ----------

export async function isAllowed(email: string): Promise<boolean> {
  const normalized = normalizeEmail(email);
  if (env.FOUNDING_MEMBERS.includes(normalized)) return true;
  const [row] = await db.select().from(allowlist).where(eq(allowlist.email, normalized));
  if (row) return true;
  const [existing] = await db.select().from(members).where(eq(members.email, normalized));
  return Boolean(existing);
}

/**
 * Called on every sign-in. Returns the member, creating them on first
 * arrival — or null if the email isn't invited. There is no starting grant:
 * every member has an infinite bank, and their number is lifetime net.
 */
export async function ensureMember(
  email: string,
  name: string | null,
  image: string | null,
  opts?: { bypassAllowlist?: boolean },
): Promise<Member | null> {
  const normalized = normalizeEmail(email);
  const [existing] = await db.select().from(members).where(eq(members.email, normalized));
  if (existing) {
    if ((name && name !== existing.name) || (image && image !== existing.image)) {
      const [updated] = await db
        .update(members)
        .set({ name: name ?? existing.name, image: image ?? existing.image })
        .where(eq(members.id, existing.id))
        .returning();
      return updated;
    }
    return existing;
  }

  if (!opts?.bypassAllowlist && !(await isAllowed(normalized))) return null;

  try {
    const [created] = await db
      .insert(members)
      .values({ id: randomUUID(), email: normalized, name: name ?? normalized, image })
      .returning();
    logger.info({ memberId: created.id, email: normalized }, "member joined");
    return created;
  } catch {
    // Concurrent first sign-in: the unique email constraint fired; re-read.
    logger.debug({ email: normalized }, "concurrent first sign-in, re-reading member");
    const [raced] = await db.select().from(members).where(eq(members.email, normalized));
    return raced ?? null;
  }
}

export async function getMember(id: string): Promise<Member | null> {
  const [m] = await db.select().from(members).where(eq(members.id, id));
  return m ?? null;
}

export async function listMembers(): Promise<Member[]> {
  return db.select().from(members).orderBy(asc(members.joinedAt));
}

export async function listInvites() {
  return db.select().from(allowlist).orderBy(asc(allowlist.createdAt));
}

export function isFounder(member: Member): boolean {
  return env.FOUNDING_MEMBERS.includes(member.email);
}

export async function invite(email: string, invitedBy: string): Promise<void> {
  const inviter = await getMember(invitedBy);
  if (!inviter || !isFounder(inviter)) {
    throw new DataError("Only founding members can invite people.");
  }
  const normalized = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new DataError("That doesn't look like an email address.");
  }
  await db.insert(allowlist).values({ email: normalized, invitedBy }).onConflictDoNothing();
  logger.info({ email: normalized, invitedBy }, "member invited");
}

// ---------- markets: reads ----------

function buildView(
  market: Market,
  rows: LedgerRow[],
  memberById: Map<string, Member>,
  viewerId: string,
): MarketView {
  const positions = replay(rows);
  const participants = positionsToParticipants(positions, memberById);
  let yesPoolC = 0;
  let noPoolC = 0;
  for (const pos of positions.values()) {
    yesPoolC += pos.yesC;
    noPoolC += pos.noC;
  }
  const mine = positions.get(viewerId);
  const myStakeC = mine ? exposure(mine) : 0;
  return {
    market,
    creator: memberById.get(market.creatorId)!,
    yesPoolC,
    noPoolC,
    participants,
    mySide: myStakeC > 0 ? (mine!.yesC > 0 ? "yes" : "no") : null,
    myStakeC,
  };
}

export async function listMarkets(viewerId: string): Promise<{
  open: MarketView[];
  resolved: MarketView[];
}> {
  const all = await db.select().from(markets).orderBy(desc(markets.createdAt));
  const memberById = await membersById();
  const rowsByMarket = await marketLedger(all.map((m) => m.id));
  const views = all.map((m) => buildView(m, rowsByMarket.get(m.id) ?? [], memberById, viewerId));
  const open = views.filter((v) => v.market.status === "open");
  const resolved = views
    .filter((v) => v.market.status !== "open")
    .sort((a, b) => (b.market.resolvedAt?.getTime() ?? 0) - (a.market.resolvedAt?.getTime() ?? 0));
  return { open, resolved };
}

export async function getMarketView(
  marketId: string,
  viewerId: string,
): Promise<{ view: MarketView; activity: ActivityItem[]; settlements: ActivityItem[] } | null> {
  const [market] = await db.select().from(markets).where(eq(markets.id, marketId));
  if (!market) return null;
  const memberById = await membersById();
  const rows = (await marketLedger([marketId])).get(marketId) ?? [];
  const view = buildView(market, rows, memberById, viewerId);
  const items: ActivityItem[] = rows.map((row) => ({
    row,
    member: memberById.get(row.memberId)!,
    market,
  }));
  return {
    view,
    activity: items.filter((i) => i.row.kind === "bet" || i.row.kind === "switch").reverse(),
    settlements: items.filter((i) => i.row.kind === "payout" || i.row.kind === "refund"),
  };
}

export async function recentActivity(limit = 12): Promise<ActivityItem[]> {
  const rows = await db
    .select()
    .from(ledger)
    .where(inArray(ledger.kind, ["bet", "switch", "payout", "refund"]))
    .orderBy(desc(ledger.id))
    .limit(limit);
  const memberById = await membersById();
  const marketIds = [...new Set(rows.map((r) => r.marketId).filter((x): x is string => !!x))];
  const marketRows = marketIds.length
    ? await db.select().from(markets).where(inArray(markets.id, marketIds))
    : [];
  const marketById = new Map(marketRows.map((m) => [m.id, m]));
  return rows.map((row) => ({
    row,
    member: memberById.get(row.memberId)!,
    market: row.marketId ? (marketById.get(row.marketId) ?? null) : null,
  }));
}

// ---------- markets: writes ----------

export async function createMarket(
  creatorId: string,
  question: string,
  criteria: string,
): Promise<string> {
  const q = question.trim();
  const c = criteria.trim();
  if (q.length < 5) throw new DataError("Give the prediction a real question.");
  if (q.length > 200) throw new DataError("Keep the question under 200 characters.");
  if (c.length < 5) {
    throw new DataError("Spell out how this will be resolved — future-you will thank you.");
  }
  if (c.length > 2000) throw new DataError("Keep resolution criteria under 2000 characters.");
  const id = randomUUID();
  await db.insert(markets).values({ id, creatorId, question: q, criteria: c });
  logger.info({ marketId: id, creatorId }, "market created");
  return id;
}

export async function placeBet(
  memberId: string,
  marketId: string,
  side: Side,
  pies: number,
): Promise<void> {
  if (!Number.isInteger(pies) || pies < 1) {
    throw new DataError("A bet must be a whole number of pies, at least 1.");
  }
  const amountC = toCents(pies);
  const maxC = toCents(env.MAX_STAKE_PIES);

  await db.transaction(async (tx) => {
    requireOpen(await lockMarket(tx, marketId));
    const pos = replay(await stakeRows(tx, marketId)).get(memberId) ?? { yesC: 0, noC: 0 };

    const oppStakeC = side === "yes" ? pos.noC : pos.yesC;
    if (oppStakeC > 0) {
      throw new DataError("You're on the other side of this one. Switch sides first.");
    }
    if (exposure(pos) + amountC > maxC) {
      throw new DataError(`Max exposure is ${env.MAX_STAKE_PIES} pies per prediction.`);
    }
    // No balance check: members have an infinite bank. Net can go negative;
    // the per-market exposure cap is the only brake.

    await tx.insert(ledger).values({
      memberId,
      marketId,
      kind: "bet",
      side,
      amountC,
      balanceDeltaC: -amountC,
    });
  });
  logger.info({ memberId, marketId, side, amountC }, "bet placed");
}

export async function switchSides(memberId: string, marketId: string): Promise<void> {
  let switched: { from: Side; stakeC: number } | undefined;
  await db.transaction(async (tx) => {
    requireOpen(await lockMarket(tx, marketId));
    const pos = replay(await stakeRows(tx, marketId)).get(memberId);
    const stakeC = pos ? exposure(pos) : 0;
    if (!pos || stakeC === 0) throw new DataError("You have no bet to switch.");

    const from: Side = pos.yesC > 0 ? "yes" : "no";
    await tx.insert(ledger).values({
      memberId,
      marketId,
      kind: "switch",
      side: otherSide(from),
      amountC: stakeC,
      balanceDeltaC: 0,
      note: `Switched ${from.toUpperCase()} → ${otherSide(from).toUpperCase()}`,
    });
    switched = { from, stakeC };
  });
  if (switched) {
    logger.info(
      {
        memberId,
        marketId,
        from: switched.from,
        to: otherSide(switched.from),
        stakeC: switched.stakeC,
      },
      "sides switched",
    );
  }
}

export async function resolveMarket(
  marketId: string,
  resolverId: string,
  outcome: Side | "refunded",
  note: string,
): Promise<void> {
  let settled: { rows: number; totalC: number; autoRefunded: boolean } | undefined;
  await db.transaction(async (tx) => {
    const market = await lockMarket(tx, marketId);
    if (market.creatorId !== resolverId) {
      throw new DataError("Only the creator can resolve this prediction.");
    }
    if (market.status !== "open") throw new DataError("Already resolved — resolution is final.");

    const positions = replay(await stakeRows(tx, marketId));

    let resolutionNote = note.trim();

    if (outcome === "refunded") {
      const refunds = refundAll(positions);
      settled = {
        rows: refunds.size,
        totalC: [...refunds.values()].reduce((s, c) => s + c, 0),
        autoRefunded: false,
      };
      for (const [mid, amountC] of refunds) {
        await tx.insert(ledger).values({
          memberId: mid,
          marketId,
          kind: "refund",
          amountC,
          balanceDeltaC: amountC,
          note: "Market voided — stake returned",
        });
      }
    } else {
      const result = settle(positions, outcome);
      settled = {
        rows: result.payoutsC.size,
        totalC: result.totalPoolC,
        autoRefunded: result.autoRefunded,
      };
      if (result.autoRefunded) {
        resolutionNote = [
          resolutionNote,
          "Nobody held the winning side, so all stakes were returned.",
        ]
          .filter(Boolean)
          .join(" ");
        for (const [mid, amountC] of result.payoutsC) {
          await tx.insert(ledger).values({
            memberId: mid,
            marketId,
            kind: "refund",
            amountC,
            balanceDeltaC: amountC,
            note: "Winning side was empty — stake returned",
          });
        }
      } else {
        for (const [mid, amountC] of result.payoutsC) {
          await tx.insert(ledger).values({
            memberId: mid,
            marketId,
            kind: "payout",
            side: outcome,
            amountC,
            balanceDeltaC: amountC,
            note: `Share of the ${result.totalPoolC / 100}-pie pool`,
          });
        }
      }
    }

    await tx
      .update(markets)
      .set({
        status: outcome,
        resolvedAt: new Date(),
        resolutionNote: resolutionNote || null,
      })
      .where(eq(markets.id, marketId));
  });
  logger.info(
    {
      marketId,
      resolverId,
      outcome,
      poolC: settled?.totalC ?? 0,
      ledgerRows: settled?.rows ?? 0,
      autoRefunded: settled?.autoRefunded ?? false,
    },
    "market resolved",
  );
}

// ---------- member accounting ----------

export async function netOf(memberId: string): Promise<number> {
  const [row] = await db
    .select({ bal: sql<number>`coalesce(sum(${ledger.balanceDeltaC}), 0)::int` })
    .from(ledger)
    .where(eq(ledger.memberId, memberId));
  return row.bal;
}

export async function memberLedger(memberId: string): Promise<ActivityItem[]> {
  const rows = await db
    .select()
    .from(ledger)
    .where(eq(ledger.memberId, memberId))
    .orderBy(desc(ledger.id));
  const memberById = await membersById();
  const marketIds = [...new Set(rows.map((r) => r.marketId).filter((x): x is string => !!x))];
  const marketRows = marketIds.length
    ? await db.select().from(markets).where(inArray(markets.id, marketIds))
    : [];
  const marketById = new Map(marketRows.map((m) => [m.id, m]));
  return rows.map((row) => ({
    row,
    member: memberById.get(row.memberId)!,
    market: row.marketId ? (marketById.get(row.marketId) ?? null) : null,
  }));
}

/** Per-participant outcome of one market: final side/stake plus what came back. */
interface MemberOutcome {
  side: Side;
  stakeC: number;
  payoutC: number;
  refundC: number;
}

function marketOutcomes(rows: LedgerRow[]): Map<string, MemberOutcome> {
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
  }
  return outcomes;
}

/** One member's outcome in every resolved market they took part in. */
export async function memberResults(memberId: string): Promise<MarketResult[]> {
  const resolved = await db
    .select()
    .from(markets)
    .where(inArray(markets.status, ["yes", "no", "refunded"]))
    .orderBy(desc(markets.resolvedAt));
  const rowsByMarket = await marketLedger(resolved.map((m) => m.id));

  const results: MarketResult[] = [];
  for (const market of resolved) {
    const outcome = marketOutcomes(rowsByMarket.get(market.id) ?? []).get(memberId);
    if (!outcome) continue;
    const noContest = market.status === "refunded" || outcome.refundC > 0;
    results.push({
      market,
      side: outcome.side,
      stakeC: outcome.stakeC,
      returnedC: outcome.payoutC + outcome.refundC,
      profitC: noContest ? 0 : outcome.payoutC - outcome.stakeC,
      noContest,
    });
  }
  return results;
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

// ---------- leaderboard ----------

export async function leaderboard(): Promise<{ ranked: MemberStats[]; unranked: MemberStats[] }> {
  const allMembers = await listMembers();
  const stats = new Map<string, MemberStats>(
    allMembers.map((m) => [
      m.id,
      {
        member: m,
        netC: 0,
        committedC: 0,
        resolvedCount: 0,
        wins: 0,
        losses: 0,
        wageredC: 0,
        profitC: 0,
        roi: null,
        ranked: false,
        biggestWinC: 0,
        biggestLossC: 0,
      },
    ]),
  );

  const balances = await db
    .select({
      memberId: ledger.memberId,
      bal: sql<number>`coalesce(sum(${ledger.balanceDeltaC}), 0)::int`,
    })
    .from(ledger)
    .groupBy(ledger.memberId);
  for (const b of balances) {
    const s = stats.get(b.memberId);
    if (s) s.netC = b.bal;
  }

  const allMarkets = await db.select().from(markets);
  const rowsByMarket = await marketLedger(allMarkets.map((m) => m.id));

  for (const market of allMarkets) {
    for (const [memberId, outcome] of marketOutcomes(rowsByMarket.get(market.id) ?? [])) {
      const s = stats.get(memberId);
      if (!s) continue;

      if (market.status === "open") {
        s.committedC += outcome.stakeC;
        continue;
      }
      // Voided or auto-refunded: stake came back, no skill signal.
      if (market.status === "refunded" || outcome.refundC > 0) continue;

      const profitC = outcome.payoutC - outcome.stakeC;
      s.resolvedCount += 1;
      s.wageredC += outcome.stakeC;
      s.profitC += profitC;
      if (outcome.payoutC > 0) s.wins += 1;
      else s.losses += 1;
      s.biggestWinC = Math.max(s.biggestWinC, profitC);
      s.biggestLossC = Math.min(s.biggestLossC, profitC);
    }
  }

  const all = [...stats.values()];
  for (const s of all) {
    s.roi = s.wageredC > 0 ? s.profitC / s.wageredC : null;
    s.ranked = s.resolvedCount >= env.RANKED_MIN_RESOLVED;
  }
  const ranked = all
    .filter((s) => s.ranked)
    .sort((a, b) => (b.roi ?? 0) - (a.roi ?? 0) || b.profitC - a.profitC);
  const unranked = all
    .filter((s) => !s.ranked)
    .sort((a, b) => b.resolvedCount - a.resolvedCount || b.profitC - a.profitC);
  return { ranked, unranked };
}

// ---------- inbox ----------
// Derived, not stored: "what happened that concerns me" is computed from
// markets + ledger. Read state is a single per-member timestamp cursor.

export type InboxItem =
  | { kind: "new_market"; at: Date; unread: boolean; market: Market; actor: Member }
  | { kind: "activity"; at: Date; unread: boolean; market: Market; actor: Member; row: LedgerRow }
  | {
      kind: "resolved";
      at: Date;
      unread: boolean;
      market: Market;
      actor: Member;
      myProfitC: number | null;
    };

export async function inbox(
  memberId: string,
  limit = 50,
): Promise<{ items: InboxItem[]; unreadCount: number }> {
  const me = await getMember(memberId);
  if (!me) return { items: [], unreadCount: 0 };
  const seenAt = me.inboxSeenAt?.getTime() ?? 0;

  const memberById = await membersById();
  const allMarkets = await db.select().from(markets);
  const marketById = new Map(allMarkets.map((m) => [m.id, m]));
  const rowsByMarket = await marketLedger(allMarkets.map((m) => m.id));

  // Markets that concern me: I created them or I hold/held a stake.
  const mine = new Set<string>();
  for (const market of allMarkets) {
    if (market.creatorId === memberId) mine.add(market.id);
    else if (
      (rowsByMarket.get(market.id) ?? []).some((r) => r.memberId === memberId && r.kind === "bet")
    ) {
      mine.add(market.id);
    }
  }

  const items: InboxItem[] = [];

  for (const market of allMarkets) {
    const creator = memberById.get(market.creatorId)!;

    // Someone opened a new prediction.
    if (market.creatorId !== memberId) {
      items.push({
        kind: "new_market",
        at: market.createdAt,
        unread: market.createdAt.getTime() > seenAt,
        market,
        actor: creator,
      });
    }

    if (!mine.has(market.id)) continue;

    // Friends moving on a market I'm in (or created).
    for (const row of rowsByMarket.get(market.id) ?? []) {
      if (row.memberId === memberId) continue;
      if (row.kind !== "bet" && row.kind !== "switch") continue;
      items.push({
        kind: "activity",
        at: row.at,
        unread: row.at.getTime() > seenAt,
        market,
        actor: memberById.get(row.memberId)!,
        row,
      });
    }

    // The verdict, with my result if I had a stake.
    if (market.status !== "open" && market.resolvedAt && market.creatorId !== memberId) {
      const rows = rowsByMarket.get(market.id) ?? [];
      const pos = replay(rows).get(memberId);
      const stakeC = pos ? exposure(pos) : 0;
      let myProfitC: number | null = null;
      if (stakeC > 0) {
        let backC = 0;
        let refunded = market.status === "refunded";
        for (const row of rows) {
          if (row.memberId !== memberId) continue;
          if (row.kind === "payout") backC += row.amountC;
          if (row.kind === "refund") {
            backC += row.amountC;
            refunded = true;
          }
        }
        myProfitC = refunded ? 0 : backC - stakeC;
      }
      items.push({
        kind: "resolved",
        at: market.resolvedAt,
        unread: market.resolvedAt.getTime() > seenAt,
        market: marketById.get(market.id)!,
        actor: creator,
        myProfitC,
      });
    }
  }

  items.sort((a, b) => b.at.getTime() - a.at.getTime());
  const trimmed = items.slice(0, limit);
  return {
    items: trimmed,
    unreadCount: items.filter((i) => i.unread).length,
  };
}

export async function setLingo(memberId: string, lingo: string): Promise<void> {
  await db.update(members).set({ lingo }).where(eq(members.id, memberId));
}

export async function markInboxSeen(memberId: string): Promise<void> {
  await db.update(members).set({ inboxSeenAt: new Date() }).where(eq(members.id, memberId));
}
