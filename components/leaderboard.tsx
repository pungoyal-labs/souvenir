"use client";

import Link from "next/link";
import { Fragment } from "react";
import { fmtDate } from "@/lib/format";
import { fmtPct } from "@/lib/pies";
import { routes } from "@/lib/routes";
import { type Currency, fmtMoney } from "@/lib/split";
import { billsOverview, leaderboard, type MemberStats } from "@/lib/views";
import { Avatar } from "./avatar";
import { Pies } from "./pies";
import { KeyStatus } from "./sealed";
import { useOpenTrip } from "./trip-store";
import { tone } from "./ui";

type Money = { currency: Currency; netC: number };

export const medal = (rank: number) => ["🥇", "🥈", "🥉"][rank - 1] ?? rank;

/**
 * The table: one ranked list, calibrating members under a divider row. Its
 * only stats source is `leaderboard`; passkeys are the server's, as a prop.
 */
export function Leaderboard({
  minResolved,
  passkeys,
}: {
  minResolved: number;
  passkeys: string[];
}) {
  const { tripId, me, t, roster, people, state, unreadable } = useOpenTrip();
  const { ranked, unranked } = leaderboard(state, roster, minResolved);
  // Outstanding split-bill money per member — only members who aren't square.
  const moneyByMember = new Map<string, Money[]>();
  for (const b of billsOverview(state, people).balances) {
    for (const { member, netC } of b.nets) {
      moneyByMember.set(member.id, [
        ...(moneyByMember.get(member.id) ?? []),
        { currency: b.currency, netC },
      ]);
    }
  }
  const held = new Set(passkeys);
  const enrolled = roster.filter((m) => held.has(m.id)).length;
  const rowOf = (s: MemberStats, rank: number | null) => (
    <Row
      key={s.member.id}
      s={s}
      rank={rank}
      isMe={s.member.id === me.id}
      hasPasskey={held.has(s.member.id)}
      money={moneyByMember.get(s.member.id)}
      tripId={tripId}
      minResolved={minResolved}
    />
  );

  return (
    <>
      <h2 className="display mt-6 text-xl font-bold uppercase tracking-wide">
        {t.leaderboardTitle}
      </h2>
      <p className="text-xs text-soft">{t.leaderboardSub(minResolved)}</p>
      {ranked.length === 0 && (
        <p className="mt-1 text-xs text-soft">
          {t.leaderboardEmptyTitle} Nobody has {minResolved} resolved predictions yet — reputations
          are made early.
        </p>
      )}

      <div className="mt-3 overflow-x-auto card">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-soft">
              <th className="px-4 py-2.5">#</th>
              <th className="px-2 py-2.5">Predictor</th>
              <th className="px-2 py-2.5 text-right">Return</th>
              <th className="px-2 py-2.5 text-right">Profit</th>
              <th className="px-2 py-2.5 text-right">Record</th>
              <th className="px-2 py-2.5 text-right">Put up</th>
              <th className="px-4 py-2.5 text-right">Net</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {ranked.map((s, i) => rowOf(s, i + 1))}
            {unranked.length > 0 && (
              <tr className="bg-felt-tint/40">
                <td
                  colSpan={7}
                  className="px-4 py-1.5 text-[11px] uppercase tracking-wider text-soft"
                >
                  Calibrating — {t.calibratingSub}
                </td>
              </tr>
            )}
            {unranked.map((s) => rowOf(s, null))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-xs text-soft">
        {enrolled} of {roster.length} on this trip have added a passkey.
        {unreadable > 0 &&
          ` ${unreadable} event${unreadable === 1 ? "" : "s"} on this trip would not open on this phone.`}
      </p>
    </>
  );
}

/** `rank` is null below the line, where the cell shows progress towards being ranked instead. */
function Row({
  s,
  rank,
  isMe,
  hasPasskey,
  money,
  tripId,
  minResolved,
}: {
  s: MemberStats;
  rank: number | null;
  isMe: boolean;
  hasPasskey: boolean;
  money: Money[] | undefined;
  tripId: string;
  minResolved: number;
}) {
  return (
    <tr className={isMe ? "bg-felt-tint/50" : undefined}>
      <td className="px-4 py-2.5">
        {rank === null ? (
          <span className="mono text-[11px] text-soft">
            {s.resolvedCount}/{minResolved}
          </span>
        ) : (
          <span className="display text-lg font-bold">{medal(rank)}</span>
        )}
      </td>
      <td className="px-2 py-2.5">
        <div className="flex items-center gap-2">
          <Avatar member={s.member} size={30} />
          <div className="min-w-0">
            <Link
              href={routes.member(tripId, s.member.id)}
              className="font-semibold hover:underline"
            >
              {s.member.name}
              {isMe && <span className="font-normal text-soft"> (you)</span>}
            </Link>
            <p className="truncate text-[11px] text-soft">
              joined {fmtDate(s.member.joinedAt)} ·{" "}
              {hasPasskey ? (
                <span className="font-semibold text-felt">passkey ✓</span>
              ) : (
                "no passkey yet"
              )}
              {s.role === "organiser" && <span className="text-gold"> · organiser</span>}
            </p>
            <KeyStatus memberId={s.member.id} name={s.member.name} />
          </div>
        </div>
      </td>
      <td
        className={`mono px-2 py-2.5 text-right text-base font-bold ${
          (s.roi ?? 0) > 0 ? "text-felt" : (s.roi ?? 0) < 0 ? "text-no-deep" : ""
        }`}
      >
        {s.roi === null ? "—" : fmtPct(s.roi)}
      </td>
      <td className="mono px-2 py-2.5 text-right">
        <Pies c={s.profitC} sign />
      </td>
      <td className="mono px-2 py-2.5 text-right">
        {s.wins}–{s.losses}
      </td>
      <td className="mono px-2 py-2.5 text-right">
        <Pies c={s.wageredC} />
      </td>
      <td className="px-4 py-2.5 text-right">
        <span className="mono font-semibold">
          <Pies c={s.netC} sign />
        </span>
        {money && (
          <Link
            href={routes.bills(tripId)}
            title="Outstanding split-bill money"
            className="mono block text-[11px] hover:underline"
          >
            {money.map((x, j) => (
              <Fragment key={x.currency}>
                {j > 0 && <span className="text-soft"> · </span>}
                <span className={tone(x.netC)}>{fmtMoney(x.currency, x.netC, { sign: true })}</span>
              </Fragment>
            ))}
          </Link>
        )}
      </td>
    </tr>
  );
}
