import Link from "next/link";
import { timeAgo } from "@/lib/format";
import { lingoOf } from "@/lib/lingo";
import { piesText } from "@/lib/pies";
import { routes } from "@/lib/routes";
import type { ActivityItem } from "@/lib/views";
import { Avatar } from "./avatar";

function phrase(item: ActivityItem): string {
  const amount = piesText(item.row.amountC);
  switch (item.row.kind) {
    case "bet":
      return `put ${amount} on ${item.row.side?.toUpperCase()}`;
    case "switch":
      return `switched ${amount} to ${item.row.side?.toUpperCase()}`;
    case "payout":
      return `collected ${amount}`;
    case "refund":
      return `was refunded ${amount}`;
    case "reversal":
      return `handed ${amount} back when the call reopened`;
  }
}

export function ActivityFeed({
  items,
  tripId,
  showMarket,
  lingo = "english",
}: {
  items: ActivityItem[];
  tripId: string;
  showMarket?: boolean;
  lingo?: string;
}) {
  const t = lingoOf(lingo);
  if (items.length === 0) {
    return <p className="text-sm text-soft">{t.activityEmpty}</p>;
  }
  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item.row.id} className="flex items-start gap-2 text-sm">
          <Avatar member={item.member} size={22} />
          <span className="min-w-0">
            <span className="font-semibold">{item.member.name}</span> {phrase(item)}
            {showMarket && item.market && (
              <>
                {" — "}
                <Link
                  href={routes.market(tripId, item.market.id)}
                  className="text-felt underline decoration-line underline-offset-2 hover:decoration-felt"
                >
                  {item.market.question}
                </Link>
              </>
            )}
            <span className="ml-1.5 whitespace-nowrap text-xs text-soft">
              {timeAgo(item.row.at)}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
