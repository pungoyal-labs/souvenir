import { describe, expect, it } from "vitest";
import { computePositions, type MarketEvent, refundAll, type Side, settle } from "./engine.ts";

const bet = (memberId: string, side: Side, units: number): MarketEvent => ({
  memberId,
  kind: "bet",
  side,
  amountC: units * 100,
});

describe("computePositions", () => {
  it("accumulates bets per side", () => {
    const pos = computePositions([bet("a", "yes", 3), bet("a", "yes", 2), bet("b", "no", 4)]);
    expect(pos.get("a")).toEqual({ yesC: 500, noC: 0 });
    expect(pos.get("b")).toEqual({ yesC: 0, noC: 400 });
  });

  it("moves stake on switch without changing exposure", () => {
    const pos = computePositions([
      bet("a", "yes", 5),
      { memberId: "a", kind: "switch", side: "no", amountC: 500 },
      bet("a", "no", 2),
    ]);
    expect(pos.get("a")).toEqual({ yesC: 0, noC: 700 });
  });

  it("rejects a switch larger than the held stake", () => {
    expect(() =>
      computePositions([
        bet("a", "yes", 2),
        { memberId: "a", kind: "switch", side: "no", amountC: 300 },
      ]),
    ).toThrow();
  });
});

describe("settle", () => {
  it("matches the spec example: 10 YES of 40, pool 100 → 25", () => {
    const pos = computePositions([bet("p", "yes", 10), bet("q", "yes", 30), bet("r", "no", 60)]);
    const res = settle(pos, "yes");
    expect(res.payoutsC.get("p")).toBe(2500);
    expect(res.payoutsC.get("q")).toBe(7500);
    expect(res.payoutsC.has("r")).toBe(false);
    expect(res.autoRefunded).toBe(false);
  });

  it("distributes remainder cents so the pool sums exactly (3-way split of 100)", () => {
    const pos = computePositions([
      bet("a", "yes", 1),
      bet("b", "yes", 1),
      bet("c", "yes", 1),
      bet("d", "no", 97),
    ]);
    const res = settle(pos, "yes");
    const total = [...res.payoutsC.values()].reduce((s, x) => s + x, 0);
    expect(total).toBe(10000);
    const shares = [...res.payoutsC.values()].sort((x, y) => x - y);
    expect(shares).toEqual([3333, 3333, 3334]);
  });

  it("refunds everyone when the winning side is empty", () => {
    const pos = computePositions([bet("a", "no", 5), bet("b", "no", 3)]);
    const res = settle(pos, "yes");
    expect(res.autoRefunded).toBe(true);
    expect(res.payoutsC.get("a")).toBe(500);
    expect(res.payoutsC.get("b")).toBe(300);
  });

  it("stays zero-sum under fuzzing", () => {
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    for (let trial = 0; trial < 500; trial++) {
      const events: MarketEvent[] = [];
      const n = 2 + Math.floor(rand() * 8);
      for (let i = 0; i < n; i++) {
        const id = `m${i}`;
        events.push(bet(id, rand() < 0.5 ? "yes" : "no", 1 + Math.floor(rand() * 10)));
        if (rand() < 0.3) {
          events.push(bet(id, rand() < 0.5 ? "yes" : "no", 1 + Math.floor(rand() * 3)));
        }
      }
      // Positions here may hold both sides (fuzz only — app enforces one side).
      const pos = computePositions(events);
      const winner: Side = rand() < 0.5 ? "yes" : "no";
      const res = settle(pos, winner);
      const paid = [...res.payoutsC.values()].reduce((s, x) => s + x, 0);
      expect(paid).toBe(res.totalPoolC);
      for (const v of res.payoutsC.values()) expect(v).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("refundAll", () => {
  it("returns each participant exactly their committed stake", () => {
    const pos = computePositions([
      bet("a", "yes", 7),
      bet("b", "no", 2),
      { memberId: "a", kind: "switch", side: "no", amountC: 700 },
    ]);
    const refunds = refundAll(pos);
    expect(refunds.get("a")).toBe(700);
    expect(refunds.get("b")).toBe(200);
  });
});
