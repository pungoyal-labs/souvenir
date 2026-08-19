"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { reactAction } from "@/app/actions";
import type { ReactionKind } from "@/lib/data";
import { lingoOf } from "@/lib/lingo";

interface Reactor {
  id: string;
  name: string;
}

/**
 * The upvote and watch toggles on a prediction page. Both feed the "For you"
 * ranking; watching additionally routes the market's activity to the inbox.
 * Resolved predictions keep their reactions but only allow un-reacting.
 */
export function ReactionBar({
  marketId,
  meId,
  upvoters,
  watchers,
  open,
  lingo = "english",
}: {
  marketId: string;
  meId: string;
  upvoters: Reactor[];
  watchers: Reactor[];
  open: boolean;
  lingo?: string;
}) {
  const t = lingoOf(lingo);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggle = (kind: ReactionKind, on: boolean) =>
    startTransition(async () => {
      setError(null);
      const res = await reactAction(marketId, kind, on);
      if (!res.ok) setError(res.error ?? t.oops);
      else router.refresh();
    });

  const button = (kind: ReactionKind, reactors: Reactor[], label: string, activeLabel: string) => {
    const mine = reactors.some((r) => r.id === meId);
    const count = reactors.length;
    return (
      <button
        type="button"
        disabled={pending || (!open && !mine)}
        onClick={() => toggle(kind, !mine)}
        title={reactors.map((r) => r.name).join(", ")}
        className={`rounded-md border px-3 py-1.5 text-sm font-semibold disabled:opacity-40 ${
          mine ? "border-gold/60 bg-gold/20" : "border-line text-soft hover:bg-paper hover:text-ink"
        }`}
      >
        {mine ? activeLabel : label}
        {count > 0 && <span className="mono ml-1.5">{count}</span>}
      </button>
    );
  };

  return (
    <div className="mt-3 flex items-center gap-2">
      {button("upvote", upvoters, "👍 Upvote", "👍 Upvoted")}
      {button("watch", watchers, "👁 Watch", "👁 Watching")}
      {error && <p className="text-sm font-semibold text-no-deep">{error}</p>}
    </div>
  );
}
