// Talking to somebody who is not in the group.
//
// One page, one job: you speak, the phone says it back in the local language,
// and when it is handed over it goes the other way. Everything this needs to
// know is here — which two languages, which way round a transcript goes, and
// which of a device's voices can say the other one.
//
// The pair is the trip's configuration: where the group is going and what
// they speak among themselves (lib/trips.ts). The destination decides the
// language, the voice, and which currency a bill is likely in — the last of
// which has to be one lib/split.ts can format, so a new destination is a line
// here and, if its money is new, a line there.
//
// Nothing is stored. A conversation with a stranger lives in the tab and ends
// with it, which is why there is no table behind any of this.

import { CURRENCIES } from "./split.ts";

/** Whose turn it is. `them` is always the local side. */
export type Side = "us" | "them";

/** Who is speaking, as far as a voice or a polite ending can tell. */
export type Gender = "female" | "male";

/** Which of a device's several voices for a language to reach for. */
export type VoicePreference = Gender;

/**
 * A polite ending that depends on who is speaking, in a language that has
 * one. `native` and `roman` are what the toggle shows; `prompt` is the rule
 * the interpreter is given, written for that language and nothing else.
 */
export interface Particle {
  native: string;
  roman: string;
  prompt: string;
}

export interface Speaker {
  /** Two-letter code, for the translator. */
  code: string;
  /** BCP-47, for the microphone and the voice. */
  tag: string;
  /** What to call it in a prompt, a heading, and a button. */
  language: string;
  /** A greeting in it, for `pnpm speech:check` to hear a voice say. */
  hello: string;
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
  /**
   * Whether a polite sentence ends differently depending on who is speaking,
   * and how. Thai does (ครับ/ค่ะ), and it is the first thing a listener
   * notices; most languages do not, and offering the choice would be noise —
   * so it is offered only where a speaker names its forms.
   */
  particles?: Record<Gender, Particle>;
}

export interface Pair {
  us: Speaker;
  them: Speaker;
  /** Where this is happening, which is what makes a translation idiomatic. */
  place: string;
  /** ISO 4217 lowercased, matching the bills schema. */
  currency: string;
}

const EN: Speaker = {
  code: "en",
  tag: "en-IN",
  language: "English",
  hello: "Hello, how are you?",
  script: "Latin",
  voice: "female",
};
const HI: Speaker = {
  code: "hi",
  tag: "hi-IN",
  language: "Hindi",
  hello: "नमस्ते, आप कैसे हैं?",
  script: "Devanagari",
  voice: "female",
};

const EN_US: Speaker = { ...EN, tag: "en-US" };
const EN_GB: Speaker = { ...EN, tag: "en-GB" };

/** What the group speaks among themselves. */
export const HOME: Record<string, Speaker> = { en: EN, hi: HI, "en-us": EN_US, "en-gb": EN_GB };

/** One line per place a group can go. The key is the ISO 3166 country code. */
export type Destination = Omit<Pair, "us"> & {
  /** Two-letter country code, what a trip stores. */
  code: string;
  /** Short flag for lists. */
  flag: string;
  /**
   * IANA zone the trip's calendar days run on — a trip ends when its last day
   * does *there*, not at anyone's home midnight. Countries spanning zones get
   * the one their visitors are in (Bali, not Jakarta; the US east coast).
   */
  tz: string;
};

const dest = (
  code: string,
  flag: string,
  place: string,
  currency: string,
  tz: string,
  them: Speaker,
): Destination => ({ code, flag, place, currency, tz, them });

/**
 * Where they are. Ordered by how often an Indian friend group goes there
 * (2025 arrivals), which is the order a picker shows them in. Adding one is a
 * line here, plus a line in lib/split.ts if its money is new.
 */
export const DESTINATIONS: Record<string, Destination> = {
  TH: dest("TH", "🇹🇭", "Thailand", "thb", "Asia/Bangkok", {
    code: "th",
    tag: "th-TH",
    language: "Thai",
    hello: "สวัสดีครับ สบายดีไหม",
    script: "Thai",
    voice: "male",
    particles: {
      male: {
        native: "ครับ",
        roman: "khráp",
        prompt:
          'The speaker is a man using the polite particle ครับ. End polite sentences with it, use ผม for "I", and questions take ครับ.',
      },
      female: {
        native: "ค่ะ",
        roman: "khâ",
        prompt:
          'The speaker is a woman using the polite particle ค่ะ. End polite sentences with it, use ฉัน for "I", and questions take คะ.',
      },
    },
  }),
  AE: dest("AE", "🇦🇪", "Dubai & the UAE", "aed", "Asia/Dubai", {
    code: "ar",
    tag: "ar-AE",
    language: "Arabic",
    hello: "مرحباً، كيف حالك؟",
    script: "Arabic",
    voice: "male",
  }),
  VN: dest("VN", "🇻🇳", "Vietnam", "vnd", "Asia/Ho_Chi_Minh", {
    code: "vi",
    tag: "vi-VN",
    language: "Vietnamese",
    hello: "Xin chào, bạn khỏe không?",
    script: "Latin",
    voice: "female",
  }),
  ID: dest("ID", "🇮🇩", "Bali & Indonesia", "idr", "Asia/Makassar", {
    code: "id",
    tag: "id-ID",
    language: "Indonesian",
    hello: "Halo, apa kabar?",
    script: "Latin",
    voice: "female",
  }),
  MY: dest("MY", "🇲🇾", "Malaysia", "myr", "Asia/Kuala_Lumpur", {
    code: "ms",
    tag: "ms-MY",
    language: "Malay",
    hello: "Hai, apa khabar?",
    script: "Latin",
    voice: "female",
  }),
  LK: dest("LK", "🇱🇰", "Sri Lanka", "lkr", "Asia/Colombo", {
    code: "si",
    tag: "si-LK",
    language: "Sinhala",
    hello: "ආයුබෝවන්, කොහොමද?",
    script: "Sinhala",
    voice: "female",
  }),
  SG: dest("SG", "🇸🇬", "Singapore", "sgd", "Asia/Singapore", EN),
  JP: dest("JP", "🇯🇵", "Japan", "jpy", "Asia/Tokyo", {
    code: "ja",
    tag: "ja-JP",
    language: "Japanese",
    hello: "こんにちは、お元気ですか？",
    script: "Han",
    voice: "female",
  }),
  NP: dest("NP", "🇳🇵", "Nepal", "npr", "Asia/Kathmandu", {
    code: "ne",
    tag: "ne-NP",
    language: "Nepali",
    hello: "नमस्ते, तपाईंलाई कस्तो छ?",
    script: "Devanagari",
    voice: "female",
  }),
  GE: dest("GE", "🇬🇪", "Georgia", "gel", "Asia/Tbilisi", {
    code: "ka",
    tag: "ka-GE",
    language: "Georgian",
    hello: "გამარჯობა, როგორ ხართ?",
    script: "Georgian",
    voice: "female",
  }),
  KZ: dest("KZ", "🇰🇿", "Kazakhstan", "kzt", "Asia/Almaty", {
    code: "ru",
    tag: "ru-RU",
    language: "Russian",
    hello: "Здравствуйте, как дела?",
    script: "Cyrillic",
    voice: "female",
  }),
  PH: dest("PH", "🇵🇭", "Philippines", "php", "Asia/Manila", {
    code: "fil",
    tag: "fil-PH",
    language: "Filipino",
    hello: "Kumusta ka?",
    script: "Latin",
    voice: "female",
  }),
  MV: dest("MV", "🇲🇻", "Maldives", "mvr", "Indian/Maldives", EN_GB),
  KH: dest("KH", "🇰🇭", "Cambodia", "khr", "Asia/Phnom_Penh", {
    code: "km",
    tag: "km-KH",
    language: "Khmer",
    hello: "សួស្តី សុខសប្បាយទេ?",
    script: "Khmer",
    voice: "female",
  }),
  LA: dest("LA", "🇱🇦", "Laos", "lak", "Asia/Vientiane", {
    code: "lo",
    tag: "lo-LA",
    language: "Lao",
    hello: "ສະບາຍດີ, ສະບາຍດີບໍ?",
    script: "Lao",
    voice: "female",
  }),
  GB: dest("GB", "🇬🇧", "United Kingdom", "gbp", "Europe/London", EN_GB),
  US: dest("US", "🇺🇸", "United States", "usd", "America/New_York", EN_US),
  FR: dest("FR", "🇫🇷", "France", "eur", "Europe/Paris", {
    code: "fr",
    tag: "fr-FR",
    language: "French",
    hello: "Bonjour, comment allez-vous ?",
    script: "Latin",
    voice: "female",
  }),
  IT: dest("IT", "🇮🇹", "Italy", "eur", "Europe/Rome", {
    code: "it",
    tag: "it-IT",
    language: "Italian",
    hello: "Buongiorno, come sta?",
    script: "Latin",
    voice: "female",
  }),
  ES: dest("ES", "🇪🇸", "Spain", "eur", "Europe/Madrid", {
    code: "es",
    tag: "es-ES",
    language: "Spanish",
    hello: "Hola, ¿cómo está?",
    script: "Latin",
    voice: "female",
  }),
  IN: dest("IN", "🇮🇳", "India", "inr", "Asia/Kolkata", HI),
};

/** The destinations in picker order. */
export const DESTINATION_LIST: readonly Destination[] = Object.values(DESTINATIONS);

export class PairError extends Error {}

/**
 * The pair a trip interprets between, or a refusal naming the half that is
 * wrong. Checked when a trip is created: a typo should be refused at the form,
 * not discovered in front of a driver. A destination that speaks what the
 * group already speaks is refused too — `pairFor` is the question to ask when
 * "nothing to interpret" is an answer rather than an error.
 */
export function resolvePair(language: string, country: string): Pair {
  const us = HOME[language.toLowerCase()];
  if (!us) {
    throw new PairError(`Home language ${language} is not one of: ${Object.keys(HOME).join(", ")}`);
  }
  const there = DESTINATIONS[country.toUpperCase()];
  if (!there) {
    throw new PairError(
      `Destination ${country} is not one of: ${Object.keys(DESTINATIONS).join(", ")}`,
    );
  }
  if (!(CURRENCIES as readonly string[]).includes(there.currency)) {
    throw new PairError(
      `${there.place} spends ${there.currency.toUpperCase()}, which lib/split.ts cannot format — ` +
        "add it there first.",
    );
  }
  if (us.code === there.them.code) {
    throw new PairError(`The group already speaks ${us.language}; nothing to interpret.`);
  }
  const { code: _code, flag: _flag, ...pair } = there;
  return { us, ...pair };
}

/**
 * The pair for a trip, or null when there is nothing to interpret — an Indian
 * group in Singapore, an English-speaking one in London. Null hides the talk
 * page; it is not a fault. Unknown codes still throw: a trip row holding one
 * is a bug, not a configuration.
 */
export function pairFor(trip: { homeLanguage: string; destination: string }): Pair | null {
  const us = HOME[trip.homeLanguage.toLowerCase()];
  const there = DESTINATIONS[trip.destination.toUpperCase()];
  if (!us || !there) {
    throw new PairError(`Trip has an unknown pair: ${trip.homeLanguage} → ${trip.destination}`);
  }
  if (us.code === there.them.code) return null;
  const { code: _code, flag: _flag, ...pair } = there;
  return { us, ...pair };
}

export function otherSide(side: Side): Side {
  return side === "us" ? "them" : "us";
}

export function speakerOf(pair: Pair, side: Side): Speaker {
  return side === "us" ? pair.us : pair.them;
}

/**
 * A deploy's server-side voices, one per language, from a spec like
 * `th=Thai_male_1_sample8,hi=hindi_female_1_v2`. Which voice says which
 * language is configuration: the ids are one vendor's catalogue, checked
 * against that vendor, and nothing in code should know them. Blank and
 * malformed entries are dropped rather than refused — a missing voice costs
 * the server's fallback for that side, never the page.
 */
export function serverVoices(spec: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of spec.split(",")) {
    const eq = entry.indexOf("=");
    if (eq === -1) continue;
    const code = entry.slice(0, eq).trim().toLowerCase();
    const voice = entry.slice(eq + 1).trim();
    if (code && voice) out[code] = voice;
  }
  return out;
}

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
 * rather than guessed at. The lists are the names met so far, not a catalogue:
 * a voice whose name is not here still gets picked for its language, and being
 * wrong about one costs a preference, not a voice.
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
 * Browsers disagree about all of it: a tag can be `xx-XX`, `xx_XX` or `xx`,
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
