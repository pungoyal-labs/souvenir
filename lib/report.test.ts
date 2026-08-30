import { describe, expect, it } from "vitest";
import { describeError, isNoise, maskPath, reportBudget, tidyReport } from "./report.ts";

describe("maskPath", () => {
  it("replaces the code in a link path", () => {
    expect(maskPath("/join/abc123")).toBe("/join/[code]");
    expect(maskPath("/recover/abc123")).toBe("/recover/[code]");
    expect(maskPath("/k/abc123")).toBe("/k/[code]");
  });

  it("drops the query and the fragment", () => {
    expect(maskPath("/signin?next=%2Ftrips")).toBe("/signin");
    expect(maskPath("/join/abc123?x=1#key")).toBe("/join/[code]");
    expect(maskPath("/t/abc#key")).toBe("/t/abc");
  });

  it("leaves ordinary paths alone", () => {
    expect(maskPath("/t/trip1/p/m1")).toBe("/t/trip1/p/m1");
    expect(maskPath("/join")).toBe("/join");
    expect(maskPath("/")).toBe("/");
    expect(maskPath("")).toBe("");
  });
});

describe("tidyReport", () => {
  const good = {
    kind: "boundary",
    name: "TypeError",
    message: "x is not a function",
    stack: "TypeError: x\n    at f (/_next/static/chunks/a.js:1:2)",
    digest: "123",
    path: "/t/trip1",
  };

  it("keeps a well-formed report", () => {
    expect(tidyReport(good)).toEqual(good);
  });

  it("refuses what is not a report", () => {
    expect(tidyReport(null)).toBeNull();
    expect(tidyReport("boom")).toBeNull();
    expect(tidyReport({ ...good, kind: "telemetry" })).toBeNull();
    expect(tidyReport({ ...good, path: undefined })).toBeNull();
    expect(tidyReport({ ...good, path: "" })).toBeNull();
  });

  it("masks the path and caps every field", () => {
    const long = "x".repeat(10_000);
    const tidy = tidyReport({ ...good, path: "/recover/secret?y=1", message: long, stack: long });
    expect(tidy?.path).toBe("/recover/[code]");
    expect(tidy?.message).toHaveLength(500);
    expect(tidy?.stack).toHaveLength(4000);
  });

  it("fills what is missing rather than failing", () => {
    expect(tidyReport({ kind: "window", path: "/" })).toEqual({
      kind: "window",
      name: "Error",
      message: "",
      stack: null,
      digest: null,
      path: "/",
    });
    expect(tidyReport({ kind: "window", path: "/", name: 7, digest: {} })?.name).toBe("Error");
  });
});

describe("describeError", () => {
  it("reads an Error, digest included", () => {
    const err = Object.assign(new RangeError("too far"), { digest: "d1" });
    const d = describeError(err);
    expect(d.name).toBe("RangeError");
    expect(d.message).toBe("too far");
    expect(d.stack).toContain("too far");
    expect(d.digest).toBe("d1");
  });

  it("copes with anything else thrown", () => {
    expect(describeError("plain")).toEqual({
      name: "Error",
      message: "plain",
      stack: null,
      digest: null,
    });
    expect(describeError(undefined).message).toBe("undefined");
    expect(describeError(Object.assign(new Error("x"), { digest: 5 })).digest).toBeNull();
  });
});

describe("isNoise", () => {
  it("drops what carries nothing", () => {
    expect(isNoise({ name: "Error", message: "Script error." })).toBe(true);
    expect(isNoise({ name: "AbortError", message: "The user aborted a request." })).toBe(true);
    expect(isNoise({ name: "Error", message: "ResizeObserver loop limit exceeded" })).toBe(true);
  });

  it("drops a call to a build the deploy replaced", () => {
    expect(
      isNoise({
        name: "UnrecognizedActionError",
        message: 'Server Action "abc" was not found on the server.',
      }),
    ).toBe(true);
  });

  it("keeps a real one", () => {
    expect(isNoise({ name: "TypeError", message: "x is not a function" })).toBe(false);
  });
});

describe("reportBudget", () => {
  it("takes up to the limit in a window, then refuses", () => {
    const take = reportBudget(2, 1000);
    expect(take(0)).toBe(true);
    expect(take(10)).toBe(true);
    expect(take(20)).toBe(false);
    expect(take(999)).toBe(false);
  });

  it("opens again with the next window", () => {
    const take = reportBudget(1, 1000);
    expect(take(0)).toBe(true);
    expect(take(500)).toBe(false);
    expect(take(1000)).toBe(true);
    expect(take(1001)).toBe(false);
  });
});
