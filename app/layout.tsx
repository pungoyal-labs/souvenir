import type { Metadata, Viewport } from "next";
import { Big_Shoulders, Instrument_Sans, Spline_Sans_Mono } from "next/font/google";
import Link from "next/link";
import { signOutAction } from "@/app/actions";
import { Avatar } from "@/components/avatar";
import { KeyringProvider } from "@/components/keyring";
import { Logo } from "@/components/logo";
import { PasskeyNudge } from "@/components/passkey-nudge";
import { RecoveryNotice } from "@/components/recovery-notice";
import { TermsNudge } from "@/components/terms-nudge";
import { ThemeToggle } from "@/components/theme-toggle";
import { passkeysConfigured } from "@/lib/auth";
import { build } from "@/lib/build";
import { hasPasskey, recoveryNoticeFor } from "@/lib/data";
import { env } from "@/lib/env";
import { lingoOf } from "@/lib/lingo";
import { routes } from "@/lib/routes";
import { currentMember } from "@/lib/session";
import "./globals.css";

const display = Big_Shoulders({
  subsets: ["latin"],
  variable: "--font-big-shoulders",
});
const body = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument",
});
const mono = Spline_Sans_Mono({
  subsets: ["latin"],
  variable: "--font-spline-mono",
});

export const metadata: Metadata = {
  // Without a base, Next resolves og:image and friends against localhost —
  // this deploy is standalone, so no platform env fills one in.
  metadataBase: new URL(env.AUTH_URL),
  title: { default: "Chiang Pai", template: "%s · Chiang Pai" },
  description:
    "The app for the trip that actually happens. Call who shows up, who's late, who pays — play-money pies, real bragging rights.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Chiang Pai", statusBarStyle: "black-translucent" },
  openGraph: {
    siteName: "Chiang Pai",
    title: "Chiang Pai",
    description: "The app for the trip that actually happens.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#143024",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const member = await currentMember();
  const [enrolled, recoveries] = member
    ? await Promise.all([hasPasskey(member.id), recoveryNoticeFor(member.id)])
    : [true, null];
  const liveRecovery = recoveries?.live[0] ?? null;
  const usedRecovery = recoveries?.used[0] ?? null;
  const needsPasskey = passkeysConfigured && member != null && !enrolled;
  const needsTerms = member != null && member.termsAcceptedAt == null;
  const t = lingoOf(member?.lingo ?? "english");

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Saved theme before first paint; suppressHydrationWarning covers the attribute. */}
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: static theme bootstrap, no user input
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");if(t)document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`,
          }}
        />
      </head>
      <body
        className={`${display.variable} ${body.variable} ${mono.variable} min-h-screen antialiased`}
      >
        <header className="bg-felt-deep text-[#f1eee4]">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
            <Link href={member ? routes.trips : routes.home} className="flex items-center gap-2.5">
              <Logo size={30} className="rounded-[22%] ring-1 ring-white/20" />
              <span className="display text-2xl font-extrabold uppercase tracking-wide">
                Chiang&nbsp;Pai
              </span>
            </Link>
            <div className="ml-auto flex items-center gap-3">
              {member ? (
                <>
                  <Link href={routes.trips} className="rounded px-2 py-1 text-sm hover:bg-white/10">
                    Trips
                  </Link>
                  <Link
                    href={routes.account}
                    className="flex items-center gap-2 rounded-full bg-white/10 py-1 pl-3 pr-1 hover:bg-white/20"
                    title="Your account"
                  >
                    <span className="text-sm">{member.name}</span>
                    <Avatar member={member} size={26} />
                  </Link>
                  <form action={signOutAction}>
                    <button
                      type="submit"
                      className="rounded px-2 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-white"
                      title="Sign out"
                    >
                      Sign out
                    </button>
                  </form>
                </>
              ) : (
                <Link href={routes.signin} className="rounded px-2 py-1 text-sm hover:bg-white/10">
                  Sign in
                </Link>
              )}
              <ThemeToggle />
            </div>
          </div>
        </header>
        <div aria-hidden className="zari" />
        {member && (liveRecovery || usedRecovery) && (
          <RecoveryNotice
            live={liveRecovery && { code: liveRecovery.code, expiresAt: liveRecovery.expiresAt }}
            usedAt={usedRecovery?.usedAt ?? null}
          />
        )}
        {member && needsTerms && <TermsNudge />}
        {member && needsPasskey && !needsTerms && (
          <PasskeyNudge memberId={member.id} needsPicture={member.avatarUpdatedAt == null} />
        )}
        <KeyringProvider signedIn={member != null}>
          <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
        </KeyringProvider>
        <footer className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-1 px-4 pb-8 pt-4 text-xs text-soft">
          <span>{t.footer}</span>
          <span className="ml-auto flex gap-3">
            <Link href={routes.terms} className="hover:underline">
              Terms
            </Link>
            <Link href={routes.privacy} className="hover:underline">
              Privacy
            </Link>
            {build && (
              <span className="mono" title="The commit this build is from">
                {build.short}
              </span>
            )}
          </span>
        </footer>
      </body>
    </html>
  );
}
