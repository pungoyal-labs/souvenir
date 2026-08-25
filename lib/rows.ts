// The two row shapes every derivation speaks: what the plaintext `markets`
// and `ledger` tables were, now emitted by lib/replay from the sealed log so
// lib/stats and lib/views did not have to change.

export type MarketStatus = "open" | "yes" | "no" | "refunded";

export interface Market {
  id: string;
  tripId: string;
  creatorId: string;
  question: string;
  criteria: string;
  createdAt: Date;
  status: MarketStatus;
  resolvedAt: Date | null;
  resolutionNote: string | null;
}

export type LedgerKind = "grant" | "bet" | "switch" | "payout" | "refund" | "reversal";

/**
 * One pie movement. `amountC` is the size, `balanceDeltaC` its sign for the
 * member: bet −, switch 0, payout/refund +, reversal −.
 */
export interface LedgerRow {
  id: number;
  at: Date;
  tripId: string;
  memberId: string;
  marketId: string | null;
  kind: LedgerKind;
  side: "yes" | "no" | null;
  amountC: number;
  balanceDeltaC: number;
  note: string | null;
}

/** What the record calls a member whose account is gone. */
export const DEPARTED_NAME = "Departed member";
