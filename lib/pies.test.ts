import { describe, expect, it } from "vitest";
import { fmtPct, fmtPies, piesText, toCents } from "./pies.ts";

// The formatter uses the typographic minus (U+2212), not the ASCII hyphen.
const MINUS = "−";

describe("toCents", () => {
  it("converts whole and fractional pies", () => {
    expect(toCents(3)).toBe(300);
    expect(toCents(2.5)).toBe(250);
    expect(toCents(0)).toBe(0);
  });
});

describe("fmtPies", () => {
  it("renders whole amounts without a fraction", () => {
    expect(fmtPies(300)).toBe("3");
    expect(fmtPies(0)).toBe("0");
  });

  it("renders fractions with trailing zeros trimmed", () => {
    expect(fmtPies(250)).toBe("2.5");
    expect(fmtPies(2505)).toBe("25.05");
    expect(fmtPies(233)).toBe("2.33");
  });

  it("always signs negatives, and positives only when asked", () => {
    expect(fmtPies(-250)).toBe(`${MINUS}2.5`);
    expect(fmtPies(250, { sign: true })).toBe("+2.5");
    expect(fmtPies(250)).toBe("2.5");
    expect(fmtPies(0, { sign: true })).toBe("0");
  });
});

describe("piesText", () => {
  it("appends the pie symbol", () => {
    expect(piesText(150)).toBe("1.5π");
    expect(piesText(-100, { sign: true })).toBe(`${MINUS}1π`);
  });
});

describe("fmtPct", () => {
  it("signs and rounds to whole percent", () => {
    expect(fmtPct(0.5)).toBe("+50%");
    expect(fmtPct(-0.25)).toBe(`${MINUS}25%`);
    expect(fmtPct(0)).toBe("0%");
    expect(fmtPct(0.333)).toBe("+33%");
  });
});
