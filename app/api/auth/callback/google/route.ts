import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { completeGoogleSignIn, createSession } from "@/lib/auth";
import { ensureMember } from "@/lib/data";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/** Google sends the member back here with `code` + `state`. */
export async function GET(request: NextRequest) {
  const profile = await completeGoogleSignIn(request.nextUrl.searchParams);
  if (!profile) {
    return NextResponse.redirect(`${env.AUTH_URL}/signin?error=OAuthCallback`);
  }

  const member = await ensureMember(profile.email, profile.name, profile.image);
  if (!member) {
    logger.warn({ email: profile.email }, "sign-in denied: not on the invite list");
    return NextResponse.redirect(`${env.AUTH_URL}/signin?error=AccessDenied`);
  }

  await createSession(member.id);
  logger.info({ memberId: member.id, provider: "google" }, "member signed in");
  return NextResponse.redirect(`${env.AUTH_URL}/`);
}
