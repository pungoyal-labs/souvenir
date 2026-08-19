// Shared bill display helpers — plain functions (no "use client"), so both
// the /bills client tree and server pages like /member/[id] can label bills.

import type { BillView } from "@/lib/data";
import type { Member } from "@/lib/db/schema";

export function firstName(member: Member): string {
  return member.name.split(" ")[0];
}

/** "Bo paid Ana back" — a settlement bill's two sides, read off its entries. */
export function settlementParties(bill: BillView): { payer: Member; receiver: Member } | null {
  const payer = bill.entries.find((e) => e.paidC > 0)?.member;
  const receiver = bill.entries.find((e) => e.owedC > 0)?.member;
  return payer && receiver ? { payer, receiver } : null;
}

export function billLabel(bill: BillView, meId: string): string {
  if (bill.kind !== "settlement") return bill.description;
  const parties = settlementParties(bill);
  if (!parties) return "Settled up";
  const name = (m: Member) => (m.id === meId ? "You" : firstName(m));
  return `${name(parties.payer)} paid ${name(parties.receiver)} back`;
}
