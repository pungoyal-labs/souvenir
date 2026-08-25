"use client";

import Link from "next/link";
import { useEffect } from "react";
import { fmtDate, timeAgo } from "@/lib/format";
import { toCents } from "@/lib/pies";
import { routes } from "@/lib/routes";
import { marketActivity, marketCard, marketComments, marketView, reactors } from "@/lib/views";
import { ActivityFeed } from "./activity";
import { Avatar } from "./avatar";
import { BetPanel } from "./bet-panel";
import { CommentsSection } from "./comments";
import { Pies } from "./pies";
import { PoolBar } from "./pool-bar";
import { ReactionBar } from "./reaction-bar";
import { ReopenPanel } from "./reopen-panel";
import { ResolvePanel } from "./resolve-panel";
import { markMarketSeen } from "./seen";
import { ShareCard } from "./share-card";
import { SideChip, StatusChip } from "./side-chip";
import { useOpenTrip } from "./trip-store";

const heading = "display text-lg font-bold uppercase tracking-wide text-soft";

export function MarketPage({
  marketId,
  maxStakePies,
  published,
}: {
  marketId: string;
  maxStakePies: number;
  /** Whether a card is up for it — the one thing about a prediction the server knows. */
  published: boolean;
}) {
  const { tripId, me, lingo, t, people, state, append } = useOpenTrip();
  const m = state.markets.get(marketId);

  // Noted on this phone in an effect, so a link prefetch never counts.
  const opened = !!m;
  useEffect(() => {
    if (opened) markMarketSeen(tripId, marketId);
  }, [opened, tripId, marketId]);

  if (!m) {
    return (
      <div className="mx-auto max-w-3xl">
        <Link href={routes.trip(tripId)} className="text-sm text-soft hover:text-ink">
          ← All predictions
        </Link>
        <p className="mt-6 text-sm text-soft">No such prediction on this trip.</p>
      </div>
    );
  }

  const view = marketView(state, tripId, people, m, me.id);
  const { market, creator } = view;
  const { activity, settlements } = marketActivity(state, tripId, people, marketId);
  const isOpen = market.status === "open";
  const totalPoolC = view.yesPoolC + view.noPoolC;
  const pulse = [
    view.participants.length > 0 &&
      `${view.participants.length} backer${view.participants.length === 1 ? "" : "s"}`,
    activity.length > 0 && `${activity.length} call${activity.length === 1 ? "" : "s"}`,
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={routes.trip(tripId)} className="text-sm text-soft hover:text-ink">
        ← All predictions
      </Link>

      <div className="mt-3 flex items-center justify-between gap-3">
        <StatusChip status={market.status} />
        <span className="text-sm text-soft">
          by {creator.name} · {timeAgo(market.createdAt)}
        </span>
      </div>

      <h1 className="display mt-2 break-words text-4xl font-extrabold leading-tight">
        {market.question}
      </h1>

      <ReactionBar
        marketId={market.id}
        meId={me.id}
        upvoters={reactors(state, people, marketId, "upvote")}
        watchers={reactors(state, people, marketId, "watch")}
        open={isOpen}
      />

      <div className="mt-3 card p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-soft">Resolves how</p>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm">{market.criteria}</p>
      </div>

      {!isOpen && (
        <div className="mt-4 rounded-lg border border-gold/40 bg-surface p-4">
          <p className="display text-lg font-bold uppercase tracking-wide">
            {market.status === "yes" || market.status === "no" ? (
              <span className="flex items-center gap-2">
                Resolved <SideChip side={market.status} />
              </span>
            ) : (
              "Voided — all pies returned"
            )}
          </p>
          <p className="mt-1 text-xs text-soft">
            by {creator.name}
            {market.resolvedAt && <> on {fmtDate(market.resolvedAt)}</>}
          </p>
          {market.resolutionNote && (
            <p className="mt-2 whitespace-pre-wrap break-words text-sm">{market.resolutionNote}</p>
          )}
          {settlements.length > 0 && (
            <div className="mt-3 border-t border-line pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-soft">
                Where the <Pies c={totalPoolC} /> pool went
              </p>
              <ul className="mt-2 space-y-1.5">
                {settlements.map((s) => (
                  <li key={s.row.id} className="flex items-center gap-2 text-sm">
                    <Avatar member={s.member} size={20} />
                    <span className="font-semibold">{s.member.name}</span>
                    <span className="text-soft">
                      {s.row.kind === "payout" ? "collected" : "refunded"}
                    </span>
                    <span className="mono ml-auto font-bold">
                      <Pies c={s.row.amountC} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <ShareCard
            card={marketCard(state, tripId, people, marketId)}
            marketId={marketId}
            published={published}
          />
          {state.organiserIds.has(me.id) && <ReopenPanel marketId={market.id} />}
        </div>
      )}

      <div className="mt-5">
        <PoolBar yesPoolC={view.yesPoolC} noPoolC={view.noPoolC} lingo={lingo} />
        {totalPoolC > 0 && (
          <p className="mono mt-1 text-center text-xs text-soft">
            <Pies c={totalPoolC} /> in the pool
          </p>
        )}
        {pulse.length > 0 && (
          <p className="mt-1 text-center text-xs text-soft">{pulse.join(" · ")}</p>
        )}
      </div>

      <section className="mt-5">
        <h2 className={heading}>Calls</h2>
        {view.participants.length === 0 ? (
          <p className="mt-2 text-sm text-soft">{t.betsEmpty}</p>
        ) : (
          <ul className="mt-2 card list">
            {view.participants.map((p) => (
              <li key={p.member.id} className="flex items-center gap-3 px-4 py-2.5">
                <Avatar member={p.member} size={28} />
                <Link
                  href={routes.member(tripId, p.member.id)}
                  className="min-w-0 truncate font-semibold hover:underline"
                >
                  {p.member.name}
                  {p.member.id === me.id && <span className="text-soft"> (you)</span>}
                </Link>
                <span className="ml-auto flex shrink-0 items-center gap-2">
                  <span className="mono font-bold">
                    <Pies c={p.stakeC} />
                  </span>
                  <SideChip side={p.side} small />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isOpen && (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <BetPanel
            marketId={market.id}
            mySide={view.mySide}
            myStakeC={view.myStakeC}
            maxStakeC={toCents(maxStakePies)}
          />
          {market.creatorId === me.id && <ResolvePanel marketId={market.id} />}
        </div>
      )}

      <section className="mt-7">
        <h2 className={heading}>{t.commentsHeading}</h2>
        <div className="mt-3 card p-4">
          <CommentsSection
            comments={marketComments(state, people, marketId)}
            members={[...people.values()]}
            meId={me.id}
            lingo={lingo}
            onPost={(body, mentions) =>
              append({ t: "comment", id: crypto.randomUUID(), marketId, body, mentions })
            }
          />
        </div>
      </section>

      <section className="mt-7">
        <h2 className={heading}>{t.activitySoFarHeading}</h2>
        <div className="mt-3">
          <ActivityFeed items={activity} lingo={lingo} />
        </div>
      </section>
    </div>
  );
}
