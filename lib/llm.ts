// The model, for the two things in this app that need one: polishing a
// prediction draft before it is published, and interpreting between the group
// and whoever they are standing in front of.
//
// Any Anthropic-compatible API (configured for MiniMax M3 through
// LLM_BASE_URL / LLM_API_KEY / LLM_MODEL). Both features are optional and
// hidden when it is unset — the game does not depend on this, and the Thai
// page still has its phrasebook.

import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env.ts";
import { logger } from "./logger.ts";
import type { Particle } from "./talk.ts";

export const llmEnabled = Boolean(env.LLM_BASE_URL && env.LLM_API_KEY);

/** Somebody is waiting on a phone; a model that has not answered by now is not going to. */
const TIMEOUT_MS = 30_000;

/**
 * One request, one JSON object back. Both prompts ask for bare JSON and both
 * get fences or preamble now and then, so the outer object is cut out here.
 */
async function askForJson(
  what: string,
  system: string,
  user: string,
  maxTokens: number,
  context: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  if (!llmEnabled) throw new Error(`${what}: LLM is not configured`);
  const client = new Anthropic({
    apiKey: env.LLM_API_KEY,
    baseURL: env.LLM_BASE_URL,
    timeout: TIMEOUT_MS,
    maxRetries: 1,
  });
  const startedAt = Date.now();
  const response = await client.messages.create({
    model: env.LLM_MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  logger.info(
    { model: env.LLM_MODEL, ms: Date.now() - startedAt, usage: response.usage, ...context },
    what,
  );
  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("The model returned something that isn't JSON. Try again.");
  }
  const parsed: unknown = JSON.parse(text.slice(start, end + 1));
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("The model returned something that isn't JSON. Try again.");
  }
  return parsed as Record<string, unknown>;
}

/** A string field, trimmed and capped; empty when absent. */
function field(obj: Record<string, unknown>, key: string, max: number): string {
  const value = obj[key];
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// --- Polishing a draft ---------------------------------------------------

export interface MarketDraft {
  question: string;
  criteria: string;
}

export interface PolishedDraft extends MarketDraft {
  rationale: string;
}

const polishSystem = (
  register: string,
) => `You edit draft predictions for a private, zero-sum prediction game among friends. Every prediction is a single binary question that will later be resolved YES or NO by its creator.

House conventions:
- The question is one sentence, phrased so it is unambiguously answerable YES or NO, with a concrete subject, threshold, place and deadline where relevant. Playful tone is welcome; vagueness is not.
- The resolution criteria state exactly how the creator will decide: what counts, what is measured, who or what is the source of truth, and the moment of measurement. Someone who disagrees with the creator should still agree the criteria were followed.
- Keep the creator's intent and stakes exactly as they meant them. Sharpen; never invent a different bet.
- The creator's register is ${register}. Match the creator's tone; never force slang into a question that was written straight.
- The criteria are read on phones: short sentences, with a blank line between ideas when there are more than two. Never one long unbroken paragraph, and never a word or token longer than about 30 characters.
- Question under 200 characters. Criteria under 2000 characters.

Respond with ONLY a JSON object, no markdown fences:
{"question": "...", "criteria": "...", "rationale": "one or two sentences on what you tightened and why"}`;

export async function polishMarketDraft(
  draft: MarketDraft,
  feedback?: string,
  register = "plain English",
): Promise<PolishedDraft> {
  const userParts = [
    `Draft question: ${draft.question || "(none yet)"}`,
    `Draft resolution criteria: ${draft.criteria || "(none yet)"}`,
  ];
  if (feedback?.trim()) {
    userParts.push(`Creator's notes on the previous suggestion: ${feedback.trim()}`);
  }
  const obj = await askForJson(
    "market draft polished",
    polishSystem(register),
    userParts.join("\n\n"),
    2000,
  );
  const question = field(obj, "question", 200);
  const criteria = field(obj, "criteria", 2000);
  if (!question || !criteria) {
    throw new Error("The model's suggestion was incomplete. Try again.");
  }
  return {
    question,
    criteria,
    rationale: field(obj, "rationale", 1000) || `Tightened from: “${draft.question}”`,
  };
}

// --- Interpreting --------------------------------------------------------

/**
 * One utterance, said again in the other language.
 *
 * Deliberately not the polish prompt with a different instruction glued on.
 * That one is talking to the group and matches whoever's lingo they picked;
 * this one is talking to a stranger, and a sentence with South Bangalore
 * banter pushed through it is not a favour to anybody. Plain, spoken, polite.
 */
export interface Interpretation {
  /** The sentence to say, in the target language. */
  text: string;
  /** Romanisation with tone or stress marks — empty when the target is Latin. */
  roman: string;
  /**
   * What the translation literally says, back in the speaker's own language.
   * The one guard against a confident mistranslation: they read it before the
   * phone says anything on their behalf.
   */
  literal: string;
  /** Anything the speaker should know — an idiom, a register, a missing word. */
  note?: string;
}

export interface InterpretRequest {
  /** What was heard, in whatever language it was said in. */
  text: string;
  /** The language it is going into, named as a person would name it. */
  to: string;
  /** The language it came from. */
  from: string;
  /** Where this conversation is happening, which is what makes it idiomatic. */
  place: string;
  /** True when the target is not written in the Latin alphabet. */
  romanise: boolean;
  /**
   * The speaker's polite ending, where the target language has one. Thai does;
   * most do not, and asking a model to invent one for a language without them
   * produces confident nonsense.
   */
  particle?: Particle;
}

/**
 * The system half, which is stable for a whole conversation — the pair and the
 * place do not change between turns, so the prompt prefix stays identical and
 * only the utterance moves.
 */
function interpretSystem(req: InterpretRequest): string {
  const rules = [
    "- Translate the meaning as it would be said out loud, not word by word. Everyday spoken language as actually used there, not textbook phrasing and not written formal register.",
    "- Keep it short. This is speech: one or two sentences, no preamble, no explanation, no greeting the speaker did not say.",
    "- Numbers, prices and place names matter more than fluency. Keep them exact. Leave a proper name in its own script if you are not sure of it.",
    "- If the input is garbled or empty of meaning, translate what is there and say so in the note rather than inventing a sentence.",
    "- The note is almost always empty. Write one only when the speaker would say something different if they knew it — an idiom that will not land, a word you had to guess at, a register that is riskier than they intended. Never write a note that says the translation is normal, natural, common, or polite.",
    "- The speaker may be rude, drunk or joking. Interpret it; do not clean it up, refuse it, or comment on it.",
  ];
  if (req.particle) {
    rules.splice(
      2,
      0,
      `- The speaker is using the polite particle ${
        req.particle === "khrap" ? "ครับ (male speaker)" : "ค่ะ / คะ (female speaker)"
      }. End polite sentences accordingly, and use ${
        req.particle === "khrap" ? "ผม" : "ฉัน"
      } for "I". Questions take ${req.particle === "khrap" ? "ครับ" : "คะ"}.`,
    );
  }

  return `You are interpreting live between a visitor and a local in ${req.place}, between ${req.from} and ${req.to}. One utterance at a time, spoken out loud by a phone held between two people.

Rules:
${rules.join("\n")}

Respond with ONLY a JSON object, no markdown fences:
{"text": "the sentence to say", "roman": ${
    req.romanise
      ? '"the translation romanised, with tone or stress marks"'
      : '"an empty string — the target is written in the Latin alphabet"'
  }, "literal": "what your translation literally says, in ${req.from}", "note": "usually omitted; one short sentence only when the speaker needs to know something"}`;
}

/** Interpret one utterance, in whichever direction the pair is pointed. */
export async function interpret(req: InterpretRequest): Promise<Interpretation> {
  const obj = await askForJson(
    "utterance interpreted",
    interpretSystem(req),
    `Target language: ${req.to}\n\nUtterance: ${req.text}`,
    // A spoken sentence and its gloss. Anything longer is the model rambling.
    700,
    { to: req.to },
  );
  const text = field(obj, "text", 600);
  if (!text) throw new Error("The interpreter came back with nothing to say.");
  return {
    text,
    // A romanisation of Latin text is the text again; drop it rather than
    // print every line twice.
    roman: req.romanise ? field(obj, "roman", 600) : "",
    literal: field(obj, "literal", 600),
    note: field(obj, "note", 600) || undefined,
  };
}
