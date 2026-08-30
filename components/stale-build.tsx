"use client";

// The page has been open across a deploy. Every server action is named by a
// hash of the build it was compiled in, so the names this bundle knows are
// gone the moment a new image is running: the action 404s and the call
// rejects with Next's UnrecognizedActionError. Nothing is broken and nothing
// posted is lost — the phone is talking to a server that no longer speaks its
// build, and only a reload fixes that, since retrying runs the same stale
// bundle at the same missing name. Next's own log line for it is a warning,
// not an error, for the same reason.
//
// Whoever meets one says so here, and the bar below is the one place it is
// said, once, for the whole page. Plain language in every lingo: a notice,
// not flavour. The reload is the member's tap and not ours — a phone halfway
// through a line of table talk should not lose it to a page load.

import { unstable_isUnrecognizedActionError } from "next/navigation";
import { useSyncExternalStore } from "react";

let stale = false;
const listeners = new Set<() => void>();

/**
 * Whether the deploy moved under the page, rather than the action refusing.
 * Next's own predicate first; the name behind it covers an error re-thrown as
 * a copy on its way out of a transition, where the class no longer matches.
 */
export function isStaleBuild(err: unknown): boolean {
  return (
    unstable_isUnrecognizedActionError(err) ||
    (err instanceof Error && err.name === "UnrecognizedActionError")
  );
}

/** Say it once for the page: the bar appears, and whatever polls stops knocking. */
export function markStaleBuild(): void {
  if (stale) return;
  stale = true;
  for (const notify of listeners) notify();
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}

/** True once anything on this page has met the stale build; false on the server. */
export function useStaleBuild(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => stale,
    () => false,
  );
}

export function StaleBuild() {
  const shown = useStaleBuild();
  if (!shown) return null;

  return (
    <div className="mx-auto mt-4 max-w-5xl px-4">
      <div className="card flex flex-wrap items-center gap-x-4 gap-y-3 border-gold/40 bg-gold/10 px-4 py-3">
        <div className="min-w-64 flex-1">
          <p className="font-semibold">Souvenir updated while this page was open.</p>
          <p className="text-sm text-soft">
            This tab is running the old version and the server has stopped answering it, so nothing
            you tap here lands and the trip has stopped catching up. Reload and carry on —
            everything already posted is on the log.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="btn btn-felt px-4 py-2 text-sm"
        >
          Reload
        </button>
      </div>
    </div>
  );
}
