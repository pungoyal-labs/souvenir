import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { type InboxItem, inbox, markInboxSeen } from "@/lib/data";
import { timeAgo } from "@/lib/format";
import { type Lingo, lingoOf } from "@/lib/lingo";
import { requireMember } from "@/lib/session";
import { fmtUnits, UNIT } from "@/lib/units";

export default async function InboxPage() {
  const me = await requireMember();
  const t = lingoOf(me.lingo);
  const { items } = await inbox(me.id);
  // Everything on screen is now seen; the unread highlights below still show
  // this one time because they were computed before the cursor moved.
  await markInboxSeen(me.id);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="display text-4xl font-extrabold uppercase tracking-wide">Inbox</h1>
      <p className="mt-1 text-sm text-soft">{t.inboxSub}</p>

      {items.length === 0 ? (
        <div className="mt-5 rounded-lg border border-dashed border-line bg-surface p-8 text-center">
          <p className="display text-2xl font-bold uppercase tracking-wide">{t.inboxEmptyTitle}</p>
          <p className="mt-1 text-sm text-soft">{t.inboxEmptySub}</p>
        </div>
      ) : (
        <ul className="mt-5 divide-y divide-line rounded-lg border border-line bg-surface">
          {items.map((item) => (
            <Item key={itemKey(item)} item={item} t={t} />
          ))}
        </ul>
      )}
    </div>
  );
}

function itemKey(item: InboxItem): string {
  return item.kind === "activity" ? `a-${item.row.id}` : `${item.kind}-${item.market.id}`;
}

function Item({ item, t }: { item: InboxItem; t: Lingo }) {
  return (
    <li className={item.unread ? "bg-felt-tint/40" : undefined}>
      <Link
        href={`/market/${item.market.id}`}
        className="flex items-start gap-3 px-4 py-3 hover:bg-paper/60"
      >
        <span className="mt-0.5">
          <Avatar name={item.actor.name} image={item.actor.image} size={26} />
        </span>
        <span className="min-w-0 flex-1 text-sm">
          <Line item={item} t={t} />
          <span className="mt-0.5 block truncate text-xs text-soft">{item.market.question}</span>
        </span>
        <span className="flex items-center gap-2 whitespace-nowrap text-xs text-soft">
          {item.unread && <span className="h-2 w-2 rounded-full bg-felt" title="Unread" />}
          {timeAgo(item.at)}
        </span>
      </Link>
    </li>
  );
}

function Line({ item, t }: { item: InboxItem; t: Lingo }) {
  const name = <span className="font-semibold">{item.actor.name}</span>;
  switch (item.kind) {
    case "new_market":
      return <>{name} opened a new prediction</>;
    case "activity":
      return (
        <>
          {name}{" "}
          {item.row.kind === "switch"
            ? `switched to ${item.row.side?.toUpperCase()}`
            : `put ${fmtUnits(item.row.amountC)}${UNIT} on ${item.row.side?.toUpperCase()}`}
        </>
      );
    case "resolved":
      return (
        <>
          {name}{" "}
          {item.market.status === "refunded"
            ? "voided it"
            : `resolved it ${item.market.status.toUpperCase()}`}
          {item.myProfitC !== null && (
            <span
              className={`mono ml-1.5 font-bold ${
                item.myProfitC > 0 ? "text-felt" : item.myProfitC < 0 ? "text-no-deep" : "text-soft"
              }`}
            >
              {item.myProfitC === 0
                ? "(bet returned)"
                : `(${(item.myProfitC > 0 ? t.youWon : t.youLost)(
                    `${fmtUnits(Math.abs(item.myProfitC))}${UNIT}`,
                  )})`}
            </span>
          )}
        </>
      );
  }
}
