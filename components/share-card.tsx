"use client";

import { useState } from "react";
import type { ActionResult } from "@/app/actions";
import { publishCardAction, unpublishCardAction } from "@/app/actions";
import { routes } from "@/lib/routes";
import type { MarketCard } from "@/lib/views";
import { useTrip } from "./trip-store";
import { useAct } from "./use-act";

/**
 * Share a verdict into the group chat. The server cannot draw the card, so
 * this phone first puts exactly what the card prints on the record — the one
 * deliberate plaintext (docs/private-trips.md §4.11) — then shares the link.
 */
export function ShareCard({
  marketId,
  card,
  published,
}: {
  marketId: string;
  card: MarketCard | null;
  published: boolean;
}) {
  const { tripId, t, name } = useTrip();
  const tripName = name ?? t.sealedTripName;
  const [isUp, setUp] = useState(published);
  const [done, setDone] = useState<string | null>(null);
  const { pending, error, act } = useAct("Couldn't put the card up.");
  if (!card || card.status === "open") return null;
  const question = card.question;

  const publish = async (): Promise<ActionResult> => {
    if (isUp) return { ok: true };
    const res = await publishCardAction(tripId, {
      marketId,
      tripName,
      question,
      verdict: card.status,
      winners: card.winners,
      losers: card.losers,
    });
    if (res.ok) setUp(true);
    return res;
  };
  const link = () => ({
    url: `${window.location.origin}${routes.card(marketId)}`,
    text: `${question}\n— called on ${tripName}`,
  });

  const share = () =>
    act(async () => {
      const res = await publish();
      if (!res.ok) return res;
      const { url, text } = link();
      try {
        if (navigator.share) {
          await navigator.share({ title: tripName, text, url });
          setDone("Shared.");
        } else {
          await navigator.clipboard.writeText(`${text}\n${url}`);
          setDone("Link copied — paste it in the group.");
        }
      } catch {
        // Cancelled, or no clipboard: nothing to say.
      }
    });

  const whatsapp = () =>
    act(async () => {
      const res = await publish();
      if (!res.ok) return res;
      const { url, text } = link();
      window.open(
        `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`,
        "_blank",
        "noopener",
      );
    });

  const takeDown = () =>
    act(async () => {
      const res = await unpublishCardAction(marketId);
      if (!res.ok) return { ok: false, error: res.error ?? "Couldn't take it down." };
      setUp(false);
      setDone("Taken down.");
    });

  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={share}
          className="rounded-md bg-felt px-3 py-1.5 text-sm font-semibold text-white hover:bg-felt-deep disabled:opacity-40"
        >
          Share the verdict
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={whatsapp}
          className="rounded-md border border-line px-3 py-1.5 text-sm font-semibold hover:bg-paper disabled:opacity-40"
        >
          WhatsApp
        </button>
        {isUp && (
          <button
            type="button"
            disabled={pending}
            onClick={takeDown}
            className="text-xs font-semibold text-no-deep hover:underline disabled:opacity-40"
          >
            Take the card down
          </button>
        )}
        {done && <span className="text-xs text-soft">{done}</span>}
        {error && <span className="text-xs font-semibold text-no-deep">{error}</span>}
      </div>
      <p className="mt-1.5 text-xs text-soft">{isUp ? "The card is up." : t.cardPublishNote}</p>
    </div>
  );
}
