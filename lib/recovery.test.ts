import { describe, expect, it } from "vitest";
import { RECOVERY_NOTICE_MS, RECOVERY_TTL_MS, recoveryUrl, visibleRecoveries } from "./recovery.ts";

const NOW = new Date("2026-08-19T12:00:00Z");
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);

describe("RECOVERY_TTL_MS", () => {
  it("is half an hour — the window an organiser is on the phone for", () => {
    expect(RECOVERY_TTL_MS).toBe(30 * 60 * 1000);
  });

  it("is far shorter than any invite: this link is a seat, not a chair", () => {
    expect(RECOVERY_TTL_MS).toBeLessThan(24 * 60 * 60 * 1000);
  });
});

describe("recoveryUrl", () => {
  it("puts the code in the path, and nowhere near /join", () => {
    expect(recoveryUrl("https://souvenir.example.com", "abc123")).toBe(
      "https://souvenir.example.com/recover/abc123",
    );
  });
});

describe("visibleRecoveries", () => {
  const row = (over: Partial<{ id: string; expiresAt: Date; usedAt: Date | null }>) => ({
    id: "x",
    expiresAt: minutes(30),
    usedAt: null as Date | null,
    ...over,
  });

  it("names every link still open, so nobody's seat is fetched for quietly", () => {
    const { live } = visibleRecoveries([row({ id: "a" }), row({ id: "b" })], NOW);
    expect(live.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("keeps reporting a used link for a week — the record of what happened", () => {
    const { live, used } = visibleRecoveries([row({ id: "spent", usedAt: minutes(-5) })], NOW);
    expect(live).toEqual([]);
    expect(used.map((r) => r.id)).toEqual(["spent"]);
  });

  it("lets the notice lapse once the week is up", () => {
    const old = row({ id: "old", usedAt: new Date(NOW.getTime() - RECOVERY_NOTICE_MS - 1) });
    expect(visibleRecoveries([old], NOW).used).toEqual([]);
  });

  it("says nothing about a link that expired unused — nobody came", () => {
    const stale = row({ id: "stale", expiresAt: minutes(-1) });
    expect(visibleRecoveries([stale], NOW)).toEqual({ live: [], used: [] });
  });
});
