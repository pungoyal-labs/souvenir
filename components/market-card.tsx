import Link from "next/link";
import type { MarketView } from "@/lib/data";
import { timeAgo } from "@/lib/format";
import { lingoOf } from "@/lib/lingo";
import { fmtUnits, UNIT } from "@/lib/units";
import { Avatar } from "./avatar";
import { PoolBar } from "./pool-bar";
import { SideChip, StatusChip } from "./side-chip";
import { Units } from "./units";

export function MarketCard({
  view,
  myProfitC,
  lingo = "english",
}: {
  view: MarketView;
  /** For resolved predictions: the viewer's net result, if they took part. */
  myProfitC?: number;
  lingo?: string;
}) {
  const t = lingoOf(lingo);
  const { market, creator, participants } = view;
  const yesBackers = participants.filter((p) => p.side === "yes");
  const noBackers = participants.filter((p) => p.side === "no");

  return (
    <Link
      href={`/market/${market.id}`}
      className="block rounded-lg border border-line bg-surface p-4 shadow-[0_1px_0_rgba(33,38,31,0.06)] transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_8px_18px_-10px_rgba(20,48,36,0.4)]"
    >
      <div className="flex items-center justify-between gap-2">
        <StatusChip status={market.status} />
        <span className="text-xs text-soft">
          by {creator.name} · {timeAgo(market.createdAt)}
        </span>
      </div>

      <h3 className="display mt-2 text-2xl font-bold leading-tight">{market.question}</h3>

      <div className="mt-3">
        <PoolBar yesPoolC={view.yesPoolC} noPoolC={view.noPoolC} lingo={lingo} />
      </div>

      {participants.length > 0 && (
        <div className="mt-2 flex items-center justify-between">
          <div className="flex -space-x-1.5">
            {yesBackers.map((p) => (
              <span
                key={p.member.id}
                className="rounded-full ring-2 ring-yes-tint"
                title={`${p.member.name}: ${fmtUnits(p.stakeC)}${UNIT} on YES`}
              >
                <Avatar name={p.member.name} image={p.member.image} size={22} />
              </span>
            ))}
          </div>
          <div className="flex -space-x-1.5">
            {noBackers.map((p) => (
              <span
                key={p.member.id}
                className="rounded-full ring-2 ring-no-tint"
                title={`${p.member.name}: ${fmtUnits(p.stakeC)}${UNIT} on NO`}
              >
                <Avatar name={p.member.name} image={p.member.image} size={22} />
              </span>
            ))}
          </div>
        </div>
      )}

      {view.mySide && market.status === "open" && (
        <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold">
          You:{" "}
          <span className="mono">
            <Units c={view.myStakeC} />
          </span>{" "}
          on <SideChip side={view.mySide} small />
        </p>
      )}
      {market.status !== "open" && myProfitC !== undefined && (
        <p
          className={`mono mt-2 text-sm font-bold ${
            myProfitC > 0 ? "text-felt" : myProfitC < 0 ? "text-no-deep" : "text-soft"
          }`}
        >
          {myProfitC === 0
            ? t.brokeEven
            : (myProfitC > 0 ? t.youWon : t.youLost)(`${fmtUnits(Math.abs(myProfitC))}${UNIT}`)}
        </p>
      )}
    </Link>
  );
}
