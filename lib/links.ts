// The one link primitive under invites, recovery links and key links: a random code in a URL
// that is also the row's primary key, live until it is spent or its clock runs out. Which table
// it lands in is what makes it an invite, a recovery or a rekey — and what it costs when it goes
// astray, which is why each has its own module for the rules that differ.

import { randomBytes } from "node:crypto";

/** 128 bits: not guessable, and still short enough to read out over a call. */
const CODE_BYTES = 16;

export const MINUTE_MS = 60 * 1000;
export const DAY_MS = 24 * 60 * MINUTE_MS;

export type LinkState = "live" | "used" | "expired";

/** A fresh code, which is also the row's primary key. */
export function newLinkCode(): string {
  return randomBytes(CODE_BYTES).toString("base64url");
}

/** Used beats expired: it happened, and the table should be told which. */
export function linkState(row: { expiresAt: Date; usedAt: Date | null }, now: Date): LinkState {
  if (row.usedAt) return "used";
  return row.expiresAt.getTime() <= now.getTime() ? "expired" : "live";
}

export function expiresAfter(now: Date, ttlMs: number): Date {
  return new Date(now.getTime() + ttlMs);
}
