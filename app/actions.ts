"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  createMarket,
  DataError,
  getMember,
  invite,
  placeBet,
  recordMarketView,
  resolveMarket,
  setLingo,
  switchSides,
} from "@/lib/data";
import type { Side } from "@/lib/engine";
import { isLingoKey, lingoOf } from "@/lib/lingo";
import { llmEnabled, type PolishedDraft, polishMarketDraft } from "@/lib/llm";
import { logger } from "@/lib/logger";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function requireMemberId(): Promise<string> {
  const session = await getSession();
  if (!session) redirect("/signin");
  return session.memberId;
}

function failure(err: unknown): ActionResult {
  if (err instanceof DataError) {
    // Expected rule violations (stake caps, closed markets, …), not faults.
    logger.debug({ reason: err.message }, "action rejected");
    return { ok: false, error: err.message };
  }
  logger.error({ err }, "action failed");
  return { ok: false, error: "Something went wrong. Try again." };
}

/**
 * Every mutation is the same shape: act as the signed-in member, turn a broken
 * rule into a message the panel can show, and revalidate what the write
 * changed. `run` returns whatever extra the caller needs on success.
 */
async function mutate<T extends object>(
  run: (memberId: string) => Promise<T>,
  paths: (result: T) => string[],
): Promise<ActionResult & Partial<T>> {
  const memberId = await requireMemberId();
  let result: T;
  try {
    result = await run(memberId);
  } catch (err) {
    // A failure carries no payload, which TypeScript can't know for a generic
    // T — hence the one cast.
    return failure(err) as ActionResult & Partial<T>;
  }
  for (const path of paths(result)) revalidatePath(path);
  return { ok: true, ...result };
}

export async function betAction(marketId: string, side: Side, pies: number): Promise<ActionResult> {
  return mutate(
    async (memberId) => {
      await placeBet(memberId, marketId, side, pies);
      return {};
    },
    () => ["/", `/market/${marketId}`],
  );
}

export async function switchAction(marketId: string): Promise<ActionResult> {
  return mutate(
    async (memberId) => {
      await switchSides(memberId, marketId);
      return {};
    },
    () => ["/", `/market/${marketId}`],
  );
}

export async function resolveAction(
  marketId: string,
  outcome: Side | "refunded",
  note: string,
): Promise<ActionResult> {
  return mutate(
    async (memberId) => {
      await resolveMarket(marketId, memberId, outcome, note);
      return {};
    },
    () => ["/", `/market/${marketId}`, "/leaderboard"],
  );
}

export async function createMarketAction(
  question: string,
  criteria: string,
): Promise<ActionResult & { marketId?: string }> {
  return mutate(
    async (memberId) => ({ marketId: await createMarket(memberId, question, criteria) }),
    () => ["/"],
  );
}

export async function polishAction(
  question: string,
  criteria: string,
  feedback: string,
): Promise<ActionResult & { draft?: PolishedDraft }> {
  const memberId = await requireMemberId();
  if (!llmEnabled) return { ok: false, error: "The magic isn't switched on for this deploy." };
  if (!question.trim() && !criteria.trim()) {
    return {
      ok: false,
      error: "Write a rough draft first — the magic needs something to work with.",
    };
  }
  try {
    const member = await getMember(memberId);
    const register = lingoOf(member?.lingo ?? "english").register;
    const draft = await polishMarketDraft({ question, criteria }, feedback, register);
    return { ok: true, draft };
  } catch (err) {
    logger.error({ err }, "polish failed");
    return { ok: false, error: "The magic fizzled. Try again." };
  }
}

export async function setLingoAction(lingo: string): Promise<ActionResult> {
  const memberId = await requireMemberId();
  if (!isLingoKey(lingo)) return { ok: false, error: "Pick a lingo from the list." };
  await setLingo(memberId, lingo);
  // The lingo colors copy on every page, including the layout's footer.
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Telemetry, not a mutation: log that the signed-in member opened a
 * prediction. Best-effort — a lost view must never break the page.
 */
export async function recordViewAction(marketId: string): Promise<void> {
  const session = await getSession();
  if (!session) return;
  try {
    await recordMarketView(session.memberId, marketId);
  } catch (err) {
    logger.debug({ err, marketId }, "view not recorded");
  }
}

export async function inviteAction(email: string): Promise<ActionResult> {
  return mutate(
    async (memberId) => {
      await invite(email, memberId);
      return {};
    },
    () => ["/members"],
  );
}
