"use client";

// Handing a key to a seat (docs/private-trips.md §4.8). `SendKey` mints a link
// carrying the key for one member — themselves included, which is how a second
// phone gets in; `RedeemRekey` is where that link lands.

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { mintRekeyAction, redeemRekeyAction } from "@/app/actions";
import { CopyLink } from "@/components/copy-link";
import { linkWithSecret, newLinkSecret, tripKeyOf, wrapTripKey } from "@/lib/keys";
import { routes } from "@/lib/routes";
import { useKeyring } from "./keyring";
import { hasSecret, useTakeKey } from "./take-key";
import { useTrip } from "./trip-store";
import { ActError, useAct } from "./use-act";

export function SendKey({
  forMemberId,
  name,
  compact,
}: {
  forMemberId: string;
  name: string;
  compact?: boolean;
}) {
  const { tripId, epoch, me } = useTrip();
  const { keyring } = useKeyring();
  const { pending, error, act } = useAct("Couldn't mint a link.");
  const [link, setLink] = useState<string | null>(null);
  const self = forMemberId === me.id;

  const mint = () =>
    act(async () => {
      const raw = tripKeyOf(keyring, tripId, epoch);
      if (!raw) return { ok: false, error: "This phone has no key to send." };
      const secret = newLinkSecret();
      const wrapped = await wrapTripKey(secret, "rekey", raw);
      const res = await mintRekeyAction(tripId, forMemberId, wrapped, epoch);
      if (!res.ok || !res.url) return { ok: false, error: res.error };
      setLink(linkWithSecret(res.url, secret));
    });

  if (link) {
    return (
      <span className="inline-flex min-w-0 flex-wrap items-center gap-2">
        <code className="mono min-w-0 max-w-[16rem] truncate rounded bg-surface px-2 py-1 text-xs">
          {link}
        </code>
        <CopyLink url={link} compact />
        <span className="text-xs text-soft">
          {self ? "Open it on your other phone." : `Send it to ${name}.`} Half an hour, once.
        </span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={mint}
        className={
          compact
            ? "rounded-md border border-line px-2 py-0.5 text-xs font-semibold hover:bg-paper disabled:opacity-40"
            : "rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-semibold hover:bg-paper disabled:opacity-40"
        }
      >
        {pending ? "Minting…" : self ? "Key for my other phone" : "Send the key"}
      </button>
      <ActError error={error} />
    </span>
  );
}

// One redemption per link per tab, whatever mounts around it: a dev-mode
// double mount would spend the single-use link on the first run and be
// refused on the second. Never cancelled — a key half taken is a key lost.
const redemptions = new Map<string, Promise<{ tripId: string } | { error: string }>>();

/** Where a rekey link lands. A key this phone already holds is replaced: the link is the one that is right. */
export function RedeemRekey({ code }: { code: string }) {
  const router = useRouter();
  const takeKey = useTakeKey();
  const { status } = useKeyring();
  const [message, setMessage] = useState("Opening the key…");

  // biome-ignore lint/correctness/useExhaustiveDependencies: one redemption per link, shared across mounts
  useEffect(() => {
    if (status === "loading") return;
    let run = redemptions.get(code);
    if (!run) {
      run = (async () => {
        if (!hasSecret(code)) {
          return { error: "This link arrived without its key. Ask for it to be sent again." };
        }
        const res = await redeemRekeyAction(code);
        if (!res.ok || !res.tripId) return { error: res.error ?? "That link didn't work." };
        const tripId = res.tripId;
        const error = await takeKey({ code, purpose: "rekey", tripId, key: res.key });
        return error ? { error } : { tripId };
      })();
      redemptions.set(code, run);
    }
    let mounted = true;
    run.then((result) => {
      if (!mounted) return;
      if ("error" in result) return setMessage(result.error);
      setMessage("Got it — opening the trip.");
      router.replace(routes.trip(result.tripId));
    });
    return () => {
      mounted = false;
    };
  }, [code, status]);

  return (
    <p className="mt-4 text-sm text-soft" aria-live="polite">
      {message}
    </p>
  );
}
