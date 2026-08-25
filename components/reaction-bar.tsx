"use client";

import type { Person } from "@/lib/views";
import { Avatar } from "./avatar";
import { useTrip } from "./trip-store";
import { useAct } from "./use-act";

type ReactionKind = "upvote" | "watch";

/**
 * Upvote and watch, both feeding the For-you ranking; watching also routes the
 * prediction's activity to the inbox. Once resolved, only un-reacting is left.
 */
export function ReactionBar({
  marketId,
  meId,
  upvoters,
  watchers,
  open,
}: {
  marketId: string;
  meId: string;
  upvoters: Person[];
  watchers: Person[];
  open: boolean;
}) {
  const { t, append } = useTrip();
  const { pending, error, act } = useAct(t.oops);

  const toggle = (kind: ReactionKind, on: boolean) =>
    act(() => append({ t: "react", marketId, kind, on }));

  const button = (kind: ReactionKind, reactors: Person[], label: string, activeLabel: string) => {
    const mine = reactors.some((r) => r.id === meId);
    const count = reactors.length;
    return (
      <span className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={pending || (!open && !mine)}
          onClick={() => toggle(kind, !mine)}
          title={reactors.map((r) => r.name).join(", ")}
          className={`rounded-md border px-3 py-1.5 text-sm font-semibold disabled:opacity-40 ${
            mine
              ? "border-gold/60 bg-gold/20"
              : "border-line text-soft hover:bg-paper hover:text-ink"
          }`}
        >
          {mine ? activeLabel : label}
          {count > 0 && <span className="mono ml-1.5">{count}</span>}
        </button>
        {count > 0 && (
          <span className="flex -space-x-1.5">
            {reactors.map((r) => (
              <span key={r.id} title={r.name}>
                <Avatar member={r} size={20} />
              </span>
            ))}
          </span>
        )}
      </span>
    );
  };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      {button("upvote", upvoters, "👍 Upvote", "👍 Upvoted")}
      {button("watch", watchers, "👁 Watch", "👁 Watching")}
      {error && <p className="text-sm font-semibold text-no-deep">{error}</p>}
    </div>
  );
}
