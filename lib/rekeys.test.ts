import { describe, expect, it } from "vitest";
import {
  CONSOLE_REKEY_TTL_MS,
  liveRekeys,
  newRekeyCode,
  REKEY_TTL_MS,
  rekeyExpiresAt,
  rekeyState,
  rekeyUrl,
} from "./rekeys.ts";

const now = new Date("2026-12-10T10:00:00Z");
const later = new Date(now.getTime() + 1);
const earlier = new Date(now.getTime() - 1);

describe("rekey links", () => {
  it("mint unguessable codes", () => {
    const a = newRekeyCode();
    expect(a).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(newRekeyCode()).not.toBe(a);
  });

  it("last half an hour, or a week from the console", () => {
    expect(rekeyExpiresAt(now).getTime() - now.getTime()).toBe(REKEY_TTL_MS);
    expect(rekeyExpiresAt(now, CONSOLE_REKEY_TTL_MS).getTime() - now.getTime()).toBe(
      CONSOLE_REKEY_TTL_MS,
    );
  });

  it("used beats expired", () => {
    expect(rekeyState({ expiresAt: later, usedAt: null }, now)).toBe("live");
    expect(rekeyState({ expiresAt: earlier, usedAt: null }, now)).toBe("expired");
    expect(rekeyState({ expiresAt: earlier, usedAt: earlier }, now)).toBe("used");
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
