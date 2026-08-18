import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { type InboxItem, inbox, markInboxSeen } from "@/lib/data";
import { timeAgo } from "@/lib/format";
import { requireMember } from "@/lib/session";
import { fmtUnits } from "@/lib/units";

export default async function InboxPage() {
  const me = await requireMember();
  const { items } = await inbox(me.id);
  // Everything on screen is now seen; the unread highlights below still show
  // this one time because they were computed before the cursor moved.
  await markInboxSeen(me.id);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="display text-4xl font-extrabold uppercase tracking-wide">Inbox</h1>
      <p className="mt-1 text-sm text-soft">
        New predictions, moves on your markets, and verdicts on your calls.
      </p>

      {items.length === 0 ? (
        <div className="mt-5 rounded-lg border border-dashed border-line bg-surface p-8 text-center">
          <p className="display text-2xl font-bold">All quiet.</p>
          <p className="mt-1 text-sm text-soft">
            When friends open markets or move against you, it shows up here.
          </p>
        </div>
      ) : (
        <ul className="mt-5 divide-y divide-line rounded-lg border border-line bg-surface">
          {items.map((item) => (
            <Item key={itemKey(item)} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

function itemKey(item: InboxItem): string {
  return item.kind === "activity" ? `a-${item.row.id}` : `${item.kind}-${item.market.id}`;
}

function Item({ item }: { item: InboxItem }) {
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
          <Line item={item} />
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

function Line({ item }: { item: InboxItem }) {
  const name = <span className="font-semibold">{item.actor.name}</span>;
  switch (item.kind) {
    case "new_market":
      return <>{name} opened a new market</>;
    case "activity":
      return (
        <>
          {name}{" "}
          {item.row.kind === "switch"
            ? `switched to ${item.row.side?.toUpperCase()}`
            : `put ${fmtUnits(item.row.amountC)}u on ${item.row.side?.toUpperCase()}`}
        </>
      );
    case "resolved":
      return (
        <>
          {name}{" "}
          {item.market.status === "refunded"
            ? "voided the market"
            : `resolved it ${item.market.status.toUpperCase()}`}
          {item.myProfitC !== null && (
            <span
              className={`mono ml-1.5 font-bold ${
                item.myProfitC > 0 ? "text-felt" : item.myProfitC < 0 ? "text-no-deep" : "text-soft"
              }`}
            >
              {item.myProfitC === 0
                ? "(stake returned)"
                : `(you ${item.myProfitC > 0 ? "won" : "lost"} ${fmtUnits(Math.abs(item.myProfitC))}u)`}
            </span>
          )}
        </>
      );
  }
}
