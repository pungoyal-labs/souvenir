"use client";

import { useRouter } from "next/navigation";
import { joinAsMemberAction } from "@/app/actions";
import { routes } from "@/lib/routes";
import { useTakeKey } from "./take-key";
import { useAct } from "./use-act";

/**
 * A member of one trip holding a link to another: one tap seats them, with the
 * link's key put away first. Already seated, the tap only takes the key.
 */
export function JoinAsMember({
  code,
  name,
  tripName,
  seated,
}: {
  code: string;
  name: string;
  tripName: string;
  seated?: boolean;
}) {
  const router = useRouter();
  const takeKey = useTakeKey();
  const { pending, error, act } = useAct();
  const join = () =>
    act(async () => {
      const res = await joinAsMemberAction(code);
      const tripId = res.tripId;
      if (!res.ok || !tripId) return { ok: false, error: res.error };
      const refused = await takeKey({ code, purpose: "invite", tripId, key: res.key });
      if (refused) return { ok: false, error: refused };
      router.push(routes.trip(tripId));
    });
  return (
    <div className="mt-5">
      <button
        type="button"
        disabled={pending}
        onClick={join}
        className="block w-full rounded-md bg-felt py-3 font-semibold text-white hover:bg-felt-deep disabled:opacity-40"
      >
        {pending
          ? seated
            ? "Taking the key…"
            : "Taking a seat…"
          : seated
            ? "Take this link's key on this phone"
            : `Join ${tripName} as ${name}`}
      </button>
      {error && <p className="mt-2 text-sm font-semibold text-no-deep">{error}</p>}
    </div>
  );
}
