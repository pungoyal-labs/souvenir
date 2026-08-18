import { fmtPies, PIE } from "@/lib/pies";

/**
 * An amount with the π suffix. The symbol is pinned to the sans face (the
 * .pie class): Big Shoulders and Spline Sans Mono draw π like a capital Π.
 */
export function Pies({ c, sign }: { c: number; sign?: boolean }) {
  return (
    <>
      {fmtPies(c, { sign })}
      <span className="pie">{PIE}</span>
    </>
  );
}
