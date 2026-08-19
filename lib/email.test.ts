import { describe, expect, it } from "vitest";
import { normalizeEmail } from "./email.ts";

describe("normalizeEmail", () => {
  it("lowercases and trims every address", () => {
    expect(normalizeEmail("  Jane.Doe@Example.COM ")).toBe("jane.doe@example.com");
  });

  it("drops dots in gmail and googlemail local parts", () => {
    expect(normalizeEmail("j.doe@gmail.com")).toBe("jdoe@gmail.com");
    expect(normalizeEmail("j.o.h.n@googlemail.com")).toBe("john@googlemail.com");
  });

  it("keeps dots for every other domain — they can be significant there", () => {
    expect(normalizeEmail("j.doe@example.com")).toBe("j.doe@example.com");
    expect(normalizeEmail("j.doe@notgmail.com")).toBe("j.doe@notgmail.com");
  });

  it("keeps plus-tags: they are a different Google account, not a spelling", () => {
    expect(normalizeEmail("jdoe+bets@gmail.com")).toBe("jdoe+bets@gmail.com");
  });

  it("canonicalizes the same mailbox typed two ways to one spelling", () => {
    expect(normalizeEmail("J.Doe@gmail.com")).toBe(normalizeEmail("jdoe@GMAIL.com"));
  });

  it("returns malformed input lowercased rather than throwing", () => {
    expect(normalizeEmail("not-an-email")).toBe("not-an-email");
    expect(normalizeEmail("@gmail.com")).toBe("@gmail.com");
  });
});
