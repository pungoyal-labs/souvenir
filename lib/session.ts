import { redirect } from "next/navigation";
import { getSession } from "./auth.ts";
import { getMember } from "./data.ts";
import type { Member } from "./db/schema.ts";

/** For pages: the signed-in member, or a redirect to /signin. */
export async function requireMember(): Promise<Member> {
  const session = await getSession();
  if (!session) redirect("/signin");
  const member = await getMember(session.memberId);
  if (!member) redirect("/signin");
  return member;
}
