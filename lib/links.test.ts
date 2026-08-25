import { describe, expect, it } from "vitest";
import { expiresAfter, linkState, newLinkCode } from "./links.ts";

const NOW = new Date("2026-08-19T12:00:00Z");
const later = new Date(NOW.getTime() + 1);
const earlier = new Date(NOW.getTime() - 1);

describe("newLinkCode", () => {
  it("is URL-safe, so it can be the last segment of a link", () => {
    expect(newLinkCode()).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("carries 128 bits — long enough that guessing is not a threat model", () => {
    expect(newLinkCode()).toHaveLength(22); // 16 bytes, base64url, unpadded
  });

  it("never repeats", () => {
    const codes = new Set(Array.from({ length: 200 }, () => newLinkCode()));
    expect(codes.size).toBe(200);
  });
});

describe("linkState", () => {
  it("is live until it expires, on the stroke", () => {
    expect(linkState({ expiresAt: later, usedAt: null }, NOW)).toBe("live");
    expect(linkState({ expiresAt: NOW, usedAt: null }, NOW)).toBe("expired");
  });

  it("is used once spent, even long after it would have expired", () => {
    // Which it was matters to whoever minted it: "used" means somebody came.
    expect(linkState({ expiresAt: earlier, usedAt: earlier }, NOW)).toBe("used");
  });
});

describe("expiresAfter", () => {
  it("adds the ttl", () => {
    expect(expiresAfter(NOW, 1234).getTime() - NOW.getTime()).toBe(1234);
  });
});
