"use client";

import { useState } from "react";
import type { Side } from "@/lib/engine";
import { toCents } from "@/lib/pies";
import { Pies } from "./pies";
import { useTrip } from "./trip-store";
import { useAct } from "./use-act";

export function BetPanel({
  marketId,
  mySide,
  myStakeC,
  maxStakeC,
}: {
  marketId: string;
  mySide: Side | null;
  myStakeC: number;
  maxStakeC: number;
}) {
  const { t, append } = useTrip();
  const { pending, error, act } = useAct(t.oops);
  const [pies, setPies] = useState(1);

  // Infinite bank: the per-market exposure cap is the only ceiling.
  const roomC = maxStakeC - myStakeC;
  const maxPies = Math.floor(roomC / 100);
  const clamped = Math.min(Math.max(pies, 1), Math.max(maxPies, 1));

  const call = (side: Side) =>
    act(() => append({ t: "call", marketId, side, amountC: toCents(clamped) }));
  const switchSide = () => act(() => append({ t: "switch", marketId }));
  const other: Side = mySide === "yes" ? "no" : "yes";

  return (
    <div className="card p-4">
      <h3 className="display text-lg font-bold uppercase tracking-wide text-soft">Make a call</h3>

      {maxPies < 1 ? (
        <p className="mt-2 text-sm text-soft">{t.stakeLimit}</p>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex items-center rounded-md border border-line">
              <button
                type="button"
                aria-label="One stamp less"
                className="px-3 py-2 text-lg leading-none text-soft hover:text-ink disabled:opacity-30"
                disabled={clamped <= 1 || pending}
                onClick={() => setPies(clamped - 1)}
              >
                −
              </button>
              <span className="mono w-10 text-center text-lg font-bold">{clamped}</span>
              <button
                type="button"
                aria-label="One stamp more"
                className="px-3 py-2 text-lg leading-none text-soft hover:text-ink disabled:opacity-30"
                disabled={clamped >= maxPies || pending}
                onClick={() => setPies(clamped + 1)}
              >
                +
              </button>
            </div>
            <span className="text-xs text-soft">
              stamps · room for <Pies c={roomC} /> more here
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={pending || mySide === "no"}
              onClick={() => call("yes")}
              className="display rounded-md bg-yes py-2.5 text-lg font-bold uppercase text-white hover:bg-yes-press disabled:cursor-not-allowed disabled:opacity-40"
            >
              Call YES
            </button>
            <button
              type="button"
              disabled={pending || mySide === "yes"}
              onClick={() => call("no")}
              className="btn btn-no display py-2.5 text-lg font-bold uppercase"
            >
              Call NO
            </button>
          </div>
        </>
      )}

      {mySide && (
        <div className="mt-3 border-t border-line pt-3 text-sm">
          <p>
            You called{" "}
            <span className="mono font-bold">
              <Pies c={myStakeC} />
            </span>{" "}
            on <span className="font-bold uppercase">{mySide}</span>.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={switchSide}
            className="btn btn-line mt-1.5 px-3 py-1.5"
          >
            Switch your whole call to {other.toUpperCase()}
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-sm font-semibold text-no-deep">{error}</p>}
      {pending && <p className="mt-3 text-sm text-soft">{t.recording}</p>}
    </div>
  );
}
