"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setLingoAction } from "@/app/actions";
import { LINGO_KEYS, LINGOS } from "@/lib/lingo";
import { ActError } from "./use-act";

/** Shown only on your own member page: pick the lingo the app speaks to you. */
export function LingoPicker({ current }: { current: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const pick = (lingo: string) =>
    startTransition(async () => {
      setError(null);
      const res = await setLingoAction(lingo);
      if (!res.ok) setError(res.error ?? "That didn't work.");
      else router.refresh();
    });

  return (
    <div>
      <label className="flex items-center gap-2 text-sm">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-soft">Lingo</span>
        <select
          value={current}
          disabled={pending}
          onChange={(e) => pick(e.target.value)}
          className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm disabled:opacity-40"
        >
          {LINGO_KEYS.map((key) => (
            <option key={key} value={key}>
              {LINGOS[key].name}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-1 text-xs text-soft">How the app talks to you. Only changes your screen.</p>
      <ActError error={error} block />
    </div>
  );
}
