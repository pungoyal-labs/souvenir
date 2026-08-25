"use client";

import { useEffect, useState } from "react";
import { secretFromFragment, unwrapPreview } from "@/lib/keys";
import { stashSecret } from "./take-key";

/** A few open questions, sealed under the link's secret by the phone that minted it. */
export function JoinPreview({ code, sealed }: { code: string; sealed: string | null }) {
  const [questions, setQuestions] = useState<string[] | null>(null);
  useEffect(() => {
    const secret = secretFromFragment(window.location.hash);
    if (!secret || !sealed) return;
    stashSecret(code);
    let cancelled = false;
    unwrapPreview(secret, sealed)
      .then((p) => {
        if (!cancelled) setQuestions(p.questions);
      })
      .catch(() => {
        // A preview that will not open is no preview.
      });
    return () => {
      cancelled = true;
    };
  }, [code, sealed]);
  if (!questions?.length) return null;
  return (
    <ul className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
      {questions.map((q) => (
        <li key={q} className="flex gap-2">
          <span aria-hidden className="text-gold">
            ◆
          </span>
          <span className="font-semibold">{q}</span>
        </li>
      ))}
    </ul>
  );
}

/** The "sign in" on the join page: parks the fragment first. */
export function SignInToJoin({ code, href }: { code: string; href: string }) {
  return (
    <a href={href} onClick={() => stashSecret(code)} className="text-felt hover:underline">
      Sign in
    </a>
  );
}
