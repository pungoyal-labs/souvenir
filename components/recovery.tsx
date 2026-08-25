"use client";

import { useRouter } from "next/navigation";
import { mintRecoveryAction, revokeRecoveryAction } from "@/app/actions";
import { CopyLink } from "@/components/copy-link";
import { timeUntil } from "@/lib/format";
import {
  linkSecretOf,
  linkWithSecret,
  newLinkSecret,
  tripKeyOf,
  withLinkSecret,
  wrapTripKey,
} from "@/lib/keys";
import { useKeyring } from "./keyring";
import { ShutLink } from "./rekey-list";
import { useTrip } from "./trip-store";
import { useAct } from "./use-act";

/** Any organiser of the trip, or the member whose seat the link opens. */
export function ShutRecovery({
  tripId,
  code,
  label,
}: {
  tripId: string;
  code: string;
  label?: string;
}) {
  return <ShutLink label={label} shut={() => revokeRecoveryAction(tripId, code)} />;
}

/**
 * The organiser's half of a recovery, on the member's page. The link carries
 * this trip's key under a secret this phone makes and keeps, so it is whole
 * only here; minting shuts whatever came before it.
 */
export function RecoveryPanel({
  tripId,
  memberId,
  memberName,
  live,
}: {
  tripId: string;
  memberId: string;
  memberName: string;
  live: { code: string; url: string; expiresAt: Date } | null;
}) {
  const router = useRouter();
  const { epoch } = useTrip();
  const keyring = useKeyring();
  const { pending, error, act } = useAct("Couldn't mint a recovery link.");

  const mint = () =>
    act(async () => {
      const raw = epoch === null ? null : tripKeyOf(keyring.keyring, tripId, epoch);
      const secret = newLinkSecret();
      const key =
        raw && epoch !== null
          ? { epoch, wrappedKey: await wrapTripKey(secret, "recover", raw) }
          : null;
      const res = await mintRecoveryAction(tripId, memberId, key);
      const code = res.code;
      if (!res.ok || !code) return { ok: false, error: res.error };
      if (key) await keyring.update((kr) => withLinkSecret(kr, code, secret));
      router.refresh();
    });
  const secret = live ? linkSecretOf(keyring.keyring, live.code) : null;
  const url = live ? (secret ? linkWithSecret(live.url, secret) : live.url) : null;

  return (
    <div className="card border-gold/40 bg-gold/10 px-4 py-3">
      <p className="font-semibold">Lost every passkey?</p>
      <p className="mt-0.5 text-xs text-soft">
        A recovery link puts a new passkey on {memberName}'s seat. Whoever opens it becomes{" "}
        {memberName} — so mint one only when you know, by voice and not by message, that it is
        really them asking. It lasts half an hour, works once, and the whole table can see it while
        it is live.
      </p>

      {live && url ? (
        <div className="mt-2">
          <div className="flex items-center gap-2">
            <code className="mono min-w-0 flex-1 truncate rounded bg-surface px-2 py-1 text-xs">
              {url}
            </code>
            <CopyLink url={url} />
          </div>
          {!secret && (
            <p className="mt-1 text-xs text-soft">
              Minted on another phone, so this copy carries no key — they will get one by rekey.
            </p>
          )}
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-soft">
            <span>expires {timeUntil(live.expiresAt)}</span>
            <ShutRecovery tripId={tripId} code={live.code} />
            <button
              type="button"
              disabled={pending}
              onClick={mint}
              className="font-semibold hover:underline disabled:opacity-40"
            >
              {pending ? "Minting…" : "Mint a fresh one"}
            </button>
          </p>
        </div>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={mint}
          className="mt-2 rounded-md border border-line bg-surface px-3 py-2 text-sm font-semibold hover:bg-paper disabled:opacity-40"
        >
          {pending ? "Minting…" : "Mint a recovery link"}
        </button>
      )}
      {error && <p className="mt-2 text-sm font-semibold text-no-deep">{error}</p>}
    </div>
  );
}
