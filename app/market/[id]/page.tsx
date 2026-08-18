import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityFeed } from "@/components/activity";
import { Avatar } from "@/components/avatar";
import { BetPanel } from "@/components/bet-panel";
import { PoolBar } from "@/components/pool-bar";
import { ResolvePanel } from "@/components/resolve-panel";
import { SideChip, StatusChip } from "@/components/side-chip";
import { getMarketView, netOf } from "@/lib/data";
import { env } from "@/lib/env";
import { fmtDate, timeAgo } from "@/lib/format";
import { requireMember } from "@/lib/session";
import { fmtUnits, toCents } from "@/lib/units";

export default async function MarketPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireMember();
  const { id } = await params;
  const data = await getMarketView(id, me.id);
  if (!data) notFound();
  const { view, activity, settlements } = data;
  const { market, creator } = view;
  const netC = await netOf(me.id);
  const isOpen = market.status === "open";
  const totalPoolC = view.yesPoolC + view.noPoolC;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/" className="text-sm text-soft hover:text-ink">
        ← All markets
      </Link>

      <div className="mt-3 flex items-center justify-between gap-3">
        <StatusChip status={market.status} />
        <span className="text-sm text-soft">
          by {creator.name} · {timeAgo(market.createdAt)}
        </span>
      </div>

      <h1 className="display mt-2 text-4xl font-extrabold leading-tight">{market.question}</h1>

      <div className="mt-3 rounded-lg border border-line bg-surface p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-soft">Resolves how</p>
        <p className="mt-1 whitespace-pre-wrap text-sm">{market.criteria}</p>
      </div>

      {!isOpen && (
        <div className="mt-4 rounded-lg border border-gold/40 bg-surface p-4">
          <p className="display text-lg font-bold uppercase tracking-wide">
            {market.status === "yes" || market.status === "no" ? (
              <span className="flex items-center gap-2">
                Resolved <SideChip side={market.status} />
              </span>
            ) : (
              "Voided — all stakes returned"
            )}
          </p>
          <p className="mt-1 text-xs text-soft">
            by {creator.name}
            {market.resolvedAt && <> on {fmtDate(market.resolvedAt)}</>}
          </p>
          {market.resolutionNote && (
            <p className="mt-2 whitespace-pre-wrap text-sm">{market.resolutionNote}</p>
          )}
          {settlements.length > 0 && (
            <div className="mt-3 border-t border-line pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-soft">
                Where the {fmtUnits(totalPoolC)}u pool went
              </p>
              <ul className="mt-2 space-y-1.5">
                {settlements.map((s) => (
                  <li key={s.row.id} className="flex items-center gap-2 text-sm">
                    <Avatar name={s.member.name} image={s.member.image} size={20} />
                    <span className="font-semibold">{s.member.name}</span>
                    <span className="text-soft">
                      {s.row.kind === "payout" ? "collected" : "refunded"}
                    </span>
                    <span className="mono ml-auto font-bold">{fmtUnits(s.row.amountC)}u</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="mt-5">
        <PoolBar yesPoolC={view.yesPoolC} noPoolC={view.noPoolC} />
        {totalPoolC > 0 && (
          <p className="mono mt-1 text-center text-xs text-soft">
            {fmtUnits(totalPoolC)}u in the pot
          </p>
        )}
      </div>

      {/* Who believes what */}
      <section className="mt-5">
        <h2 className="display text-lg font-bold uppercase tracking-wide text-soft">Positions</h2>
        {view.participants.length === 0 ? (
          <p className="mt-2 text-sm text-soft">
            Nobody has committed yet. First in sets the tone.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-line rounded-lg border border-line bg-surface">
            {view.participants.map((p) => (
              <li key={p.member.id} className="flex items-center gap-3 px-4 py-2.5">
                <Avatar name={p.member.name} image={p.member.image} size={28} />
                <Link href={`/member/${p.member.id}`} className="font-semibold hover:underline">
                  {p.member.name}
                  {p.member.id === me.id && <span className="text-soft"> (you)</span>}
                </Link>
                <span className="ml-auto flex items-center gap-2">
                  <span className="mono font-bold">{fmtUnits(p.stakeC)}u</span>
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
            maxStakeC={toCents(env.MAX_STAKE_UNITS)}
            netC={netC}
          />
          {market.creatorId === me.id && <ResolvePanel marketId={market.id} />}
        </div>
      )}

      <section className="mt-7">
        <h2 className="display text-lg font-bold uppercase tracking-wide text-soft">
          Action so far
        </h2>
        <div className="mt-3">
          <ActivityFeed items={activity} />
        </div>
      </section>
    </div>
  );
}
