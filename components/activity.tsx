import Link from "next/link";
import type { ActivityItem } from "@/lib/data";
import { timeAgo } from "@/lib/format";
import { fmtUnits, UNIT } from "@/lib/units";
import { Avatar } from "./avatar";

function phrase(item: ActivityItem): string {
  const amount = `${fmtUnits(item.row.amountC)}${UNIT}`;
  switch (item.row.kind) {
    case "bet":
      return `put ${amount} on ${item.row.side?.toUpperCase()}`;
    case "switch":
      return `switched ${amount} to ${item.row.side?.toUpperCase()}`;
    case "payout":
      return `collected ${amount}`;
    case "refund":
      return `was refunded ${amount}`;
    case "grant":
      return "joined the adda";
  }
}

export function ActivityFeed({
  items,
  showMarket,
}: {
  items: ActivityItem[];
  showMarket?: boolean;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-soft">Scene illa. Quiet before the action.</p>;
  }
  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item.row.id} className="flex items-start gap-2 text-sm">
          <Avatar name={item.member.name} image={item.member.image} size={22} />
          <span className="min-w-0">
            <span className="font-semibold">{item.member.name}</span> {phrase(item)}
            {showMarket && item.market && (
              <>
                {" — "}
                <Link
                  href={`/market/${item.market.id}`}
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
