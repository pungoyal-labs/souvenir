"use client";

import { setRoleAction } from "@/app/actions";
import { useOpenTrip } from "./trip-store";
import { ActError, useRefreshingAct } from "./use-act";

/**
 * Who organises, as a thing organisers hand to each other on a trip. The seat row and the
 * `member.role` event land together (lib/data.ts setRole), so the server and every phone agree.
 * Stepping yourself down is allowed; stepping the last organiser down is not.
 */
export function OrganiserToggle({
  tripId,
  memberId,
  memberName,
  isOrganiser,
  isMe,
}: {
  tripId: string;
  memberId: string;
  memberName: string;
  isOrganiser: boolean;
  isMe: boolean;
}) {
  const { sealEvent, refresh } = useOpenTrip();
  const { pending, error, act } = useRefreshingAct();
  const who = isMe ? "You" : memberName;
  const role = isOrganiser ? "member" : "organiser";

  return (
    <div className="card px-4 py-3">
      <p className="text-sm">
        {isOrganiser
          ? `${who} can invite people, shut links, reopen a wrong verdict, and mint a recovery link for anyone on this trip.`
          : `${who} can't invite anyone to this trip — only organisers can.`}
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          act(async () => {
            const sealed = await sealEvent({ t: "member.role", memberId, role });
            if (!sealed.ok) return sealed;
            const res = await setRoleAction(tripId, memberId, role, sealed.envelope);
            if (res.ok) await refresh();
            return res;
          })
        }
        className="btn btn-line mt-2 px-3 py-2 text-sm"
      >
        {pending
          ? "Saving…"
          : isOrganiser
            ? isMe
              ? "Step down"
              : `Step ${memberName} down`
            : `Make ${isMe ? "myself" : memberName} an organiser`}
      </button>
      <ActError error={error} block />
    </div>
  );
}
