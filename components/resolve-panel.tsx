"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { resolveAction } from "@/app/actions";
import type { Side } from "@/lib/engine";

type Outcome = Side | "refunded";

const OPTIONS: { value: Outcome; label: string; hint: string }[] = [
  { value: "yes", label: "YES", hint: "The YES side splits the whole pool" },
  { value: "no", label: "NO", hint: "The NO side splits the whole pool" },
  {
    value: "refunded",
    label: "Void",
    hint: "Ambiguous or unresolvable — everyone gets their bet back",
  },
];

export function ResolvePanel({ marketId }: { marketId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolve = () =>
    startTransition(async () => {
      if (!outcome) return;
      setError(null);
      const res = await resolveAction(marketId, outcome, note);
      if (!res.ok) {
        setError(res.error ?? "That didn't work.");
        setConfirming(false);
      } else {
        router.refresh();
      }
    });

  return (
    <div className="rounded-lg border border-gold/40 bg-surface p-4">
      <h3 className="display text-lg font-bold uppercase tracking-wide text-gold">
        Resolve — your call
      </h3>
      <p className="mt-1 text-xs text-soft">
        You created this prediction, so you resolve it. Resolution is final.
      </p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            title={opt.hint}
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
          className="mt-3 w-full rounded-md bg-felt py-2.5 font-semibold text-white hover:bg-felt-deep disabled:opacity-40"
        >
          Resolve this prediction
        </button>
      ) : (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={resolve}
            className="flex-1 rounded-md bg-felt py-2.5 font-semibold text-white hover:bg-felt-deep disabled:opacity-40"
          >
            {pending
              ? "Resolving…"
              : `Confirm ${outcome === "refunded" ? "void" : outcome?.toUpperCase()} — final`}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirming(false)}
            className="rounded-md border border-line px-4 font-semibold hover:bg-paper"
          >
            Back
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-sm font-semibold text-no-deep">{error}</p>}
    </div>
  );
}
