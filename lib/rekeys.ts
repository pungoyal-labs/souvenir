// Rekey links (docs/private-trips.md §4.8): the trip key under a fragment's secret, for a member
// already at the table. It hands over only a key, and only to a session that *is* that member;
// every live one is named on the members page, like a recovery.

import { newInviteCode } from "./invites.ts";

/** Long enough to walk somebody through it on a call. */
export const REKEY_TTL_MS = 30 * 60 * 1000;

/** The seal script prints one per member, handed out by hand over days. */
export const CONSOLE_REKEY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const newRekeyCode = newInviteCode;

export type RekeyState = "live" | "used" | "expired";

export function rekeyState(row: { expiresAt: Date; usedAt: Date | null }, now: Date): RekeyState {
  if (row.usedAt) return "used";
  return row.expiresAt.getTime() <= now.getTime() ? "expired" : "live";
}

export function rekeyExpiresAt(now: Date, ttlMs = REKEY_TTL_MS): Date {
  return new Date(now.getTime() + ttlMs);
}

/** The link, without its secret — the caller adds the fragment. */
export function rekeyUrl(baseUrl: string, code: string): string {
  return `${baseUrl}/k/${code}`;
}

export function liveRekeys<T extends { expiresAt: Date; usedAt: Date | null }>(
  rows: readonly T[],
  now: Date,
): T[] {
  return rows.filter((row) => rekeyState(row, now) === "live");
}
