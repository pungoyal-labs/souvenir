"use client";

import { useRouter } from "next/navigation";
import { beginRecoveryAction, finishRecoveryAction } from "@/app/actions";
import { createCredential } from "@/components/passkeys";
import { routes } from "@/lib/routes";
import { useTakeKey } from "./take-key";
import { useAct } from "./use-act";

/** Coming back: a new passkey on the seat the link names, nothing to pick. */
export function RecoverForm({ code, name }: { code: string; name: string }) {
  const router = useRouter();
  const takeKey = useTakeKey();
  const { pending, error, setError, act } = useAct();

  const recover = () =>
    act(async () => {
      const made = await createCredential(() => beginRecoveryAction(code), "added");
      if ("error" in made) return { ok: false, error: made.error };
      const result = await finishRecoveryAction({ code, response: made.wire });
      if (!result.ok) return result;
      const key = result.key;
      const refused = key && (await takeKey({ code, purpose: "recover", tripId: key.tripId, key }));
      if (refused) setError(refused);
      // Their own page, where the passkey list is: land looking at every key that signs in as them.
      router.push(routes.account);
    });

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={recover}
        disabled={pending}
        className="block w-full rounded-md bg-felt py-3 font-semibold text-white hover:bg-felt-deep disabled:opacity-40"
      >
        {pending ? "Waiting for your device…" : `Add a new passkey for ${name}`}
      </button>
      {error && <p className="mt-2 text-sm font-semibold text-no-deep">{error}</p>}
      <p className="mt-3 text-left text-xs text-soft">
        Any passkeys {name} still holds keep working — this adds one, it never takes one away. The
        old ones are on {name}'s own page, to remove once you're back in.
      </p>
    </div>
  );
}
