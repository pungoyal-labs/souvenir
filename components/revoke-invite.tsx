"use client";

import { revokeInviteAction } from "@/app/actions";
import { ActError, useRefreshingAct } from "./use-act";

/** Kill a link that hasn't been used — a misdirected invite shouldn't linger a week. */
export function RevokeInvite({ code }: { code: string }) {
  const { pending, error, act } = useRefreshingAct();

  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => act(() => revokeInviteAction(code))}
        className="rounded-md px-2 py-1 text-xs text-soft hover:underline disabled:opacity-40"
      >
        Revoke
      </button>
      <ActError error={error} />
    </span>
  );
}
