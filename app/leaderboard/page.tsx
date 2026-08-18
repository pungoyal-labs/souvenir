import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { Units } from "@/components/units";
import { leaderboard, type MemberStats } from "@/lib/data";
import { env } from "@/lib/env";
import { lingoOf } from "@/lib/lingo";
import { requireMember } from "@/lib/session";
import { fmtPct } from "@/lib/units";

export default async function LeaderboardPage() {
  const me = await requireMember();
  const t = lingoOf(me.lingo);
  const { ranked, unranked } = await leaderboard();

  return (
    <div className="mx-auto max-w-3xl">
      <p className="eyebrow">Leaderboard</p>
      <h1 className="display text-4xl font-extrabold uppercase tracking-wide">
        {t.leaderboardTitle}
      </h1>
      <p className="mt-1 text-sm text-soft">{t.leaderboardSub(env.RANKED_MIN_RESOLVED)}</p>

      {ranked.length > 0 ? (
        <div className="mt-5 overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-soft">
                <th className="px-4 py-2.5">#</th>
                <th className="px-2 py-2.5">Predictor</th>
                <th className="px-2 py-2.5 text-right">Return</th>
                <th className="px-2 py-2.5 text-right">Profit</th>
                <th className="px-2 py-2.5 text-right">Record</th>
                <th className="px-2 py-2.5 text-right">Bet</th>
                <th className="px-4 py-2.5 text-right">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {ranked.map((s, i) => (
                <Row key={s.member.id} s={s} rank={i + 1} isMe={s.member.id === me.id} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-5 rounded-lg border border-dashed border-line bg-surface p-8 text-center">
          <p className="display text-2xl font-bold uppercase tracking-wide">
            {t.leaderboardEmptyTitle}
          </p>
          <p className="mt-1 text-sm text-soft">
            Nobody has {env.RANKED_MIN_RESOLVED} resolved predictions yet. Reputations are made
            early — get betting.
          </p>
        </div>
      )}

      {unranked.length > 0 && (
        <section className="mt-8">
          <h2 className="display text-xl font-bold uppercase tracking-wide text-soft">
            Calibrating
          </h2>
          <p className="text-xs text-soft">{t.calibratingSub}</p>
          <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-surface">
            {unranked.map((s) => (
              <li key={s.member.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <Avatar name={s.member.name} image={s.member.image} size={26} />
                <Link href={`/member/${s.member.id}`} className="font-semibold hover:underline">
                  {s.member.name}
                  {s.member.id === me.id && <span className="text-soft"> (you)</span>}
                </Link>
                <span className="ml-auto text-xs text-soft">
                  {s.resolvedCount}/{env.RANKED_MIN_RESOLVED} resolved
                </span>
                <span className="mono w-20 text-right font-semibold">
                  <Units c={s.netC} sign />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Row({ s, rank, isMe }: { s: MemberStats; rank: number; isMe: boolean }) {
  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : rank;
  return (
    <tr className={isMe ? "bg-felt-tint/50" : undefined}>
      <td className="display px-4 py-2.5 text-lg font-bold">{medal}</td>
      <td className="px-2 py-2.5">
        <Link
          href={`/member/${s.member.id}`}
          className="flex items-center gap-2 font-semibold hover:underline"
        >
          <Avatar name={s.member.name} image={s.member.image} size={26} />
          {s.member.name}
          {isMe && <span className="font-normal text-soft">(you)</span>}
        </Link>
      </td>
      <td
        className={`mono px-2 py-2.5 text-right text-base font-bold ${
          (s.roi ?? 0) > 0 ? "text-felt" : (s.roi ?? 0) < 0 ? "text-no-deep" : ""
        }`}
      >
        {s.roi === null ? "—" : fmtPct(s.roi)}
      </td>
      <td className="mono px-2 py-2.5 text-right">
        <Units c={s.profitC} sign />
      </td>
      <td className="mono px-2 py-2.5 text-right">
        {s.wins}–{s.losses}
      </td>
      <td className="mono px-2 py-2.5 text-right">
        <Units c={s.wageredC} />
      </td>
      <td className="mono px-4 py-2.5 text-right font-semibold">
        <Units c={s.netC} sign />
      </td>
    </tr>
  );
}
