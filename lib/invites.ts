// Invite links: the invite itself is the credential — a random code whoever holds can join with.
// The code is stored as-is so a link can be re-shared; it survives by being short-lived and
// revocable rather than unreadable.

import { randomBytes } from "node:crypto";

/** 128 bits: not guessable, and still short enough to read out over a call. */
const CODE_BYTES = 16;

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** A week, not a month: the link carries the trip's key, and minting again is one tap. */
export const GROUP_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type InviteState = "live" | "used" | "expired";

/** A fresh code, which is also the row's primary key. */
export function newInviteCode(): string {
  return randomBytes(CODE_BYTES).toString("base64url");
}

/** Used beats expired; an open link is never spent. */
export function inviteState(
  invite: { expiresAt: Date; useCount: number; isOpen: boolean },
  now: Date,
): InviteState {
  if (!invite.isOpen && invite.useCount > 0) return "used";
  return invite.expiresAt.getTime() <= now.getTime() ? "expired" : "live";
}

export function expiresAtFrom(now: Date, isOpen = false): Date {
  return new Date(now.getTime() + (isOpen ? GROUP_INVITE_TTL_MS : INVITE_TTL_MS));
}

/** The link an inviter copies. `baseUrl` is AUTH_URL, already trailing-slash free. */
export function inviteUrl(baseUrl: string, code: string): string {
  return `${baseUrl}/join/${code}`;
}

/** The one live group link (newest wins) and the personal invites still waiting. */
export function partitionInvites<T extends { expiresAt: Date; useCount: number; isOpen: boolean }>(
  rows: readonly T[],
  now: Date,
): { groupLink: T | null; personal: T[] } {
  const live = rows.filter((row) => inviteState(row, now) === "live");
  return {
    groupLink: live.find((row) => row.isOpen) ?? null,
    personal: live.filter((row) => !row.isOpen),
  };
}
