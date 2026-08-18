// Optional LLM polish for market drafts, via any Anthropic-compatible API
// (configured for MiniMax M3 through LLM_BASE_URL / LLM_API_KEY / LLM_MODEL).
// Purely advisory: the creator iterates on the draft before publishing, and
// nothing in the core game depends on this being configured.

import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env.ts";
import { logger } from "./logger.ts";

export const llmEnabled = Boolean(env.LLM_BASE_URL && env.LLM_API_KEY);

export interface MarketDraft {
  question: string;
  criteria: string;
}

export interface PolishedDraft extends MarketDraft {
  rationale: string;
}

const SYSTEM_PROMPT = `You edit draft predictions for a private, zero-sum prediction game among friends. Every market is a single binary question that will later be resolved YES or NO by its creator.

House conventions:
- The question is one sentence, phrased so it is unambiguously answerable YES or NO, with a concrete subject, threshold, place and deadline where relevant. Playful tone is welcome; vagueness is not.
- The resolution criteria state exactly how the creator will decide: what counts, what is measured, who or what is the source of truth, and the moment of measurement. Someone who disagrees with the creator should still agree the criteria were followed.
- Keep the creator's intent and stakes exactly as they meant them. Sharpen; never invent a different bet.
- Question under 200 characters. Criteria under 2000 characters.

Respond with ONLY a JSON object, no markdown fences:
{"question": "...", "criteria": "...", "rationale": "one or two sentences on what you tightened and why"}`;

export async function polishMarketDraft(
  draft: MarketDraft,
  feedback?: string,
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
    system: SYSTEM_PROMPT,
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
