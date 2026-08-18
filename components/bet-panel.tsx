"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { betAction, switchAction } from "@/app/actions";
import type { Side } from "@/lib/engine";
import { lingoOf } from "@/lib/lingo";
import { Units } from "./units";

export function BetPanel({
  marketId,
  mySide,
  myStakeC,
  maxStakeC,
  lingo = "english",
}: {
  marketId: string;
  mySide: Side | null;
  myStakeC: number;
  maxStakeC: number;
  lingo?: string;
}) {
  const t = lingoOf(lingo);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [units, setUnits] = useState(1);
  const [error, setError] = useState<string | null>(null);

  // Infinite bank: net going negative is fine, so the only ceiling is the
  // per-market exposure cap.
  const roomC = maxStakeC - myStakeC;
  const maxUnits = Math.floor(roomC / 100);
  const clamped = Math.min(Math.max(units, 1), Math.max(maxUnits, 1));

  const bet = (side: Side) =>
    startTransition(async () => {
      setError(null);
      const res = await betAction(marketId, side, clamped);
      if (!res.ok) setError(res.error ?? t.oops);
      else router.refresh();
    });

  const switchSide = () =>
    startTransition(async () => {
      setError(null);
      const res = await switchAction(marketId);
      if (!res.ok) setError(res.error ?? t.oops);
      else router.refresh();
    });

  const other: Side = mySide === "yes" ? "no" : "yes";

  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <h3 className="display text-lg font-bold uppercase tracking-wide text-soft">Place a bet</h3>

      {maxUnits < 1 ? (
        <p className="mt-2 text-sm text-soft">{t.stakeLimit}</p>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex items-center rounded-md border border-line">
              <button
                type="button"
                aria-label="One unit less"
                className="px-3 py-2 text-lg leading-none text-soft hover:text-ink disabled:opacity-30"
                disabled={clamped <= 1 || pending}
                onClick={() => setUnits(clamped - 1)}
              >
                −
              </button>
              <span className="mono w-10 text-center text-lg font-bold">{clamped}</span>
              <button
                type="button"
                aria-label="One unit more"
                className="px-3 py-2 text-lg leading-none text-soft hover:text-ink disabled:opacity-30"
                disabled={clamped >= maxUnits || pending}
                onClick={() => setUnits(clamped + 1)}
              >
                +
              </button>
            </div>
            <span className="text-xs text-soft">
              units · room for <Units c={roomC} /> more here
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={pending || mySide === "no"}
              onClick={() => bet("yes")}
              className="display rounded-md bg-yes py-2.5 text-lg font-bold uppercase text-white hover:bg-yes-press disabled:cursor-not-allowed disabled:opacity-40"
            >
              Bet yes
            </button>
            <button
              type="button"
              disabled={pending || mySide === "yes"}
              onClick={() => bet("no")}
              className="display rounded-md bg-no py-2.5 text-lg font-bold uppercase text-white hover:bg-no-press disabled:cursor-not-allowed disabled:opacity-40"
            >
              Bet no
            </button>
          </div>
        </>
      )}

      {mySide && (
        <div className="mt-3 border-t border-line pt-3 text-sm">
          <p>
            You've bet{" "}
            <span className="mono font-bold">
              <Units c={myStakeC} />
            </span>{" "}
            on <span className="font-bold uppercase">{mySide}</span>.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={switchSide}
            className="mt-1.5 rounded-md border border-line px-3 py-1.5 font-semibold hover:bg-paper disabled:opacity-40"
          >
            Switch entire bet to {other.toUpperCase()}
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-sm font-semibold text-no-deep">{error}</p>}
      {pending && <p className="mt-3 text-sm text-soft">{t.recording}</p>}
    </div>
  );
}
