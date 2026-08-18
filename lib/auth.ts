import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { ensureMember } from "./data.ts";
import { env } from "./env.ts";
import { logger } from "./logger.ts";

declare module "next-auth" {
  interface Session {
    memberId?: string;
  }
}

const providers: NextAuthConfig["providers"] = [];

if (env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: env.AUTH_GOOGLE_ID,
      clientSecret: env.AUTH_GOOGLE_SECRET,
    }),
  );
}

// Local development only (AUTH_DEV_LOGIN=true): sign in as any name/email
// with no password. Bypasses the invite list. Never enable in production.
if (env.AUTH_DEV_LOGIN) {
  providers.push(
    Credentials({
      id: "dev",
      name: "Dev login",
      credentials: {
        email: { label: "Email", type: "email" },
        name: { label: "Name", type: "text" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "")
          .trim()
          .toLowerCase();
        if (!email.includes("@")) return null;
        const name = String(credentials?.name ?? "").trim() || email.split("@")[0];
        return { id: email, email, name };
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  secret: env.AUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/signin", error: "/signin" },
  callbacks: {
    async signIn({ user, account }) {
      if (!user.email) return false;
      const member = await ensureMember(user.email, user.name ?? null, user.image ?? null, {
        bypassAllowlist: account?.provider === "dev",
      });
      if (!member) {
        logger.warn(
          { email: user.email, provider: account?.provider },
          "sign-in denied: not on the invite list",
        );
        return false;
      }
      logger.info({ memberId: member.id, provider: account?.provider }, "member signed in");
      return true;
    },
    async jwt({ token, user, account }) {
      if (user?.email) {
        const member = await ensureMember(user.email, user.name ?? null, user.image ?? null, {
          bypassAllowlist: account?.provider === "dev",
        });
        if (member) token.memberId = member.id;
      }
      return token;
    },
    async session({ session, token }) {
      session.memberId = typeof token.memberId === "string" ? token.memberId : undefined;
      return session;
    },
  },
});
