import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { SideChip } from "@/components/side-chip";
import { Units } from "@/components/units";
import {
  getMember,
  listMarkets,
  memberLedger,
  memberResults,
  netOf,
  summarizeResults,
} from "@/lib/data";
import { fmtDate, timeAgo } from "@/lib/format";
import { requireMember } from "@/lib/session";
import { fmtPct, fmtUnits } from "@/lib/units";

export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireMember();
  const { id } = await params;
  const member = await getMember(id);
  if (!member) notFound();
  const isMe = member.id === me.id;

  const [netC, results, ledgerItems, { open }] = await Promise.all([
    netOf(member.id),
    memberResults(member.id),
    memberLedger(member.id),
    listMarkets(member.id),
  ]);
  const stats = summarizeResults(results);
  const openPositions = open.filter((v) => v.myStakeC > 0);

  // Running balance, derived purely from the append-only ledger.
  const ascending = [...ledgerItems].reverse();
  let running = 0;
  const withBalance = ascending.map((item) => {
    running += item.row.balanceDeltaC;
    return { item, afterC: running };
  });
  withBalance.reverse();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center gap-4">
        <Avatar name={member.name} image={member.image} size={56} />
        <div>
          <h1 className="display text-4xl font-extrabold">{member.name}</h1>
          <p className="text-sm text-soft">
            In the game since {fmtDate(member.joinedAt)}
            {isMe && " · this is you"}
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5 sm:gap-3">
        <Stat label="Net units" value={<Units c={netC} sign />} />
        <Stat
          label="Lifetime P/L"
          value={<Units c={stats.profitC} sign />}
          tone={stats.profitC > 0 ? "up" : stats.profitC < 0 ? "down" : undefined}
        />
        <Stat label="Return" value={stats.roi == null ? "—" : fmtPct(stats.roi)} />
        <Stat label="Record" value={`${stats.wins}–${stats.losses}`} />
        <Stat
          label="Best / worst"
          value={
            stats.resolvedCount > 0
              ? `${fmtUnits(stats.biggestWinC, { sign: true })} / ${fmtUnits(stats.biggestLossC, { sign: true })}`
              : "—"
          }
        />
      </div>

      {openPositions.length > 0 && (
        <section className="mt-7">
          <h2 className="display text-xl font-bold uppercase tracking-wide text-soft">
            Open bets — <Units c={openPositions.reduce((s, v) => s + v.myStakeC, 0)} />
          </h2>
          <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-surface">
            {openPositions.map((v) => (
              <li key={v.market.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <Link
                  href={`/market/${v.market.id}`}
                  className="min-w-0 flex-1 font-semibold hover:underline"
                >
                  {v.market.question}
                </Link>
                <span className="mono font-bold">
                  <Units c={v.myStakeC} />
                </span>
                <SideChip side={v.mySide!} small />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-7">
        <h2 className="display text-xl font-bold uppercase tracking-wide text-soft">
          Resolved predictions
        </h2>
        {results.length === 0 ? (
          <p className="mt-2 text-sm text-soft">Nothing resolved yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-surface">
            {results.map((r) => (
              <li key={r.market.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <Link
                  href={`/market/${r.market.id}`}
                  className="min-w-0 flex-1 font-semibold hover:underline"
                >
                  {r.market.question}
                </Link>
                <span className="hidden items-center gap-1.5 text-xs text-soft sm:flex">
                  <Units c={r.stakeC} /> on <SideChip side={r.side} small />
                </span>
                <span
                  className={`mono w-20 text-right font-bold ${
                    r.noContest
                      ? "text-soft"
                      : r.profitC > 0
                        ? "text-felt"
                        : r.profitC < 0
                          ? "text-no-deep"
                          : "text-soft"
                  }`}
                >
                  {r.noContest ? "void" : <Units c={r.profitC} sign />}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-7">
        <h2 className="display text-xl font-bold uppercase tracking-wide text-soft">
          The full ledger
        </h2>
        <p className="text-xs text-soft">
          Every unit movement, newest first. The balance column is derived by replaying the whole
          history — nothing is ever overwritten.
        </p>
        <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-soft">
                <th className="px-4 py-2">When</th>
                <th className="px-2 py-2">What</th>
                <th className="px-2 py-2 text-right">Δ units</th>
                <th className="px-4 py-2 text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {withBalance.map(({ item, afterC }) => (
                <tr key={item.row.id}>
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-soft">
                    {timeAgo(item.row.at)}
                  </td>
                  <td className="px-2 py-2">
                    {describe(item.row.kind, item.row.side)}
                    {item.market && (
                      <>
                        {" — "}
                        <Link
                          href={`/market/${item.market.id}`}
                          className="text-felt hover:underline"
                        >
                          {item.market.question}
                        </Link>
                      </>
                    )}
                    {item.row.note && !item.market && (
                      <span className="text-soft"> {item.row.note}</span>
                    )}
                  </td>
                  <td
                    className={`mono px-2 py-2 text-right ${
                      item.row.balanceDeltaC > 0
                        ? "text-felt"
                        : item.row.balanceDeltaC < 0
                          ? "text-no-deep"
                          : "text-soft"
                    }`}
                  >
                    {item.row.balanceDeltaC === 0
                      ? "·"
                      : `${fmtUnits(item.row.balanceDeltaC, { sign: true })}`}
                  </td>
                  <td className="mono px-4 py-2 text-right font-semibold">{fmtUnits(afterC)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function describe(kind: string, side: string | null): string {
  switch (kind) {
    case "grant":
      return "Joined the game";
    case "bet":
      return `Backed ${side?.toUpperCase()}`;
    case "switch":
      return `Switched to ${side?.toUpperCase()}`;
    case "payout":
      return "Won";
    case "refund":
      return "Refunded";
    default:
      return kind;
  }
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "up" | "down";
}) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-soft">{label}</p>
      <p
        className={`mono mt-0.5 text-lg font-bold ${
          tone === "up" ? "text-felt" : tone === "down" ? "text-no-deep" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
