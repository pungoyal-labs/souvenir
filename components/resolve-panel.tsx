"use client";

import { useState } from "react";
import type { Side } from "@/lib/engine";
import { useTrip } from "./trip-store";
import { useAct } from "./use-act";

type Outcome = Side | "refunded";

const OPTIONS: { value: Outcome; label: string; hint: string | null }[] = [
  { value: "yes", label: "YES", hint: "The YES side splits the whole pool" },
  { value: "no", label: "NO", hint: "The NO side splits the whole pool" },
  { value: "refunded", label: "Void", hint: null },
];

export function ResolvePanel({ marketId }: { marketId: string }) {
  const { t, append } = useTrip();
  const { pending, error, act } = useAct(t.oops);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);

  const resolve = () =>
    act(async () => {
      if (!outcome) return;
      const res = await append({ t: "resolve", marketId, outcome, note });
      if (!res.ok) setConfirming(false);
      return res;
    });

  return (
    <div className="rounded-lg border border-gold/40 bg-surface p-4">
      <h3 className="display text-lg font-bold uppercase tracking-wide text-gold">
        Resolve — your call
      </h3>
      <p className="mt-1 text-xs text-soft">{t.resolveSub}</p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            title={opt.hint ?? t.voidHint}
            onClick={() => {
              setOutcome(opt.value);
              setConfirming(false);
            }}
            className={`display rounded-md border py-2 text-lg font-bold uppercase ${
              outcome === opt.value
                ? opt.value === "yes"
                  ? "border-yes bg-yes text-white"
                  : opt.value === "no"
                    ? "border-no bg-no text-white"
                    : "border-ink bg-ink text-paper"
                : "border-line hover:bg-paper"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="How you decided (goes on the permanent record)"
        rows={2}
        className="mt-3 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm"
      />

      {!confirming ? (
        <button
          type="button"
          disabled={!outcome || pending}
          onClick={() => setConfirming(true)}
          className="btn btn-felt mt-3 w-full py-2.5"
        >
          Resolve this prediction
        </button>
      ) : (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={resolve}
            className="btn btn-felt flex-1 py-2.5"
          >
            {pending
              ? "Resolving…"
              : `Confirm ${outcome === "refunded" ? "void" : outcome?.toUpperCase()} — final`}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirming(false)}
            className="btn btn-line px-4"
          >
            Back
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-sm font-semibold text-no-deep">{error}</p>}
    </div>
  );
}
