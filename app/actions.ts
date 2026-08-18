"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createMarket, DataError, invite, placeBet, resolveMarket, switchSides } from "@/lib/data";
import type { Side } from "@/lib/engine";
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

function asResult(err: unknown): ActionResult {
  if (err instanceof DataError) {
    // Expected rule violations (stake caps, closed markets, …), not faults.
    logger.debug({ reason: err.message }, "action rejected");
    return { ok: false, error: err.message };
  }
  logger.error({ err }, "action failed");
  return { ok: false, error: "Something went wrong. Try again." };
}

export async function betAction(
  marketId: string,
  side: Side,
  units: number,
): Promise<ActionResult> {
  const memberId = await requireMemberId();
  try {
    await placeBet(memberId, marketId, side, units);
  } catch (err) {
    return asResult(err);
  }
  revalidatePath("/");
  revalidatePath(`/market/${marketId}`);
  return { ok: true };
}

export async function switchAction(marketId: string): Promise<ActionResult> {
  const memberId = await requireMemberId();
  try {
    await switchSides(memberId, marketId);
  } catch (err) {
    return asResult(err);
  }
  revalidatePath("/");
  revalidatePath(`/market/${marketId}`);
  return { ok: true };
}

export async function resolveAction(
  marketId: string,
  outcome: Side | "refunded",
  note: string,
): Promise<ActionResult> {
  const memberId = await requireMemberId();
  try {
    await resolveMarket(marketId, memberId, outcome, note);
  } catch (err) {
    return asResult(err);
  }
  revalidatePath("/");
  revalidatePath(`/market/${marketId}`);
  revalidatePath("/leaderboard");
  return { ok: true };
}

export async function createMarketAction(
  question: string,
  criteria: string,
): Promise<ActionResult & { marketId?: string }> {
  const memberId = await requireMemberId();
  try {
    const marketId = await createMarket(memberId, question, criteria);
    revalidatePath("/");
    return { ok: true, marketId };
  } catch (err) {
    return asResult(err);
  }
}

export async function polishAction(
  question: string,
  criteria: string,
  feedback: string,
): Promise<ActionResult & { draft?: PolishedDraft }> {
  await requireMemberId();
  if (!llmEnabled) return { ok: false, error: "The magic isn't switched on for this deploy." };
  if (!question.trim() && !criteria.trim()) {
    return {
      ok: false,
      error: "Write a rough draft first — the magic needs something to work with.",
    };
  }
  try {
    const draft = await polishMarketDraft({ question, criteria }, feedback);
    return { ok: true, draft };
  } catch (err) {
    logger.error({ err }, "polish failed");
    return { ok: false, error: "The magic fizzled. Try again." };
  }
}

export async function inviteAction(email: string): Promise<ActionResult> {
  const memberId = await requireMemberId();
  try {
    await invite(email, memberId);
  } catch (err) {
    return asResult(err);
  }
  revalidatePath("/members");
  return { ok: true };
}
