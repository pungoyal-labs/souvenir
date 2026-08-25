"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { revokeInviteAction } from "@/app/actions";
import { CopyLink } from "@/components/copy-link";
import { fmtDate } from "@/lib/format";
import { linkSecretOf, linkWithSecret } from "@/lib/keys";
import { useMintInvite } from "./invite-links";
import { useKeyring } from "./keyring";
import { ActError, useAct } from "./use-act";

/** One open door for the whole group, until it expires or an organiser shuts it. */
export function GroupLink({
  existing,
}: {
  existing: { code: string; url: string; expiresAt: Date; useCount: number } | null;
}) {
  const router = useRouter();
  const mintInvite = useMintInvite();
  const { keyring } = useKeyring();
  const { pending, error, act } = useAct();
  const [minted, setMinted] = useState<string | null>(null);

  // The link is whole only with its secret, which only the minting phone holds.
  const secret = existing ? linkSecretOf(keyring, existing.code) : null;
  const url = minted ?? (existing && secret ? linkWithSecret(existing.url, secret) : null);

  const mint = () =>
    act(async () => {
      const res = await mintInvite("Anyone with the link", { isOpen: true });
      if (!res.ok) return res;
      setMinted(res.url);
      router.refresh();
    });
  const shut = (code: string) =>
    act(async () => {
      setMinted(null);
      const res = await revokeInviteAction(code);
      if (res.ok) router.refresh();
      return res;
    });

  if (!existing && !minted) {
    return (
      <div>
        <button
          type="button"
          disabled={pending}
          onClick={mint}
          className="rounded-md border border-line px-3 py-2 text-sm font-semibold hover:bg-surface disabled:opacity-40"
        >
          {pending ? "Minting…" : "Create a group link"}
        </button>
        {error && <p className="mt-2 text-sm font-semibold text-no-deep">{error}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-line bg-surface/60 px-3 py-2">
      <div className="flex items-center gap-2">
        <code className="mono min-w-0 flex-1 truncate rounded bg-surface px-2 py-1 text-xs">
          {url ?? "Minted on another phone — shut it and mint a fresh one here to share it."}
        </code>
        {url && <CopyLink url={url} />}
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-soft">
        <span>
          {existing
            ? `${existing.useCount} ${existing.useCount === 1 ? "person has" : "people have"} joined through it`
            : "Nobody has used it yet"}
        </span>
        {existing && <span>· expires {fmtDate(existing.expiresAt)}</span>}
        {existing && (
          <button
            type="button"
            disabled={pending}
            onClick={() => shut(existing.code)}
            className="font-semibold text-no-deep hover:underline disabled:opacity-40"
          >
            Shut it
          </button>
        )}
      </p>
      <ActError error={error} block />
    </div>
  );
}
