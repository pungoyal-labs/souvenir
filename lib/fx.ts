// Settling the whole trip in one currency. Pure; covered by fx.test.ts.
//
// A trip spends two currencies and lib/split keeps them apart: foreign owed
// is foreign owed, and there is no rate in there. But the group flies home,
// and at home nobody is paying anybody in the money they spent there. This
// module is the bridge: the
// foreign nets are read in the home currency at the day's rate, marked up by
// the forex charge every card and exchange counter takes, and added to the
// home nets — one balance per member, one plan, all in the money the group
// actually has. The conversion keeps the zero-sum: the converted foreign nets
// are rounded by largest remainder so they still sum to exactly nothing.
//
// The rate is public data fetched by the server (lib/rates.ts); it carries no
// trip content, only which two currencies, which the trip row already holds.

import { CURRENCY_INFO, type Currency, isCurrency, settleUpPlan, type Transfer } from "./split.ts";

/**
 * The forex charge, in basis points, added on top of the mid-market rate to
 * everything spent in the foreign currency — what a card or an exchange
 * counter actually took. It lands on the whole foreign balance, both sides,
 * so a creditor is made whole for the markup and the nets stay zero-sum.
 */
export const FX_SURCHARGE_BPS = 500;

/** How many units of `to` one unit of `from` buys, on the day it was read. */
export interface FxRate {
  from: Currency;
  to: Currency;
  rate: number;
  /** ISO date the provider published it. */
  asOf: string;
}

export class FxError extends Error {}

/**
 * Read a provider's answer into a rate, or null. The shape is currency-api's
 * (`{ date, [from]: { [to]: number } }`); anything missing, non-numeric, or
 * not positive is treated as "no rate today" rather than a rate of zero.
 */
export function parseRate(body: unknown, from: Currency, to: Currency): FxRate | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  const table = record[from];
  if (typeof table !== "object" || table === null) return null;
  const rate = (table as Record<string, unknown>)[to];
  const asOf = record.date;
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) return null;
  if (typeof asOf !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return null;
  return { from, to, rate, asOf };
}

/** `amountC` of `rate.from`, in centi-units of `rate.to`, surcharge included — unrounded. */
export function inHome(amountC: number, rate: FxRate, surchargeBps = FX_SURCHARGE_BPS): number {
  return (amountC * rate.rate * (10_000 + surchargeBps)) / 10_000;
}

/**
 * Round each real to an integer so the integers sum to exactly `total`
 * (largest remainder: floor everything, then hand the leftover units to the
 * biggest fractional parts, ties by index). The same rounding lib/engine uses
 * for payouts, for the same reason — the pieces must add back up.
 */
export function roundToSum(values: number[], total: number): number[] {
  if (!Number.isInteger(total)) throw new FxError("The total must be a whole number.");
  const floors = values.map((v) => Math.floor(v));
  let leftover = total - floors.reduce((s, v) => s + v, 0);
  if (leftover < 0 || leftover > values.length) {
    throw new FxError("The values don't round to that total.");
  }
  const order = values
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  const out = [...floors];
  for (const { i } of order) {
    if (leftover === 0) break;
    out[i] += 1;
    leftover -= 1;
  }
  return out.map((v) => (v === 0 ? 0 : v));
}

/**
 * The foreign nets read in the home currency, surcharge included, rounded so
 * they still sum to nothing: what was zero-sum there is zero-sum at home.
 */
export function convertNets(
  foreign: Map<string, number>,
  rate: FxRate,
  surchargeBps = FX_SURCHARGE_BPS,
): Map<string, number> {
  const ids = [...foreign.keys()];
  const exact = ids.map((id) => inHome(foreign.get(id) ?? 0, rate, surchargeBps));
  const total = Math.round(exact.reduce((s, v) => s + v, 0));
  const rounded = roundToSum(exact, total);
  return new Map(ids.map((id, i) => [id, rounded[i] ?? 0]));
}

/** One member's balance for the whole trip, and where it came from. */
export interface CombinedNet {
  /** Their net in the home currency's own bills. */
  homeC: number;
  /** Their net in the foreign currency, as spent. */
  foreignC: number;
  /** That foreign net read in the home currency, surcharge included. */
  foreignHomeC: number;
  /** homeC + foreignHomeC: what the trip owes them (positive) or they owe it. */
  netC: number;
}

/**
 * Fold per-currency nets into one balance per member in the home currency.
 * Refuses a currency it has no rate for — a trip has one foreign currency,
 * and a bill in a third would be silently mispriced by any guess.
 */
export function combinedNets(
  byCurrency: Map<Currency, Map<string, number>>,
  home: Currency,
  rate: FxRate,
  surchargeBps = FX_SURCHARGE_BPS,
): Map<string, CombinedNet> {
  if (rate.to !== home) throw new FxError("The rate has to be into the home currency.");
  const out = new Map<string, CombinedNet>();
  const line = (id: string) => {
    let entry = out.get(id);
    if (!entry) {
      entry = { homeC: 0, foreignC: 0, foreignHomeC: 0, netC: 0 };
      out.set(id, entry);
    }
    return entry;
  };
  for (const [currency, net] of byCurrency) {
    if (currency === home) {
      for (const [id, c] of net) line(id).homeC += c;
    } else if (currency === rate.from) {
      const converted = convertNets(net, rate, surchargeBps);
      for (const [id, c] of net) {
        const entry = line(id);
        entry.foreignC += c;
        entry.foreignHomeC += converted.get(id) ?? 0;
      }
    } else {
      throw new FxError(`No rate for ${currency.toUpperCase()}.`);
    }
  }
  for (const entry of out.values()) {
    const netC = entry.homeC + entry.foreignHomeC;
    entry.netC = netC === 0 ? 0 : netC;
  }
  return out;
}

/** The transfers that clear every combined net, in the home currency. */
export function combinedPlan(combined: Map<string, CombinedNet>): Transfer[] {
  return settleUpPlan(new Map([...combined].map(([id, c]) => [id, c.netC])));
}

/**
 * "฿1 = ₹2.61", or "₫1,000 = ₹3.30" for money so small a unit of it says
 * nothing: the unit grows by tens until it buys at least one of the home
 * currency. The mid-market rate, before the surcharge — the note beside it
 * says what was added.
 */
export function fmtRate(rate: FxRate): string {
  if (!isCurrency(rate.from) || !isCurrency(rate.to)) return `${rate.from} → ${rate.to}`;
  const from = CURRENCY_INFO[rate.from];
  const to = CURRENCY_INFO[rate.to];
  let unit = 1;
  while (unit * rate.rate < 1 && unit < 1_000_000_000) unit *= 10;
  const bought = unit * rate.rate;
  return `${from.symbol}${unit.toLocaleString("en-US")} = ${to.symbol}${bought.toFixed(2)}`;
}
