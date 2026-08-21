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

export interface MarketDraft {
  question: string;
  criteria: string;
}

export interface PolishedDraft extends MarketDraft {
  rationale: string;
}

const systemPrompt = (
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
  if (!llmEnabled) throw new Error("LLM polish is not configured");

  const client = new Anthropic({
    apiKey: env.LLM_API_KEY,
    baseURL: env.LLM_BASE_URL,
  });

  const userParts = [
    `Draft question: ${draft.question || "(none yet)"}`,
    `Draft resolution criteria: ${draft.criteria || "(none yet)"}`,
  ];
  if (feedback?.trim()) {
    userParts.push(`Creator's notes on the previous suggestion: ${feedback.trim()}`);
  }

  const startedAt = Date.now();
  const response = await client.messages.create({
    model: env.LLM_MODEL,
    max_tokens: 2000,
    system: systemPrompt(register),
    messages: [{ role: "user", content: userParts.join("\n\n") }],
  });
  logger.info(
    { model: env.LLM_MODEL, ms: Date.now() - startedAt, usage: response.usage },
    "market draft polished",
  );

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  return parsePolished(text, draft);
}

function parsePolished(text: string, fallback: MarketDraft): PolishedDraft {
  // Models sometimes wrap JSON in fences or preamble; extract the outer object.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("The model returned something that isn't JSON. Try again.");
  }
  const parsed: unknown = JSON.parse(text.slice(start, end + 1));
  const obj = parsed as Record<string, unknown>;
  const question = typeof obj.question === "string" ? obj.question.trim() : "";
  const criteria = typeof obj.criteria === "string" ? obj.criteria.trim() : "";
  if (!question || !criteria) {
    throw new Error("The model's suggestion was incomplete. Try again.");
  }
  return {
    question: question.slice(0, 200),
    criteria: criteria.slice(0, 2000),
    rationale:
      typeof obj.rationale === "string" && obj.rationale.trim()
        ? obj.rationale.trim()
        : `Tightened from: “${fallback.question}”`,
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
  if (!llmEnabled) throw new Error("Interpreting is not configured");

  const client = new Anthropic({
    apiKey: env.LLM_API_KEY,
    baseURL: env.LLM_BASE_URL,
  });

  const startedAt = Date.now();
  const response = await client.messages.create({
    model: env.LLM_MODEL,
    // A spoken sentence and its gloss. Anything longer is the model rambling.
    max_tokens: 700,
    system: interpretSystem(req),
    messages: [{ role: "user", content: `Target language: ${req.to}\n\nUtterance: ${req.text}` }],
  });
  logger.info(
    { model: env.LLM_MODEL, to: req.to, ms: Date.now() - startedAt, usage: response.usage },
    "utterance interpreted",
  );

  const body = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  return parseInterpretation(body, req.romanise);
}

function parseInterpretation(body: string, romanise: boolean): Interpretation {
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("The interpreter didn't answer in a way this app could read.");
  }
  const parsed = JSON.parse(body.slice(start, end + 1)) as Record<string, unknown>;
  const str = (key: string) =>
    typeof parsed[key] === "string" ? (parsed[key] as string).trim() : "";
  const text = str("text");
  if (!text) throw new Error("The interpreter came back with nothing to say.");
  const note = str("note");
  return {
    text: text.slice(0, 600),
    // A romanisation of Latin text is the text again; drop it rather than
    // print every line twice.
    roman: romanise ? str("roman").slice(0, 600) : "",
    literal: str("literal").slice(0, 600),
    note: note || undefined,
  };
}
