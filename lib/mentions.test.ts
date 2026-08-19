import { describe, expect, it } from "vitest";
import { parseMentions, segmentBody } from "./mentions.ts";

const ana = { id: "ana", name: "Ana Rao" };
const bo = { id: "bo", name: "Bo Chen" };
const samir = { id: "samir", name: "Samir Iyer" };
const sam = { id: "sam", name: "Sam Kulkarni" };
const group = [ana, bo, samir, sam];

describe("parseMentions", () => {
  it("matches a full name", () => {
    expect(parseMentions("nice call @Ana Rao", group)).toEqual(["ana"]);
  });

  it("matches a first name", () => {
    expect(parseMentions("@Bo pay up", group)).toEqual(["bo"]);
  });

  it("is case-insensitive", () => {
    expect(parseMentions("oi @ana RAO and @BO", group)).toEqual(["ana", "bo"]);
  });

  it("prefers the longest match — @Samir is Samir, never Sam + 'ir'", () => {
    expect(parseMentions("@Samir knows", group)).toEqual(["samir"]);
    expect(parseMentions("@Sam knows", group)).toEqual(["sam"]);
  });

  it("requires a word boundary after the name", () => {
    expect(parseMentions("@Boa is not Bo", group)).toEqual([]);
    expect(parseMentions("@Bo, right?", group)).toEqual(["bo"]);
  });

  it("ignores an @ glued to a word, like an email address", () => {
    expect(parseMentions("mail ana@bo.example please", group)).toEqual([]);
  });

  it("dedupes repeat mentions of the same member", () => {
    expect(parseMentions("@Bo @Bo @Bo", group)).toEqual(["bo"]);
  });

  it("tags everyone a shared first name could mean", () => {
    const twins = [
      { id: "p1", name: "Puneet Goyal" },
      { id: "p2", name: "Puneet Kumar" },
    ];
    expect(parseMentions("@Puneet ?", twins)).toEqual(["p1", "p2"]);
    expect(parseMentions("@Puneet Kumar ?", twins)).toEqual(["p2"]);
  });

  it("returns nothing for unknown names or an empty member list", () => {
    expect(parseMentions("@Nobody home", group)).toEqual([]);
    expect(parseMentions("@Ana", [])).toEqual([]);
  });

  it("survives a blank member name without matching every @", () => {
    expect(parseMentions("@ hello", [{ id: "x", name: "  " }])).toEqual([]);
  });
});

describe("segmentBody", () => {
  it("splits a body into plain and mention segments", () => {
    expect(segmentBody("ok @Bo pay @Ana Rao now", group)).toEqual([
      { text: "ok " },
      { text: "@Bo", memberId: "bo" },
      { text: " pay " },
      { text: "@Ana Rao", memberId: "ana" },
      { text: " now" },
    ]);
  });

  it("returns one plain segment when nothing is tagged", () => {
    expect(segmentBody("no tags here", group)).toEqual([{ text: "no tags here" }]);
  });

  it("only highlights the members actually stored as mentioned", () => {
    expect(segmentBody("@Bo and @Ana", [bo])).toEqual([
      { text: "@Bo", memberId: "bo" },
      { text: " and @Ana" },
    ]);
  });

  it("round-trips: parsing what it segments finds the same members", () => {
    const body = "@Sam owes @Bo, per @Ana Rao";
    const ids = parseMentions(body, group);
    const highlighted = segmentBody(body, group)
      .filter((s) => s.memberId)
      .map((s) => s.memberId);
    expect(highlighted).toEqual(ids);
  });
});
