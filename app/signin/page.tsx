import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";
import { env } from "@/lib/env";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.memberId) redirect("/");
  const { error } = await searchParams;
  const googleConfigured = Boolean(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET);

  return (
    <div className="mx-auto mt-10 max-w-sm rounded-lg border border-line bg-surface p-8 text-center shadow-[0_2px_0_rgba(33,38,31,0.08)]">
      <p className="display text-5xl font-extrabold uppercase leading-none tracking-wide">
        Chiang
        <br />
        Pai
      </p>
      <p className="mt-3 text-sm text-soft">
        A private prediction game. Virtual units, real reputations.
      </p>

      {error === "AccessDenied" && (
        <p className="mt-4 rounded-md bg-no-tint px-3 py-2 text-sm font-semibold text-no-deep">
          That Google account isn't on the invite list. Ask a founding member to add you.
        </p>
      )}
      {error && error !== "AccessDenied" && (
        <p className="mt-4 rounded-md bg-no-tint px-3 py-2 text-sm font-semibold text-no-deep">
          Sign-in failed. Try again.
        </p>
      )}

      {googleConfigured && (
        <form
          className="mt-6"
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="w-full rounded-md bg-felt py-3 font-semibold text-white hover:bg-felt-deep"
          >
            Continue with Google
          </button>
        </form>
      )}

      {env.AUTH_DEV_LOGIN && (
        <form
          className="mt-4 space-y-2 border-t border-line pt-4 text-left"
          action={async (formData: FormData) => {
            "use server";
            await signIn("dev", {
              email: String(formData.get("email") ?? ""),
              name: String(formData.get("name") ?? ""),
              redirectTo: "/",
            });
          }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gold">
            Dev login — local only
          </p>
          <input
            name="email"
            type="email"
            required
            placeholder="you@example.com"
            className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm"
          />
          <input
            name="name"
            type="text"
            placeholder="Display name"
            className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="w-full rounded-md border border-line py-2 text-sm font-semibold hover:bg-paper"
          >
            Sign in as this person
          </button>
        </form>
      )}

      {!googleConfigured && !env.AUTH_DEV_LOGIN && (
        <p className="mt-6 text-sm text-soft">
          No sign-in method configured. Set AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET in the
          environment.
        </p>
      )}
    </div>
  );
}
