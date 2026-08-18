import { NextResponse } from "next/server";
import { googleConfigured, startGoogleSignIn } from "@/lib/auth";
import { env } from "@/lib/env";

/** Kick off Google sign-in: sets the handshake cookie, bounces to Google. */
export async function GET() {
  if (!googleConfigured) {
    return NextResponse.redirect(`${env.AUTH_URL}/signin?error=NotConfigured`);
  }
  return NextResponse.redirect(await startGoogleSignIn());
}
