"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { shutOwnRecoveryAction } from "@/app/actions";
import { timeAgo, timeUntil } from "@/lib/format";
import { routes } from "@/lib/routes";
import { ActError } from "./use-act";

/**
 * A recovery link is a key to this member's seat in somebody else's hand, and
 * this is the half of the announcement aimed at the member it names: on every
 * page, until the link is shut, spent, or expired — and for a spent one, until
 * they have had a week to notice the passkey it added. The trip's members page
 * tells the table; being impossible to miss is the check on the whole
 * mechanism, so a member who never asked can stop it in the one tap.
 */
export function RecoveryNotice({
  live,
  usedAt,
}: {
  /** The one live link to this seat, if any. */
  live: { code: string; expiresAt: Date } | null;
  /** When a link to this seat was last walked through, within the notice window. */
  usedAt: Date | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mx-auto mt-4 max-w-5xl px-4">
      <div className="card flex flex-wrap items-center gap-x-4 gap-y-3 border-no/40 bg-no-tint px-4 py-3">
        <div className="min-w-0 flex-1">
          {live ? (
            <>
              <p className="font-semibold">A recovery link to your seat is live.</p>
              <p className="text-sm text-soft">
                An organiser minted it — whoever opens it adds a passkey that signs in as you. It
                expires {timeUntil(live.expiresAt)}. If you asked for it, carry on; if you didn't,
                shut it now and ask your organisers who did.
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold">A recovery link added a passkey to your account.</p>
              <p className="text-sm text-soft">
                It was used {usedAt ? timeAgo(usedAt) : "recently"}. If that was you on a new
                device, all good. If not,{" "}
                <Link href={routes.account} className="text-felt hover:underline">
                  remove that passkey
                </Link>{" "}
                and tell an organiser.
              </p>
            </>
          )}
          <ActError error={error} block />
        </div>
        {live && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const res = await shutOwnRecoveryAction(live.code);
                if (!res.ok) setError(res.error ?? "That didn't work.");
                else router.refresh();
              })
            }
            className="rounded-md bg-no px-4 py-2 text-sm font-semibold text-white hover:bg-no-press disabled:opacity-60"
          >
            Shut it
          </button>
        )}
      </div>
    </div>
  );
}
