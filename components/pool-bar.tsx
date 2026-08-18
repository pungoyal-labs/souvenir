import { lingoOf } from "@/lib/lingo";
import { Units } from "./units";

/**
 * The signature element: a tug-of-war between YES and NO.
 * Width is share of committed units — the group's revealed belief,
 * with no odds or probabilities calculated for anyone.
 */
export function PoolBar({
  yesPoolC,
  noPoolC,
  compact,
  lingo = "english",
}: {
  yesPoolC: number;
  noPoolC: number;
  compact?: boolean;
  lingo?: string;
}) {
  const t = lingoOf(lingo);
  const total = yesPoolC + noPoolC;
  const yesPct = total === 0 ? 50 : (yesPoolC / total) * 100;

  return (
    <div>
      {total === 0 ? (
        <div className="flex h-3 items-center rounded-full border border-dashed border-line bg-surface" />
      ) : (
        <div className="flex h-3 overflow-hidden rounded-full">
          <div className="pool-fill bg-yes" style={{ width: `${yesPct}%` }} />
          <div className="w-0.5 shrink-0 bg-paper" />
          <div className="pool-fill flex-1 bg-no" />
        </div>
      )}
      {!compact && (
        <div className="mt-1 flex justify-between text-xs font-semibold">
          <span className="text-yes-deep">
            YES{" "}
            <span className="mono">
              <Units c={yesPoolC} />
            </span>
          </span>
          {total === 0 && <span className="text-soft">{t.poolEmpty}</span>}
          <span className="text-no-deep">
            <span className="mono">
              <Units c={noPoolC} />
            </span>{" "}
            NO
          </span>
        </div>
      )}
    </div>
  );
}
