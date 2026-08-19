// Pure split-bill math. Real money (INR/THB), integer centi-units end to end —
// paise and satang — formatted only at the edge, like lib/pies.ts. No I/O;
// everything here is covered by split.test.ts.
//
// A bill records who paid and who owes; a member's balance in a currency is
// simply Σpaid − Σowed over live bills, so balances always sum to zero and are
// derived by replay, never stored. Settling up is itself a bill (`settlement`
// kind): the payer paid, the receiver owes — the same math zeroes them out.

export type Currency = "inr" | "thb";

export const CURRENCIES: readonly Currency[] = ["inr", "thb"];

export const CURRENCY_SYMBOL: Record<Currency, string> = { inr: "₹", thb: "฿" };

export type SplitMode = "equal" | "custom";

export type BillKind = "expense" | "settlement";

/** Validation failures with a message fit to show the member. */
export class SplitError extends Error {}

/** One member's line on a bill, all centi-units. */
export interface BillEntry {
  memberId: string;
  /** What they put in toward the bill. */
  paidC: number;
  /** Their share of the cost. */
  owedC: number;
  /** True when they're in the split (kept so edits re-open exactly). */
  participant: boolean;
}

export interface BillEntryInput {
  memberId: string;
  paidC: number;
  participant: boolean;
  /** Custom mode only: their exact share. */
  owedC?: number;
}

export function billTotalC(entries: { paidC: number }[]): number {
  return entries.reduce((sum, e) => sum + e.paidC, 0);
}

/**
 * Split `totalC` equally across `memberIds` in whole centi-units. The
 * remainder cents land on the first members in id order, so the same bill
 * always splits the same way and the shares sum to the total exactly.
 */
export function equalShares(totalC: number, memberIds: string[]): Map<string, number> {
  if (memberIds.length === 0) throw new SplitError("Pick at least one person to split with.");
  const sorted = [...memberIds].sort();
  const base = Math.floor(totalC / sorted.length);
  let leftover = totalC - base * sorted.length;
  const shares = new Map<string, number>();
  for (const id of sorted) {
    shares.set(id, base + (leftover > 0 ? 1 : 0));
    if (leftover > 0) leftover -= 1;
  }
  return shares;
}

/**
 * Turn form input into the entry rows a bill stores, validating as a unit:
 * someone paid, someone owes, and both sides sum to the same total. Owed
 * shares are computed here at write time (like lib/engine's settle) so the
 * stored bill is complete and historical bills never re-split.
 */
export function buildEntries(mode: SplitMode, inputs: BillEntryInput[]): BillEntry[] {
  const seen = new Set<string>();
  for (const input of inputs) {
    if (seen.has(input.memberId)) throw new SplitError("Each person appears once on a bill.");
    seen.add(input.memberId);
    if (!Number.isInteger(input.paidC) || input.paidC < 0) {
      throw new SplitError("Paid amounts must be zero or more.");
    }
    if (input.owedC !== undefined && (!Number.isInteger(input.owedC) || input.owedC < 0)) {
      throw new SplitError("Shares must be zero or more.");
    }
  }

  const totalC = billTotalC(inputs);
  if (totalC <= 0) throw new SplitError("Enter who paid, and how much.");

  const participants = inputs.filter((i) => i.participant);
  if (participants.length === 0) {
    throw new SplitError("Pick at least one person to split with.");
  }

  let owedOf: (memberId: string) => number;
  if (mode === "equal") {
    const shares = equalShares(
      totalC,
      participants.map((p) => p.memberId),
    );
    owedOf = (id) => shares.get(id) ?? 0;
  } else {
    const owedTotal = participants.reduce((sum, p) => sum + (p.owedC ?? 0), 0);
    if (owedTotal !== totalC) {
      throw new SplitError("The shares must add up to the total paid.");
    }
    owedOf = (id) => participants.find((p) => p.memberId === id)?.owedC ?? 0;
  }

  return inputs
    .map((i) => ({
      memberId: i.memberId,
      paidC: i.paidC,
      owedC: i.participant ? owedOf(i.memberId) : 0,
      participant: i.participant,
    }))
    .filter((e) => e.paidC > 0 || e.participant);
}

/** The shape nets/settleUp need — a live bill's currency and entry lines. */
export interface BillForNets {
  currency: Currency;
  entries: { memberId: string; paidC: number; owedC: number }[];
}

/**
 * Replay bills into per-currency nets: positive means the group owes them,
 * negative means they owe the group. Zero-sum per currency by construction.
 * INR and THB never mix — there is no exchange rate here.
 */
export function nets(bills: BillForNets[]): Map<Currency, Map<string, number>> {
  const byCurrency = new Map<Currency, Map<string, number>>();
  for (const bill of bills) {
    let net = byCurrency.get(bill.currency);
    if (!net) {
      net = new Map();
      byCurrency.set(bill.currency, net);
    }
    for (const e of bill.entries) {
      net.set(e.memberId, (net.get(e.memberId) ?? 0) + e.paidC - e.owedC);
    }
  }
  return byCurrency;
}

export interface Transfer {
  fromId: string;
  toId: string;
  amountC: number;
}

/**
 * A short who-pays-whom plan that clears every net: repeatedly match the
 * biggest debtor with the biggest creditor (ties broken by id, so the plan is
 * deterministic). At most n−1 transfers; executing them all zeroes the map.
 */
export function settleUpPlan(net: Map<string, number>): Transfer[] {
  const debtors = [...net]
    .filter(([, c]) => c < 0)
    .map(([id, c]) => ({ id, c: -c }))
    .sort((a, b) => b.c - a.c || (a.id < b.id ? -1 : 1));
  const creditors = [...net]
    .filter(([, c]) => c > 0)
    .map(([id, c]) => ({ id, c }))
    .sort((a, b) => b.c - a.c || (a.id < b.id ? -1 : 1));

  const plan: Transfer[] = [];
  let d = 0;
  let cr = 0;
  while (d < debtors.length && cr < creditors.length) {
    const amountC = Math.min(debtors[d].c, creditors[cr].c);
    plan.push({ fromId: debtors[d].id, toId: creditors[cr].id, amountC });
    debtors[d].c -= amountC;
    creditors[cr].c -= amountC;
    if (debtors[d].c === 0) d += 1;
    if (creditors[cr].c === 0) cr += 1;
  }
  return plan;
}

/** "₹1,234.50" / "฿640" — Indian digit grouping for rupees, plain for baht. */
export function fmtMoney(currency: Currency, amountC: number, opts?: { sign?: boolean }): string {
  const sign = opts?.sign && amountC > 0 ? "+" : amountC < 0 ? "−" : "";
  const abs = Math.abs(amountC);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const grouped = whole.toLocaleString(currency === "inr" ? "en-IN" : "en-US");
  const fracText = frac === 0 ? "" : `.${String(frac).padStart(2, "0")}`;
  return `${sign}${CURRENCY_SYMBOL[currency]}${grouped}${fracText}`;
}

/** "1234.5" → 123450 centi-units, or null for anything that isn't money. */
export function parseAmount(text: string): number | null {
  const match = text
    .trim()
    .replace(/,/g, "")
    .match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const wholeC = Number(match[1]) * 100;
  const fracC = match[2] ? Number(match[2].padEnd(2, "0")) : 0;
  const c = wholeC + fracC;
  return Number.isSafeInteger(c) ? c : null;
}
