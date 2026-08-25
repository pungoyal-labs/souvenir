import { redirect } from "next/navigation";
import { cache } from "react";
import { getSession } from "./auth.ts";
import { getMember, type TripContext, tripFor } from "./data.ts";
import type { Member } from "./db/schema.ts";

// A request renders the root layout, the trip layout and the page, and each asks who is signed
// in and whether they have a seat; `cache` makes that one query per request, not three.

/** The signed-in member, or null — for pages that have a signed-out face. */
export const currentMember = cache(async (): Promise<Member | null> => {
  const session = await getSession();
  return session ? getMember(session.memberId) : null;
});

const seatOf = cache(tripFor);

/** For pages: the signed-in member, or a redirect to /signin. */
export async function requireMember(): Promise<Member> {
  const member = await currentMember();
  if (!member) redirect("/signin");
  return member;
}

/**
 * For trip pages: the signed-in member and their seat on this trip, or a
 * redirect — to sign-in if nobody is, to the trips list if they have no seat.
 * Every page under /t/[tripId] starts here, so a URL alone opens nothing.
 */
export async function requireTrip(tripId: string): Promise<TripContext & { me: Member }> {
  const me = await requireMember();
  const ctx = await seatOf(me.id, tripId);
  if (!ctx) redirect("/trips");
  return { me, ...ctx };
}
