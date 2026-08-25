import { notFound } from "next/navigation";
import { MemberPage } from "@/components/member-page";
import { Sealed } from "@/components/sealed";
import { isOrganiser, listRecoveries, membersOf } from "@/lib/data";
import { env } from "@/lib/env";
import { recoveryUrl } from "@/lib/recovery";
import { requireTrip } from "@/lib/session";

export default async function MemberRoute({
  params,
}: {
  params: Promise<{ tripId: string; id: string }>;
}) {
  const { tripId, id } = await params;
  const ctx = await requireTrip(tripId);
  const member = (await membersOf(tripId)).find((m) => m.id === id);
  if (!member) notFound();

  // Only an organiser looking at somebody else's page can mint a way back in.
  const recoveries =
    isOrganiser(ctx) && member.id !== ctx.me.id ? await listRecoveries(tripId) : null;
  const live = recoveries?.live.find((r) => r.member.id === member.id)?.row ?? null;

  return (
    <Sealed>
      <MemberPage
        memberId={member.id}
        minResolved={env.RANKED_MIN_RESOLVED}
        liveRecovery={
          live && {
            code: live.code,
            url: recoveryUrl(env.AUTH_URL, live.code),
            expiresAt: live.expiresAt,
          }
        }
      />
    </Sealed>
  );
}
