"use client";

import { useRouter } from "next/navigation";
import { bumpEpochAction } from "@/app/actions";
import { exportKey, newKey, wrapToMember } from "@/lib/crypto";
import { fmtDate } from "@/lib/format";
import { sealName, withTripKey } from "@/lib/keys";
import { useKeyring } from "./keyring";
import { useOpenTrip } from "./trip-store";
import { ActError, useAct } from "./use-act";

/**
 * Rotation, run on an organiser's phone (docs/private-trips.md §4.10): a new
 * trip key, wrapped to the member key each seat announced in the log — never
 * to anything the server supplied — and handed over in one call the server
 * accepts only when nobody is left out. Live invites and key links carried
 * the old key and go with it; whoever left keeps a key that opens nothing new.
 */
export function RotateKey({ since }: { since: Date | null }) {
  const router = useRouter();
  const keyring = useKeyring();
  const { tripId, epoch, me, name, roster, state } = useOpenTrip();
  const { pending, error, act } = useAct();
  if (!since || !state.organiserIds.has(me.id)) return null;
  const others = roster.filter((m) => m.id !== me.id);
  const withoutKey = others.filter((m) => !state.hellos.get(m.id)?.mkPub);

  const rotate = () =>
    act(async () => {
      const next = await newKey();
      const raw = await exportKey(next);
      const grants = await Promise.all(
        others.map(async (m) => ({
          memberId: m.id,
          wrapped: await wrapToMember(state.hellos.get(m.id)?.mkPub as JsonWebKey, raw),
        })),
      );
      const res = await bumpEpochAction(tripId, {
        epoch: epoch + 1,
        nameEnc: await sealName(next, tripId, name ?? ""),
        grants,
      });
      if (!res.ok) return res;
      await keyring.update((kr) => withTripKey(kr, tripId, epoch + 1, raw));
      router.refresh();
      return res;
    });

  return (
    <section className="mt-8">
      <h2 className="display text-xl font-bold uppercase tracking-wide">The key</h2>
      <div className="mt-2 card border-gold/40 bg-gold/10 px-4 py-3 text-sm">
        <p>
          Somebody left on {fmtDate(since)} and still holds the key. Rotating gives everyone at the
          table a new one; what was written until now stays readable to them, nothing after.
        </p>
        {withoutKey.length > 0 ? (
          <p className="mt-2 text-xs text-soft">
            Waiting for {withoutKey.map((m) => m.name).join(", ")} to open the trip once on a phone
            that has the key — a new key can only be handed to a phone that has announced one.
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={rotate}
              className="rounded-md bg-felt px-3 py-1.5 text-sm font-semibold text-white hover:bg-felt-deep disabled:opacity-40"
            >
              Rotate the key
            </button>
            <ActError error={error} />
          </div>
        )}
      </div>
    </section>
  );
}
