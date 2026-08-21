import { describe, expect, it } from "vitest";
import { CURRENCIES } from "./split.ts";
import {
  appendTurn,
  clampUtterance,
  DESTINATIONS,
  HOME,
  MAX_TURNS,
  MAX_UTTERANCE,
  otherSide,
  type Pair,
  PairError,
  pickVoice,
  resolvePair,
  type Side,
  sideOf,
  speakerOf,
  type Turn,
  type Voice,
  warning,
  worthSaying,
} from "./talk.ts";

/** The pair this ships with, and the one every failure will be about. */
const THAI = resolvePair("en", "TH");

describe("the pair", () => {
  it("resolves the default", () => {
    expect(THAI.us.language).toBe("English");
    expect(THAI.them.language).toBe("Thai");
    expect(THAI.them.tag).toBe("th-TH");
    expect(THAI.place).toBe("Thailand");
    expect(THAI.currency).toBe("thb");
    expect(THAI.particles).toBe(true);
  });

  it("does not care how the codes were typed", () => {
    expect(resolvePair("EN", "th").them.code).toBe("th");
  });

  it("only offers destinations whose money a bill can hold", () => {
    for (const there of Object.values(DESTINATIONS)) {
      expect(CURRENCIES as readonly string[]).toContain(there.currency);
    }
  });

  it("names the half that is wrong, and what it would have taken", () => {
    expect(() => resolvePair("xx", "TH")).toThrow(/GROUP_LANGUAGE/);
    expect(() => resolvePair("en", "XX")).toThrow(/GROUP_DESTINATION/);
    expect(() => resolvePair("en", "XX")).toThrow(/TH/);
    expect(() => resolvePair("en", "XX")).toThrow(PairError);
  });

  it("refuses a pair with nothing to interpret between", () => {
    expect(() => resolvePair("hi", "IN")).toThrow(/already speaks Hindi/);
  });

  it("tags every language for the microphone and the voice", () => {
    for (const speaker of [
      ...Object.values(HOME),
      ...Object.values(DESTINATIONS).map((d) => d.them),
    ]) {
      expect(speaker.tag.startsWith(`${speaker.code}-`)).toBe(true);
    }
  });
});

describe("sides", () => {
  it("swaps, and knows what each side speaks", () => {
    expect(otherSide("us")).toBe("them");
    expect(otherSide("them")).toBe("us");
    expect(speakerOf(THAI, "them").code).toBe("th");
    expect(speakerOf(THAI, "us").code).toBe("en");
  });
});

describe("sideOf", () => {
  it("believes the script over the button when the phone was handed over", () => {
    expect(sideOf("ไปที่นี่ครับ", "us", THAI)).toBe("them");
    expect(sideOf("take me to the airport", "them", THAI)).toBe("us");
  });

  it("agrees with the button when the button was right", () => {
    expect(sideOf("ไปที่นี่ครับ", "them", THAI)).toBe("them");
    expect(sideOf("take me to the airport", "us", THAI)).toBe("us");
  });

  it("leaves a mixed transcript to whoever pressed the button", () => {
    const mixed = "ไปสนามบิน airport";
    expect(sideOf(mixed, "them", THAI)).toBe("them");
    expect(sideOf(mixed, "us", THAI)).toBe("us");
  });

  it("falls back to the button when there are no letters at all", () => {
    expect(sideOf("…", "them", THAI)).toBe("them");
    expect(sideOf("123", "us", THAI)).toBe("us");
  });

  it("trusts the button entirely when both sides share a script", () => {
    // Hindi against Hindi is refused, but a pair that shares Devanagari would
    // get no evidence from the script and must not pretend otherwise.
    const shared: Pair = {
      ...THAI,
      us: HOME.hi,
      them: { ...HOME.hi, code: "mr", language: "Marathi" },
    };
    expect(sideOf("मला विमानतळावर जायचे आहे", "us", shared)).toBe("us");
    expect(sideOf("मुझे हवाई अड्डे जाना है", "them", shared)).toBe("them");
  });
});

describe("what is worth saying", () => {
  it("trims and caps an utterance", () => {
    expect(clampUtterance("  hello  ")).toBe("hello");
    expect(clampUtterance("x".repeat(MAX_UTTERANCE + 50)).length).toBe(MAX_UTTERANCE);
  });

  it("ignores silence and punctuation", () => {
    expect(worthSaying("")).toBe(false);
    expect(worthSaying("   ")).toBe(false);
    expect(worthSaying("…")).toBe(false);
  });

  it("accepts anything with a word or a number in it", () => {
    expect(worthSaying("hello")).toBe(true);
    expect(worthSaying("สวัสดี")).toBe(true);
    expect(worthSaying("100")).toBe(true);
  });
});

describe("appendTurn", () => {
  const turn = (id: number, side: Side = "us"): Turn => ({
    id,
    side,
    heard: `heard ${id}`,
    said: `said ${id}`,
  });

  it("adds to the end without touching what it was given", () => {
    const before = [turn(1)];
    expect(appendTurn(before, turn(2)).map((t) => t.id)).toEqual([1, 2]);
    expect(before.length).toBe(1);
  });

  it("keeps only the last of a long conversation", () => {
    let turns: Turn[] = [];
    for (let i = 0; i < MAX_TURNS + 10; i++) turns = appendTurn(turns, turn(i));
    expect(turns.length).toBe(MAX_TURNS);
    expect(turns[0].id).toBe(10);
  });
});

describe("pickVoice", () => {
  const voice = (lang: string, name: string, extra: Partial<Voice> = {}): Voice => ({
    lang,
    name,
    ...extra,
  });

  it("takes an exact region match first, then the bare language", () => {
    expect(pickVoice([voice("th", "Generic"), voice("th-TH", "Kanya")], "th-TH")?.name).toBe(
      "Kanya",
    );
    expect(pickVoice([voice("th", "Generic")], "th-TH")?.name).toBe("Generic");
  });

  it("copes with an underscore tag and odd casing", () => {
    expect(pickVoice([voice("TH_th", "Kanya")], "th-TH")?.name).toBe("Kanya");
  });

  it("prefers a voice on the device over one that needs the network", () => {
    const voices = [
      voice("th-TH", "Cloud", { localService: false, default: true }),
      voice("th-TH", "Kanya", { localService: true }),
    ];
    expect(pickVoice(voices, "th-TH")?.name).toBe("Kanya");
  });

  it("falls back to the device default when nothing else separates them", () => {
    const voices = [
      voice("th-TH", "Second", { localService: true }),
      voice("th-TH", "First", { localService: true, default: true }),
    ];
    expect(pickVoice(voices, "th-TH")?.name).toBe("First");
  });

  it("says so rather than returning a voice for the wrong language", () => {
    expect(pickVoice([voice("en-US", "Samantha"), voice("hi-IN", "Lekha")], "th-TH")).toBeNull();
    expect(pickVoice([], "th-TH")).toBeNull();
  });
});

describe("warning", () => {
  it("stays quiet when the phone can do both", () => {
    expect(warning({ listen: true, speak: true }, "Thai")).toBeNull();
  });

  it("says what is missing, in the language the group is facing", () => {
    expect(warning({ listen: false, speak: true }, "Thai")).toContain("Type");
    expect(warning({ listen: true, speak: false }, "Hindi")).toContain("No Hindi voice");
    expect(warning({ listen: false, speak: false }, "Thai")).toContain("written");
  });
});
