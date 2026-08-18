// Pies are stored as integer centi-pies ("cents") so settlement math is
// exact. 1 pie = 100 cents. Display always derives from cents.

export const CENTS = 100;

/** The pie symbol shown after amounts — π, for (Chiang) Pai. */
export const PIE = "π";

export function toCents(pies: number): number {
  return Math.round(pies * CENTS);
}

export function fmtPies(cents: number, opts?: { sign?: boolean }): string {
  const sign = opts?.sign && cents > 0 ? "+" : cents < 0 ? "−" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / CENTS);
  const frac = abs % CENTS;
  if (frac === 0) return `${sign}${whole}`;
  return `${sign}${whole}.${String(frac).padStart(2, "0").replace(/0$/, "")}`;
}

/** An amount with its symbol, for the places that need a plain string. */
export function piesText(cents: number, opts?: { sign?: boolean }): string {
  return `${fmtPies(cents, opts)}${PIE}`;
}

export function fmtPct(x: number): string {
  const sign = x > 0 ? "+" : x < 0 ? "−" : "";
  return `${sign}${Math.abs(x * 100).toFixed(0)}%`;
}
