// Talking to somebody who is not in the group.
//
// One page, one job: you speak, the phone says it back in the local language,
// and when it is handed over it goes the other way. Everything this needs to
// know is here — which two languages, which way round a transcript goes, and
// which of a device's voices can say the other one.
//
// The pair is deployment configuration: one group, one trip, set in `.env`.
// The destination decides the language, the voice, and which currency a bill
// is likely in — the last of which is a Postgres enum, and so the one thing a
// new destination cannot get by editing this file alone.
//
// Nothing is stored. A conversation with a stranger lives in the tab and ends
// with it, which is why there is no table behind any of this.

/** Whose turn it is. `them` is always the local side. */
export type Side = "us" | "them";

/** Which of a device's several voices for a language to reach for. */
export type VoicePreference = "female" | "male";

export interface Speaker {
  /** Two-letter code, for the translator. */
  code: string;
  /** BCP-47, for the microphone and the voice. */
  tag: string;
  /** What to call it in a prompt, a heading, and a button. */
  language: string;
  /** Unicode script name, for telling one side's transcript from the other's. */
  script: string;
  /**
   * Who should read it. A phone usually carries more than one voice per
   * language and picks its own default between them, which is a coin toss —
   * this is the group saying which one they meant. A preference, not a
   * promise: plenty of phones carry exactly one voice for a language, and
   * plenty more do not say in the name which it is.
   */
  voice: VoicePreference;
}

export interface Pair {
  us: Speaker;
  them: Speaker;
  /** Where this is happening, which is what makes a translation idiomatic. */
  place: string;
  /**
   * Whether the local language ends a polite sentence differently depending on
   * who is speaking. Thai does (ครับ/ค่ะ), and it is the first thing a listener
   * notices; most languages do not, and offering the choice would be noise.
   */
  particles: boolean;
  /** ISO 4217 lowercased, matching the bills schema. */
  currency: string;
}

/** Currencies `bills.currency` can hold (lib/split.ts and the drizzle enum). */
const SCHEMA_CURRENCIES = ["inr", "thb"];

const EN: Speaker = {
  code: "en",
  tag: "en-IN",
  language: "English",
  script: "Latin",
  voice: "female",
};
const HI: Speaker = {
  code: "hi",
  tag: "hi-IN",
  language: "Hindi",
  script: "Devanagari",
  voice: "female",
};

/** What the group speaks among themselves. */
export const HOME: Record<string, Speaker> = { en: EN, hi: HI };

/** Where they are. Adding one is a line here, plus a migration if its money is new. */
export const DESTINATIONS: Record<string, Omit<Pair, "us">> = {
  TH: {
    them: { code: "th", tag: "th-TH", language: "Thai", script: "Thai", voice: "male" },
    place: "Thailand",
    particles: true,
    currency: "thb",
  },
  IN: {
    them: HI,
    place: "India",
    particles: false,
    currency: "inr",
  },
};

export class PairError extends Error {}

/**
 * The configured pair, or a refusal naming the half that is wrong. Checked at
 * boot: a typo should stop the server, not be discovered in front of a driver.
 */
export function resolvePair(language: string, country: string): Pair {
  const us = HOME[language.toLowerCase()];
  if (!us) {
    throw new PairError(
      `GROUP_LANGUAGE=${language} is not one of: ${Object.keys(HOME).join(", ")}`,
    );
  }
  const there = DESTINATIONS[country.toUpperCase()];
  if (!there) {
    throw new PairError(
      `GROUP_DESTINATION=${country} is not one of: ${Object.keys(DESTINATIONS).join(", ")}`,
    );
  }
  if (!SCHEMA_CURRENCIES.includes(there.currency)) {
    throw new PairError(
      `${there.place} spends ${there.currency.toUpperCase()}, which bills.currency cannot hold — ` +
        "widen the enum with a migration first.",
    );
  }
  if (us.code === there.them.code) {
    throw new PairError(`The group already speaks ${us.language}; nothing to interpret.`);
  }
  return { us, ...there };
}

export function otherSide(side: Side): Side {
  return side === "us" ? "them" : "us";
}

export function speakerOf(pair: Pair, side: Side): Speaker {
  return side === "us" ? pair.us : pair.them;
}

/** The polite ending, where the local language has one. */
export type Particle = "khrap" | "kha";

export const PARTICLES: Record<Particle, { native: string; roman: string }> = {
  khrap: { native: "ครับ", roman: "khráp" },
  kha: { native: "ค่ะ", roman: "khâ" },
};

/** Longest utterance sent — about a minute of speech, well past a sentence. */
export const MAX_UTTERANCE = 1000;

/** Turns kept on screen. Nothing is stored anywhere. */
export const MAX_TURNS = 40;

export interface Turn {
  id: number;
  side: Side;
  /** What was heard, in the language it was said in. */
  heard: string;
  /** What the other side gets, in theirs. */
  said: string;
  /** Romanisation, so the group can read a turn out loud themselves. */
  roman?: string;
  /** What the translation literally says, for checking before it is spoken. */
  literal?: string;
}

export function appendTurn(turns: readonly Turn[], turn: Turn): Turn[] {
  return [...turns, turn].slice(-MAX_TURNS);
}

export function clampUtterance(text: string): string {
  return text.trim().slice(0, MAX_UTTERANCE);
}

/** Whitespace and stray punctuation are not worth a round trip. */
export function worthSaying(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}

/**
 * Which side a transcript came from, given which button was pressed.
 *
 * The button is the intent and usually right, but the phone gets handed over
 * and nobody presses anything — so a transcript written mostly in the local
 * script is that side whatever the button said. A mixed one (their language
 * plus a stray English word, which recognisers produce constantly) is left to
 * the button, and so is everything when both sides share a script.
 */
export function sideOf(transcript: string, pressed: Side, pair: Pair): Side {
  if (pair.us.script === pair.them.script) return pressed;
  const letters = (transcript.match(/\p{L}/gu) ?? []).length;
  if (letters === 0) return pressed;
  const theirs = (transcript.match(new RegExp(`\\p{Script=${pair.them.script}}`, "gu")) ?? [])
    .length;
  const share = theirs / letters;
  if (share > 0.6) return "them";
  if (share === 0) return "us";
  return pressed;
}

/** The bits of SpeechSynthesisVoice that choosing one needs. */
export interface Voice {
  lang: string;
  name: string;
  localService?: boolean;
  default?: boolean;
}

/**
 * Whether a voice announces itself as a woman's or a man's, or says nothing.
 *
 * There is no field for it — `SpeechSynthesisVoice` carries a name and a tag
 * and nothing else — so the name is all there is to read. Chrome and Windows
 * put the word in ("Google UK English Female", "Microsoft Heera"); Apple uses
 * first names; Android frequently says neither, and those are left alone
 * rather than guessed at. Only the names for the languages this app has any
 * business speaking are listed, and being wrong about one costs a preference,
 * not a voice.
 */
const FEMALE_NAMES =
  /\b(veena|isha|heera|kanya|kalpana|lekha|swara|neerja|shruti|aditi|priya|raveena|ananya|premwadee|achara)\b/;
const MALE_NAMES = /\b(rishi|ravi|hemant|madhur|prabhat|niwat|kritsada|sarawut)\b/;

function genderOf(name: string): VoicePreference | null {
  const n = name.toLowerCase();
  if (/\b(female|woman|girl)\b/.test(n)) return "female";
  if (/\b(male|man|boy)\b/.test(n)) return "male";
  if (FEMALE_NAMES.test(n)) return "female";
  if (MALE_NAMES.test(n)) return "male";
  return null;
}

/**
 * The best voice on this device for a language, or null when it has none.
 *
 * Browsers disagree about all of it: the tag can be `th-TH`, `th_TH` or `th`,
 * names differ between devices, and a phone with no voice for a language just
 * omits it. Region match first, then the language, then the voice the group
 * asked for where the device says which is which, then one that lives on the
 * device — a network voice is the first thing to fail on hotel wifi. The
 * preference sorts below the language on purpose: the wrong voice saying the
 * right language is understood, and the reverse is not.
 */
export function pickVoice(
  voices: readonly Voice[],
  tag: string,
  prefer?: VoicePreference,
): Voice | null {
  const want = tag.toLowerCase().replace("_", "-");
  const base = want.split("-")[0];
  const rank = (v: Voice) => {
    const t = v.lang.toLowerCase().replace("_", "-");
    if (t === want) return 0;
    return t.split("-")[0] === base ? 1 : 2;
  };
  // Asked-for first, then anything that does not say, then the other one.
  const asked = (v: Voice) => {
    if (!prefer) return 1;
    const gender = genderOf(v.name);
    return gender === null ? 1 : gender === prefer ? 0 : 2;
  };
  const candidates = voices.filter((v) => rank(v) < 2);
  if (candidates.length === 0) return null;
  return [...candidates].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      asked(a) - asked(b) ||
      Number(b.localService ?? false) - Number(a.localService ?? false) ||
      Number(b.default ?? false) - Number(a.default ?? false),
  )[0];
}

/**
 * What to tell someone whose phone cannot do part of this. Null when it can.
 * Typing is always there and the words are always on screen, so a missing
 * microphone or voice is a slower way through, never a dead end.
 */
export function warning(can: { listen: boolean; speak: boolean }, language: string): string | null {
  if (!can.listen && !can.speak) {
    return `This phone can't listen or speak. Type instead — the ${language} still comes back written.`;
  }
  if (!can.listen) {
    return `This phone can't listen. Type what you want to say and it comes back in ${language}.`;
  }
  return can.speak
    ? null
    : `No ${language} voice on this phone. Hold the screen up — the words and how to say them are both there.`;
}
