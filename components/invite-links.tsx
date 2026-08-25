"use client";

// Minting a link that carries the key (docs/private-trips.md §4.3): this phone
// makes the secret, wraps the trip key and a peek at the table under it, and
// shows the link once. The server never sees the secret; neither does this
// phone keep it — a link is minted, not re-shown.

import { mintInviteAction } from "@/app/actions";
import { linkWithSecret, newLinkSecret, tripKeyOf, wrapPreview, wrapTripKey } from "@/lib/keys";
import { listMarkets } from "@/lib/views";
import { useKeyring } from "./keyring";
import { useTrip } from "./trip-store";

export function useMintInvite() {
  const { tripId, epoch, me, roster, people, state, name } = useTrip();
  const keyring = useKeyring();
  return async (
    label: string,
    opts?: { isOpen?: boolean },
  ): Promise<{ ok: true; url: string } | { ok: false; error: string }> => {
    if (epoch === null || !state) return { ok: false, error: "This trip isn't sealed yet." };
    const raw = tripKeyOf(keyring.keyring, tripId, epoch);
    if (!raw) return { ok: false, error: "This phone has no key to put in a link." };
    const secret = newLinkSecret();
    const { open } = listMarkets(state, tripId, people, me.id, new Date());
    const [wrappedKey, preview] = await Promise.all([
      wrapTripKey(secret, "invite", raw),
      wrapPreview(secret, {
        name: name ?? "",
        names: roster.slice(0, 6).map((m) => m.name),
        questions: open.slice(0, 4).map((v) => v.market.question),
      }),
    ]);
    const res = await mintInviteAction(tripId, label, {
      isOpen: opts?.isOpen,
      wrappedKey,
      epoch,
      preview,
    });
    if (!res.ok || !res.url) {
      return { ok: false, error: res.error ?? "Couldn't mint an invite." };
    }
    return { ok: true, url: linkWithSecret(res.url, secret) };
  };
}
