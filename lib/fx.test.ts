import { describe, expect, it } from "vitest";
import {
  combinedNets,
  combinedPlan,
  convertNets,
  FX_SURCHARGE_BPS,
  FxError,
  type FxRate,
  fmtRate,
  inHome,
  parseRate,
  roundToSum,
} from "./fx.ts";
import type { Currency } from "./split.ts";

const thbInr: FxRate = { from: "thb", to: "inr", rate: 2.6, asOf: "2026-08-25" };

describe("parseRate", () => {
  it("reads currency-api's shape", () => {
    const body = { date: "2026-08-25", thb: { inr: 2.61, usd: 0.03 } };
    expect(parseRate(body, "thb", "inr")).toEqual({
      from: "thb",
      to: "inr",
      rate: 2.61,
      asOf: "2026-08-25",
    });
  });

  it("is null for anything that isn't a positive rate on a dated table", () => {
    expect(parseRate(null, "thb", "inr")).toBeNull();
    expect(parseRate({ date: "2026-08-25" }, "thb", "inr")).toBeNull();
    expect(parseRate({ date: "2026-08-25", thb: {} }, "thb", "inr")).toBeNull();
    expect(parseRate({ date: "2026-08-25", thb: { inr: "2.6" } }, "thb", "inr")).toBeNull();
    expect(parseRate({ date: "2026-08-25", thb: { inr: 0 } }, "thb", "inr")).toBeNull();
    expect(parseRate({ date: "2026-08-25", thb: { inr: -1 } }, "thb", "inr")).toBeNull();
    expect(parseRate({ date: "yesterday", thb: { inr: 2.6 } }, "thb", "inr")).toBeNull();
    expect(parseRate({ thb: { inr: 2.6 } }, "thb", "inr")).toBeNull();
  });
});

describe("inHome", () => {
  it("applies the rate and the 5% forex charge", () => {
    expect(FX_SURCHARGE_BPS).toBe(500);
    // ฿100 at 2.6 = ₹260, plus 5% = ₹273.
    expect(inHome(10_000, thbInr)).toBeCloseTo(27_300, 6);
    expect(inHome(-10_000, thbInr)).toBeCloseTo(-27_300, 6);
    expect(inHome(10_000, thbInr, 0)).toBeCloseTo(26_000, 6);
  });
});

describe("roundToSum", () => {
  it("hands leftover units to the largest fractions, ties by position", () => {
    expect(roundToSum([1.5, 2.5, 3.0], 8)).toEqual([2, 3, 3]);
    expect(roundToSum([0.4, 0.4, 0.2], 1)).toEqual([1, 0, 0]);
    expect(roundToSum([-1.5, 1.5], 0)).toEqual([-1, 1]);
    expect(roundToSum([], 0)).toEqual([]);
  });

  it("refuses a total the values can't reach", () => {
    expect(() => roundToSum([1.2, 1.2], 5)).toThrow(FxError);
    expect(() => roundToSum([1.2, 1.2], 1)).toThrow(FxError);
    expect(() => roundToSum([1.2], 1.5)).toThrow(FxError);
  });

  it("never returns -0", () => {
    for (const v of roundToSum([-0.4, 0.4], 0)) expect(Object.is(v, -0)).toBe(false);
  });
});

describe("convertNets", () => {
  it("reads foreign nets in the home currency, surcharge included", () => {
    const net = new Map([
      ["a", 60_000],
      ["b", -30_000],
      ["c", -30_000],
    ]);
    expect([...convertNets(net, thbInr)]).toEqual([
      ["a", 163_800],
      ["b", -81_900],
      ["c", -81_900],
    ]);
  });

  it("keeps the zero-sum at any rate, each line within a paisa of exact (fuzz)", () => {
    for (let round = 0; round < 300; round++) {
      const n = 2 + Math.floor(Math.random() * 7);
      const net = new Map<string, number>();
      let sum = 0;
      for (let i = 0; i < n - 1; i++) {
        const c = Math.floor(Math.random() * 2_000_000) - 1_000_000;
        net.set(`m${i}`, c);
        sum += c;
      }
      net.set(`m${n - 1}`, sum === 0 ? 0 : -sum);
      const rate: FxRate = { ...thbInr, rate: 10 ** (Math.random() * 6 - 3) };

      const converted = convertNets(net, rate);
      let total = 0;
      for (const [id, c] of converted) {
        expect(Number.isInteger(c)).toBe(true);
        expect(Math.abs(c - inHome(net.get(id) ?? 0, rate))).toBeLessThan(1);
        total += c;
      }
      expect(total).toBe(0);
    }
  });
});

describe("combinedNets", () => {
  const byCurrency = new Map<Currency, Map<string, number>>([
    [
      "inr",
      new Map([
        ["a", -50_000],
        ["b", 50_000],
      ]),
    ],
    [
      "thb",
      new Map([
        ["a", 60_000],
        ["b", -30_000],
        ["c", -30_000],
      ]),
    ],
  ]);

  it("folds both currencies into one home-currency net per member", () => {
    const combined = combinedNets(byCurrency, "inr", thbInr);
    expect(combined.get("a")).toEqual({
      homeC: -50_000,
      foreignC: 60_000,
      foreignHomeC: 163_800,
      netC: 113_800,
    });
    expect(combined.get("b")).toEqual({
      homeC: 50_000,
      foreignC: -30_000,
      foreignHomeC: -81_900,
      netC: -31_900,
    });
    expect(combined.get("c")).toEqual({
      homeC: 0,
      foreignC: -30_000,
      foreignHomeC: -81_900,
      netC: -81_900,
    });
    const total = [...combined.values()].reduce((s, c) => s + c.netC, 0);
    expect(total).toBe(0);
  });

  it("plans the whole trip in the home currency", () => {
    expect(combinedPlan(combinedNets(byCurrency, "inr", thbInr))).toEqual([
      { fromId: "c", toId: "a", amountC: 81_900 },
      { fromId: "b", toId: "a", amountC: 31_900 },
    ]);
  });

  it("is the plain nets when nothing was spent abroad", () => {
    const homeOnly = new Map<Currency, Map<string, number>>([["inr", new Map([["a", 0]])]]);
    expect(combinedNets(homeOnly, "inr", thbInr).get("a")).toEqual({
      homeC: 0,
      foreignC: 0,
      foreignHomeC: 0,
      netC: 0,
    });
  });

  it("refuses a rate into the wrong currency, or a currency it has no rate for", () => {
    expect(() => combinedNets(byCurrency, "thb", thbInr)).toThrow(FxError);
    const three = new Map(byCurrency);
    three.set("usd", new Map([["a", 100]]));
    expect(() => combinedNets(three, "inr", thbInr)).toThrow(FxError);
  });
});

describe("fmtRate", () => {
  it("names one unit of the foreign money in the home money", () => {
    expect(fmtRate({ from: "thb", to: "inr", rate: 2.6123, asOf: "2026-08-25" })).toBe(
      "฿1 = ₹2.61",
    );
  });

  it("grows the unit until it buys something", () => {
    expect(fmtRate({ from: "vnd", to: "inr", rate: 0.0033, asOf: "2026-08-25" })).toBe(
      "₫1,000 = ₹3.30",
    );
    expect(fmtRate({ from: "idr", to: "inr", rate: 0.0053, asOf: "2026-08-25" })).toBe(
      "Rp1,000 = ₹5.30",
    );
  });
});
