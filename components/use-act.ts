"use client";

import { useState, useTransition } from "react";

type Outcome = { ok: boolean; error?: string } | undefined;

/** The pending/error pair behind every button that calls an action. */
export function useAct(fallback = "That didn't work.") {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const act = (run: () => Promise<Outcome>) =>
    start(async () => {
      setError(null);
      const res = await run();
      if (res && !res.ok) setError(res.error ?? fallback);
    });
  return { pending, error, setError, act };
}
