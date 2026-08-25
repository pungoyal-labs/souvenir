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

      {/* A phone gets rank, predictor, return and net; profit, record and
          what was put up fold into a line under the name. Fixed layout, with
          every phone column given its share: hidden cells still count as
          columns when leftover width is split, and would starve the name. */}
      <div className="mt-3 card">
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-soft">
              <th className="w-[12%] px-3 py-2.5 sm:w-16 sm:px-4">#</th>
              <th className="w-[42%] px-2 py-2.5 sm:w-auto">Predictor</th>
              <th className="w-[20%] px-2 py-2.5 text-right sm:w-20">Return</th>
              <th className="hidden w-20 px-2 py-2.5 text-right sm:table-cell">Profit</th>
              <th className="hidden w-20 px-2 py-2.5 text-right sm:table-cell">Record</th>
              <th className="hidden w-20 px-2 py-2.5 text-right sm:table-cell">Put up</th>
              <th className="w-[26%] px-3 py-2.5 text-right sm:w-28 sm:px-4">Net</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {ranked.map((s, i) => rowOf(s, i + 1))}
            {unranked.length > 0 && (
              <tr className="bg-felt-tint/40">
                <td
                  colSpan={7}
                  className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-soft sm:px-4"
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
      <td className="px-3 py-2.5 sm:px-4">
        {rank === null ? (
          <span className="mono text-[11px] text-soft">
            {s.resolvedCount}/{minResolved}
          </span>
        ) : (
          <span className="display text-lg font-bold">{medal(rank)}</span>
        )}
      </td>
      <td className="min-w-0 px-2 py-2.5">
        <div className="flex items-center gap-2">
          <Avatar member={s.member} size={30} />
          <div className="min-w-0">
            <Link
              href={routes.member(tripId, s.member.id)}
              className="block truncate font-semibold hover:underline"
            >
              {s.member.name}
              {isMe && <span className="font-normal text-soft"> (you)</span>}
            </Link>
            <p className="mono truncate text-[11px] text-soft sm:hidden">
              {s.wins}–{s.losses} · <Pies c={s.profitC} sign /> on <Pies c={s.wageredC} />
            </p>
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
      <td className="mono hidden px-2 py-2.5 text-right sm:table-cell">
        <Pies c={s.profitC} sign />
      </td>
      <td className="mono hidden px-2 py-2.5 text-right sm:table-cell">
        {s.wins}–{s.losses}
      </td>
      <td className="mono hidden px-2 py-2.5 text-right sm:table-cell">
        <Pies c={s.wageredC} />
      </td>
      <td className="px-3 py-2.5 text-right sm:px-4">
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
