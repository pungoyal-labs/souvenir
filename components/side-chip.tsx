import type { Side } from "@/lib/engine";

export function SideChip({ side, small }: { side: Side; small?: boolean }) {
  const cls = side === "yes" ? "bg-yes-tint text-yes-deep" : "bg-no-tint text-no-deep";
  return (
    <span
      className={`display inline-flex items-center rounded font-bold uppercase ${cls} ${
        small ? "px-1.5 text-xs" : "px-2 py-0.5 text-sm"
      }`}
    >
      {side}
    </span>
  );
}

export function StatusChip({ status }: { status: "open" | "yes" | "no" | "refunded" }) {
  if (status === "open") {
    return (
      <span className="display inline-flex items-center gap-1.5 rounded bg-felt-tint px-2 py-0.5 text-sm font-bold uppercase text-felt">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-felt" />
        Open
      </span>
    );
  }
  if (status === "refunded") {
    return (
      <span className="display inline-flex items-center rounded bg-line/60 px-2 py-0.5 text-sm font-bold uppercase text-soft">
        Voided
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-sm font-semibold text-soft">
      Resolved <SideChip side={status} small />
    </span>
  );
}
