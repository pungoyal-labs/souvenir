import { describe, expect, it } from "vitest";
import { CONSOLE_REKEY_TTL_MS, liveRekeys, REKEY_TTL_MS, rekeyUrl } from "./rekeys.ts";

const now = new Date("2026-12-10T10:00:00Z");
const later = new Date(now.getTime() + 1);
const earlier = new Date(now.getTime() - 1);

describe("rekey links", () => {
  it("last half an hour, or a week from the console", () => {
    expect(REKEY_TTL_MS).toBe(30 * 60 * 1000);
    expect(CONSOLE_REKEY_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("lists only what can still be walked through", () => {
    const rows = [
      { code: "a", expiresAt: later, usedAt: null },
      { code: "b", expiresAt: earlier, usedAt: null },
      { code: "c", expiresAt: later, usedAt: earlier },
    ];
    expect(liveRekeys(rows, now).map((r) => r.code)).toEqual(["a"]);
  });

  it("builds the link without a secret", () => {
    expect(rekeyUrl("https://x.test", "abc")).toBe("https://x.test/k/abc");
  });
});
