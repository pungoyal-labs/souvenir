"use client";

import { useState } from "react";
import { useTrip } from "./trip-store";
import { useAct } from "./use-act";

/** An organiser taking a resolution back — deliberately somebody else's job, and it asks twice. */
export function ReopenPanel({ marketId }: { marketId: string }) {
  const { append } = useTrip();
  const { pending, error, act } = useAct();
  const [confirming, setConfirming] = useState(false);

  const reopen = () =>
    act(async () => {
      const res = await append({ t: "reopen", marketId });
      if (!res.ok) setConfirming(false);
      return res;
    });

  return (
    <div className="mt-3 border-t border-line pt-3">
      {!confirming ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => setConfirming(true)}
          className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold hover:bg-paper disabled:opacity-40"
        >
          Reopen this prediction
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <p className="w-full text-xs text-soft">
            Everyone hands the pool back and the calls stand as they were. It can be resolved again.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={reopen}
            className="rounded-md bg-felt px-3 py-1.5 text-xs font-semibold text-white hover:bg-felt-deep disabled:opacity-40"
          >
            {pending ? "Reopening…" : "Yes, reopen it"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirming(false)}
            className="rounded-md px-3 py-1.5 text-xs font-semibold text-soft hover:underline disabled:opacity-40"
          >
            Back
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-sm font-semibold text-no-deep">{error}</p>}
    </div>
  );
}
