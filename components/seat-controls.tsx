"use client";

import { useRouter } from "next/navigation";
import { leaveTripAction, removeMemberAction } from "@/app/actions";
import { routes } from "@/lib/routes";
import { ActError, useAct } from "./use-act";

/**
 * A seat going, either way round. The key the departed phone holds stays
 * theirs — nothing can take it back — so the trip is marked for a rotation,
 * and the next key is one they never get (docs/private-trips.md §4.10).
 */
export function SeatControls({
  tripId,
  memberId,
  name,
  isMe,
  canAdmin,
}: {
  tripId: string;
  memberId: string;
  name: string;
  isMe: boolean;
  canAdmin: boolean;
}) {
  const router = useRouter();
  const { pending, error, act } = useAct();
  if (!isMe && !canAdmin) return null;
  const go = () =>
    act(async () => {
      const ask = isMe
        ? "Leave this trip? This phone keeps the key it holds; an organiser can rotate it afterwards."
        : `Remove ${name} from the trip? The key they hold stays with them; rotate it afterwards.`;
      if (!confirm(ask)) return;
      const res = isMe ? await leaveTripAction(tripId) : await removeMemberAction(tripId, memberId);
      if (res.ok) router.push(isMe ? routes.trips : routes.members(tripId));
      return res;
    });
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={go}
        className="rounded-md border border-no/40 px-3 py-1.5 text-sm font-semibold text-no-deep hover:bg-no-tint disabled:opacity-40"
      >
        {isMe ? "Leave the trip" : "Remove from the trip"}
      </button>
      <ActError error={error} />
    </div>
  );
}
