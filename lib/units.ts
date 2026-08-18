// Units are stored as integer centi-units ("cents") so settlement math is
// exact. 1 unit = 100 cents. Display always derives from cents.

export const CENTS = 100;

/** The unit symbol shown after amounts — π, for (Chiang) Pai. */
export const UNIT = "π";

export function toCents(units: number): number {
  return Math.round(units * CENTS);
}

export function fmtUnits(cents: number, opts?: { sign?: boolean }): string {
  const sign = opts?.sign && cents > 0 ? "+" : cents < 0 ? "−" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / CENTS);
  const frac = abs % CENTS;
  if (frac === 0) return `${sign}${whole}`;
  return `${sign}${whole}.${String(frac).padStart(2, "0").replace(/0$/, "")}`;
}

export function fmtPct(x: number): string {
  const sign = x > 0 ? "+" : x < 0 ? "−" : "";
  return `${sign}${Math.abs(x * 100).toFixed(0)}%`;
}
