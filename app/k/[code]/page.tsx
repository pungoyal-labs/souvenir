import { RedeemRekey, SignInForKey } from "@/components/rekey";
import { SignedOutCard, SignedOutNotice } from "@/components/signed-out-card";
import { findRekey, getMember, getTrip } from "@/lib/data";
import { type RekeyState, rekeyState } from "@/lib/rekeys";
import { routes, signInThen } from "@/lib/routes";
import { currentMember } from "@/lib/session";
import { placeOf } from "@/lib/trips";

const EYEBROW = "Your key";

// Only the named member's session can spend a rekey link, so a signed-out phone
// is sent to sign in and back here, fragment and all.
export default async function RekeyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const [row, me] = await Promise.all([findRekey(code), currentMember()]);
  const state = row && rekeyState(row, new Date());
  if (!row || state !== "live") {
    return <SignedOutNotice eyebrow={EYEBROW}>{deadLink(state || null)}</SignedOutNotice>;
  }
  const [forMember, trip] = await Promise.all([getMember(row.forMemberId), getTrip(row.tripId)]);
  if (!forMember || !trip)
    return <SignedOutNotice eyebrow={EYEBROW}>That trip is gone.</SignedOutNotice>;

  if (!me) {
    return (
      <SignedOutCard eyebrow={EYEBROW}>
        <p className="mt-3 text-sm text-soft">
          This link carries the key to{" "}
          <span className="font-semibold text-ink">{placeOf(trip)}</span> for{" "}
          <span className="font-semibold text-ink">{forMember.name}</span>. Sign in as them and it
          opens.
        </p>
        <SignInForKey code={code} href={signInThen(routes.rekey(code))} />
      </SignedOutCard>
    );
  }
  if (me.id !== forMember.id) {
    return (
      <SignedOutNotice eyebrow={EYEBROW}>
        This link is for {forMember.name}, not you. If they sent it to you by mistake, tell them.
      </SignedOutNotice>
    );
  }
  return (
    <SignedOutCard eyebrow={EYEBROW}>
      <p className="mt-3 text-sm text-soft">
        The key to <span className="font-semibold text-ink">{placeOf(trip)}</span>, for this phone.
      </p>
      <RedeemRekey code={code} />
    </SignedOutCard>
  );
}

function deadLink(state: RekeyState | null): string {
  if (state === "used") return "That link has already been used.";
  if (state === "expired") return "That link has expired. Ask for a fresh one.";
  return "That link isn't valid.";
}
