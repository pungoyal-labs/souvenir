"use client";

import { beginPasskeySignInAction, finishPasskeySignInAction } from "@/app/actions";
import { getCredential } from "@/components/passkeys";
import { useAct } from "./use-act";

/** One button, no field to type in: the signature decides who you are. On success the action redirects. */
export function PasskeySignIn({ next }: { next?: string }) {
  const { pending, error, act } = useAct("That passkey didn't work.");

  const signIn = () =>
    act(async () => {
      const got = await getCredential(beginPasskeySignInAction);
      if ("error" in got) return { ok: false, error: got.error };
      // The PRF key is already kept, so the keyring restores from this passkey's backup on the next page.
      const result = await finishPasskeySignInAction(got.wire, next);
      // Success redirects, so anything returned here is a refusal.
      return { ok: false, error: result.error };
    });

  return (
    <div>
      <button
        type="button"
        onClick={signIn}
        disabled={pending}
        className="btn btn-felt block w-full py-3"
      >
        {pending ? "Waiting for your device…" : "Sign in with a passkey"}
      </button>
      {error && <p className="mt-2 text-sm font-semibold text-no-deep">{error}</p>}
    </div>
  );
}
