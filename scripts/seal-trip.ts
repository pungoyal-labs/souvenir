// Seal a trip that predates private trips: its plaintext predictions, calls,
// verdicts, talk, reactions, views and bills become events under a fresh key,
// and one key link per member is printed to hand out by hand.
// Run with: pnpm private:migrate "<trip name or id>"
//
// The one time an operator sees a trip's content — what the plaintext tables
// already show them, and never again after. The key is made, used, put into
// links and dropped here; nothing about it reaches a column the server reads.
// The replay must match the ledger and the bill entries before anything is
// committed. The plaintext rows stay until Phase 4 drops the tables.

import { and, asc, eq, inArray, isNotNull, or } from "drizzle-orm";
import { db } from "../lib/db/index.ts";
import {
  billEntries,
  billRevisions,
  bills,
  commentMentions,
  comments,
  events,
  ledger,
  marketReactions,
  markets,
  marketViews,
  members,
  memberships,
  trips,
} from "../lib/db/schema.ts";
import type { OpenEvent } from "../lib/events.ts";
import { netByMember, replayTrip } from "../lib/replay.ts";
import { type BillEntryInput, type Currency, nets } from "../lib/split.ts";
import { tripCurrencies } from "../lib/trips.ts";
import { billsOverview } from "../lib/views.ts";
import { type Draft, printKeyLinks, sealedRow, tripKey } from "./sealed-log.ts";

type Side = "yes" | "no";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

// `inArray` needs at least one value.
function whenAny<T>(ids: readonly unknown[], query: () => Promise<T[]>): Promise<T[]> {
  return ids.length ? query() : Promise.resolve([]);
}

function groupBy<T, K>(list: readonly T[], key: (x: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const x of list) {
    const k = key(x);
    out.set(k, [...(out.get(k) ?? []), x]);
  }
  return out;
}

const isSettlement = (r: { kind: string }) => r.kind === "payout" || r.kind === "refund";

async function main() {
  const wanted = process.argv[2];
  if (!wanted) {
    console.error('usage: pnpm private:migrate "<trip name or id>"');
    process.exit(2);
  }
  const all = await db.select().from(trips);
  const trip = all.find((t) => t.id === wanted) ?? all.find((t) => t.name === wanted);
  if (!trip) fail(`no trip named "${wanted}"`);
  if (trip.keyEpoch !== null) fail(`${trip.name} is already sealed (epoch ${trip.keyEpoch})`);

  const tripMarkets = await db
    .select()
    .from(markets)
    .where(eq(markets.tripId, trip.id))
    .orderBy(asc(markets.createdAt));
  const marketIds = tripMarkets.map((m) => m.id);
  const rows = await whenAny(marketIds, () =>
    db
      .select()
      .from(ledger)
      .where(and(eq(ledger.tripId, trip.id), isNotNull(ledger.marketId)))
      .orderBy(asc(ledger.id)),
  );
  const tripBills = await db.select().from(bills).where(eq(bills.tripId, trip.id));
  const billIds = tripBills.map((b) => b.id);
  const revisions = await whenAny(billIds, () =>
    db
      .select()
      .from(billRevisions)
      .where(inArray(billRevisions.billId, billIds))
      .orderBy(asc(billRevisions.id)),
  );
  const entries = await whenAny(revisions, () =>
    db
      .select()
      .from(billEntries)
      .where(
        inArray(
          billEntries.revisionId,
          revisions.map((r) => r.id),
        ),
      )
      .orderBy(asc(billEntries.id)),
  );
  const talk = await whenAny([...marketIds, ...billIds], () =>
    db
      .select()
      .from(comments)
      .where(
        or(
          marketIds.length ? inArray(comments.marketId, marketIds) : undefined,
          billIds.length ? inArray(comments.billId, billIds) : undefined,
        ),
      )
      .orderBy(asc(comments.id)),
  );
  const mentions = await whenAny(talk, () =>
    db
      .select()
      .from(commentMentions)
      .where(
        inArray(
          commentMentions.commentId,
          talk.map((c) => c.id),
        ),
      ),
  );
  const reactions = await whenAny(marketIds, () =>
    db.select().from(marketReactions).where(inArray(marketReactions.marketId, marketIds)),
  );
  const views = await whenAny(marketIds, () =>
    db.select().from(marketViews).where(inArray(marketViews.marketId, marketIds)),
  );
  const roster = await db
    .select({ id: memberships.memberId, name: members.name })
    .from(memberships)
    .innerJoin(members, eq(members.id, memberships.memberId))
    .where(eq(memberships.tripId, trip.id))
    .orderBy(asc(members.name));

  // --- the plaintext record as events, in the order it happened ---
  const drafts: Draft[] = [];
  for (const m of tripMarkets) {
    drafts.push({
      at: m.createdAt,
      authorId: m.creatorId,
      payload: { t: "market.create", id: m.id, question: m.question, criteria: m.criteria },
    });
  }
  // A run of payouts or refunds is one resolve, a run of reversals one reopen.
  // A resolve's outcome is read off who was paid — or, for the last, off the market.
  const byMarket = groupBy(rows, (r) => r.marketId!);
  for (const m of tripMarkets) {
    const list = byMarket.get(m.id) ?? [];
    const positions = new Map<string, Side>();
    let settlements = 0;
    for (let i = 0; i < list.length; ) {
      const r = list[i]!;
      if (r.kind === "bet" || r.kind === "switch") {
        const side = r.side as Side;
        positions.set(r.memberId, side);
        drafts.push({
          at: r.at,
          authorId: r.memberId,
          payload:
            r.kind === "bet"
              ? { t: "call", marketId: m.id, side, amountC: r.amountC }
              : { t: "switch", marketId: m.id },
        });
        i++;
      } else if (isSettlement(r)) {
        const start = i;
        while (i < list.length && isSettlement(list[i]!)) i++;
        settlements++;
        const paid = list.slice(start, i).find((x) => x.kind === "payout");
        const isLast = !list.slice(i).some(isSettlement);
        const outcome =
          isLast && m.status !== "open"
            ? m.status
            : paid
              ? (positions.get(paid.memberId) ?? "refunded")
              : "refunded";
        drafts.push({
          at: r.at,
          authorId: m.creatorId,
          payload: {
            t: "resolve",
            marketId: m.id,
            outcome,
            note: isLast ? (m.resolutionNote ?? "") : "",
          },
        });
      } else if (r.kind === "reversal") {
        while (i < list.length && list[i]!.kind === "reversal") i++;
        drafts.push({
          at: r.at,
          authorId: trip.createdBy,
          payload: { t: "reopen", marketId: m.id },
        });
      } else {
        i++;
      }
    }
    if (settlements === 0 && m.status !== "open" && m.resolvedAt) {
      // Resolved with nobody staked: no ledger rows, but a verdict all the same.
      drafts.push({
        at: m.resolvedAt,
        authorId: m.creatorId,
        payload: { t: "resolve", marketId: m.id, outcome: m.status, note: m.resolutionNote ?? "" },
      });
    }
  }
  const mentionsOf = groupBy(mentions, (mn) => mn.commentId);
  for (const c of talk) {
    drafts.push({
      at: c.at,
      authorId: c.authorId,
      payload: {
        t: "comment",
        id: `c-${c.id}`,
        ...(c.marketId ? { marketId: c.marketId } : { billId: c.billId! }),
        body: c.body,
        mentions: (mentionsOf.get(c.id) ?? []).map((mn) => mn.memberId),
      },
    });
  }
  // Entries go in as the form input the phone would have sent: equal splits are
  // recomputed by lib/split, custom ones carry their shares; the check below proves both.
  const entriesOf = groupBy(entries, (e) => e.revisionId);
  for (const rev of revisions) {
    const inputs: BillEntryInput[] = (entriesOf.get(rev.id) ?? []).map((e) => ({
      memberId: e.memberId,
      paidC: e.paidC,
      participant: e.participant,
      ...(rev.split === "custom" && e.participant ? { owedC: e.owedC } : {}),
    }));
    drafts.push({
      at: rev.at,
      authorId: rev.editorId,
      payload: {
        t: "bill.rev",
        billId: rev.billId,
        kind: rev.kind,
        onDate: rev.onDate,
        description: rev.description,
        currency: rev.currency as Currency,
        split: rev.split,
        entries: rev.deleted ? [] : inputs,
        ...(rev.deleted ? { deleted: true } : {}),
      },
    });
  }
  for (const r of reactions) {
    drafts.push({
      at: r.at,
      authorId: r.memberId,
      payload: { t: "react", marketId: r.marketId, kind: r.kind, on: true },
    });
  }
  for (const v of views) {
    drafts.push({ at: v.at, authorId: v.memberId, payload: { t: "view", marketId: v.marketId } });
  }
  drafts.sort((a, b) => a.at.getTime() - b.at.getTime());

  // --- check the replay against the ledger and the bill entries before writing ---
  const opened: OpenEvent[] = drafts.map((d, i) => ({ id: i + 1, epoch: 0, ...d }));
  const state = replayTrip(
    {
      tripId: trip.id,
      creatorId: trip.createdBy,
      maxStakePies: trip.maxStakePies,
      currencies: tripCurrencies(trip),
    },
    opened,
  );
  const problems: string[] = [];
  const replayed = netByMember(state);
  const expected = new Map<string, number>();
  for (const r of rows) expected.set(r.memberId, (expected.get(r.memberId) ?? 0) + r.balanceDeltaC);
  for (const id of new Set([...expected.keys(), ...replayed.keys()])) {
    const a = expected.get(id) ?? 0;
    const b = replayed.get(id) ?? 0;
    if (a !== b) problems.push(`net mismatch for ${id}: ledger ${a}, replay ${b}`);
  }
  const latest = new Map(revisions.map((rev) => [rev.billId, rev]));
  const expectedNets = nets(
    [...latest.values()]
      .filter((rev) => !rev.deleted)
      .map((rev) => ({
        currency: rev.currency as Currency,
        entries: (entriesOf.get(rev.id) ?? []).map((e) => ({
          memberId: e.memberId,
          paidC: e.paidC,
          owedC: e.owedC,
        })),
      })),
  );
  const { balances } = billsOverview(state, new Map());
  for (const [currency, net] of expectedNets) {
    const got = balances.find((b) => b.currency === currency);
    for (const [memberId, netC] of net) {
      const have = got?.nets.find((n) => n.member.id === memberId)?.netC ?? 0;
      if (have !== netC) {
        problems.push(
          `bill net mismatch for ${memberId} in ${currency}: stored ${netC}, replay ${have}`,
        );
      }
    }
  }
  for (const r of state.rejected) problems.push(`replay refused event ${r.id}: ${r.reason}`);
  if (problems.length > 0) {
    for (const p of problems) console.error(p);
    fail("not sealing: the replay does not match the ledger");
  }

  // --- seal and write ---
  const { key, raw } = await tripKey();
  await db.transaction(async (tx) => {
    for (const d of drafts) await tx.insert(events).values(await sealedRow(key, trip.id, d));
    await tx.update(trips).set({ keyEpoch: 0 }).where(eq(trips.id, trip.id));
  });

  console.log(
    `sealed ${trip.name}: ${drafts.length} events, ${tripMarkets.length} predictions, ${tripBills.length} bills`,
  );
  console.log("one key link per member — hand each to its member, and only them:");
  await printKeyLinks(trip.id, raw, roster);
  process.exit(0);
}

main().catch((err) => {
  console.error("seal failed:", err);
  process.exit(1);
});
