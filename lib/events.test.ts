import { describe, expect, it } from "vitest";
import {
  decodeEvent,
  EVENT_TYPES,
  EventError,
  type EventPayload,
  encodeEvent,
  parsePayload,
} from "./events.ts";

const samples: EventPayload[] = [
  { t: "market.create", id: "m1", question: "Will it rain?", criteria: "Any drop counts." },
  { t: "call", marketId: "m1", side: "yes", amountC: 300 },
  { t: "switch", marketId: "m1" },
  { t: "resolve", marketId: "m1", outcome: "yes", note: "It poured." },
  { t: "reopen", marketId: "m1" },
  { t: "comment", id: "c1", marketId: "m1", body: "@b no chance", mentions: ["b"] },
  { t: "react", marketId: "m1", kind: "watch", on: true },
  { t: "view", marketId: "m1" },
  {
    t: "bill.rev",
    billId: "b1",
    kind: "expense",
    description: "Dinner",
    currency: "thb",
    split: "equal",
    entries: [
      { memberId: "a", paidC: 120000, participant: true },
      { memberId: "b", paidC: 0, participant: true },
    ],
    onDate: "2026-12-14",
  },
  {
    t: "phrase.keep",
    id: "p1",
    slug: "no-sugar",
    name: "No sugar",
    side: "them",
    heard: "no sugar please",
    said: "ไม่ใส่น้ำตาล",
    roman: "mai sai nam tan",
    language: "th",
    tag: "th-TH",
  },
  { t: "phrase.drop", id: "p1" },
  { t: "member.hello", mkPub: { kty: "EC", crv: "P-256", x: "a", y: "b" } },
  { t: "member.hello" },
  { t: "member.role", memberId: "b", role: "organiser" },
  { t: "trip.rename", name: "Chiang Pai 2" },
];

describe("codec", () => {
  it("round-trips every known type", () => {
    for (const s of samples) expect(decodeEvent(encodeEvent(s))).toEqual(s);
  });

  it("covers every type in the vocabulary with a sample", () => {
    expect(new Set(samples.map((s) => s.t))).toEqual(new Set(EVENT_TYPES));
  });

  it("returns unknown for a type from a newer app instead of throwing", () => {
    const out = parsePayload({ t: "poll.open", id: "x", options: [] });
    expect(out).toEqual({ t: "unknown", was: "poll.open" });
  });

  it("throws on things that are not events", () => {
    expect(() => decodeEvent(new Uint8Array([0xff]))).toThrow(EventError);
    expect(() => parsePayload(null)).toThrow(EventError);
    expect(() => parsePayload([])).toThrow(EventError);
    expect(() => parsePayload({})).toThrow(EventError);
    expect(() => parsePayload({ t: 3 })).toThrow(EventError);
  });
});

describe("shape checks", () => {
  const bad: Array<[string, unknown]> = [
    ["market without a question", { t: "market.create", id: "m", question: " ", criteria: "" }],
    ["call with a fractional amount", { t: "call", marketId: "m", side: "yes", amountC: 1.5 }],
    ["call on no side", { t: "call", marketId: "m", side: "maybe", amountC: 100 }],
    ["resolve to nothing", { t: "resolve", marketId: "m", outcome: "void", note: "" }],
    ["comment on nothing", { t: "comment", id: "c", body: "hi", mentions: [] }],
    [
      "comment on two things",
      { t: "comment", id: "c", marketId: "m", billId: "b", body: "hi", mentions: [] },
    ],
    [
      "comment with non-string mentions",
      { t: "comment", id: "c", marketId: "m", body: "hi", mentions: [1] },
    ],
    ["react of an unknown kind", { t: "react", marketId: "m", kind: "love", on: true }],
    [
      "bill with a bad entry",
      {
        t: "bill.rev",
        billId: "b",
        kind: "expense",
        description: "",
        currency: "thb",
        split: "equal",
        entries: [{ memberId: "a", paidC: "100", participant: true }],
        onDate: "2026-01-01",
      },
    ],
    [
      "bill with an unknown split",
      {
        t: "bill.rev",
        billId: "b",
        kind: "expense",
        description: "",
        currency: "thb",
        split: "thirds",
        entries: [],
        onDate: "2026-01-01",
      },
    ],
    [
      "phrase with no language",
      {
        t: "phrase.keep",
        id: "p",
        slug: "s",
        name: "n",
        side: "us",
        heard: "",
        said: "x",
        tag: "t",
      },
    ],
    ["hello with a string key", { t: "member.hello", mkPub: "not a jwk" }],
    ["role that is not one", { t: "member.role", memberId: "b", role: "founder" }],
    ["rename to nothing", { t: "trip.rename", name: "" }],
  ];

  for (const [label, value] of bad) {
    it(`refuses a ${label}`, () => {
      expect(() => parsePayload(value)).toThrow(EventError);
    });
  }

  it("accepts a well-formed but rule-breaking call — the cap is replay's job", () => {
    expect(parsePayload({ t: "call", marketId: "m", side: "yes", amountC: 100_000_000 })).toEqual({
      t: "call",
      marketId: "m",
      side: "yes",
      amountC: 100_000_000,
    });
  });
});
