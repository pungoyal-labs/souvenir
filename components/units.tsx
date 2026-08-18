import { fmtUnits, UNIT } from "@/lib/units";

/**
 * An amount with the π suffix. The symbol is pinned to the sans face (the
 * .unit class): Big Shoulders and Spline Sans Mono draw π like a capital Π.
 */
export function Units({ c, sign }: { c: number; sign?: boolean }) {
  return (
    <>
      {fmtUnits(c, { sign })}
      <span className="unit">{UNIT}</span>
    </>
  );
}
