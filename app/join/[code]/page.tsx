import Link from "next/link";
import { JoinAsMember } from "@/components/join-as-member";
import { JoinForm } from "@/components/join-form";
import { JoinPreview, SignInToJoin } from "@/components/join-preview";
import { SignedOutCard, SignedOutNotice } from "@/components/signed-out-card";
import { findInvite, tripFor, tripPreview } from "@/lib/data";
import { type InviteState, inviteState } from "@/lib/invites";
import { routes, signInThen } from "@/lib/routes";
import { currentMember } from "@/lib/session";
import { DESTINATIONS } from "@/lib/talk";

// Reachable signed out by anyone holding the link: the code is a bearer token,
// short-lived and revocable because of it (lib/invites.ts). The preview and the
// trip's key ride in the fragment, opened on the phone.
export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const [invite, me] = await Promise.all([findInvite(code), currentMember()]);

  const state = invite && inviteState(invite, new Date());
  if (!invite || state !== "live") {
    return (
      <SignedOutNotice eyebrow="You've been invited">{deadLink(state || null)}</SignedOutNotice>
    );
  }

  const preview = await tripPreview(invite.tripId);
  if (!preview) {
    return <SignedOutNotice eyebrow="You've been invited">That trip is gone.</SignedOutNotice>;
  }
  const there = DESTINATIONS[preview.trip.destination];
  const seated = me ? await tripFor(me.id, invite.tripId) : null;

  return (
    <SignedOutCard eyebrow="You've been invited">
      <div className="mt-4 rounded-lg border border-line bg-surface p-4 text-left">
        <p className="eyebrow">
          {there?.flag} {there?.place ?? preview.trip.destination}
        </p>
        <p className="display text-2xl font-extrabold uppercase tracking-wide">
          {preview.trip.name}
        </p>
        <p className="mt-1 text-sm text-soft">
          {preview.organiser ? `${preview.organiser.name} saved you a seat. ` : ""}
          {preview.memberCount} at the table
          {preview.names.length > 0 && `: ${preview.names.join(", ")}`}
          {preview.memberCount > preview.names.length && "…"}
        </p>
        <JoinPreview code={code} sealed={invite.preview} />
      </div>
      <p className="mt-3 text-sm text-soft">
        Call who shows up, who's late, who pays. Play-money pies, real bragging rights.
      </p>

      {me && seated ? (
        <>
          <p className="mt-3 text-sm text-soft">You're already on {preview.trip.name}.</p>
          <JoinAsMember code={code} name={me.name} tripName={preview.trip.name} seated />
          <Link
            href={routes.trip(invite.tripId)}
            className="mt-2 block text-sm text-felt hover:underline"
          >
            Open the trip
          </Link>
        </>
      ) : me ? (
        <JoinAsMember code={code} name={me.name} tripName={preview.trip.name} />
      ) : (
        <>
          <JoinForm code={code} label={invite.label} />
          <p className="mt-4 text-xs text-soft">
            Already on another trip?{" "}
            <SignInToJoin code={code} href={signInThen(routes.join(code))} /> and this link will
            seat you.
          </p>
        </>
      )}
    </SignedOutCard>
  );
}

function deadLink(state: InviteState | null): string {
  if (state === "used") return "That link has already been used.";
  if (state === "expired") return "That link has expired.";
  return "That invite link isn't valid.";
}
