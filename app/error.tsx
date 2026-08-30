"use client";

// The boundary under the root layout: a page that threw shows this in its
// place, header and footer intact. The phone keeps the reason in its own
// console; the server gets a report (components/error-reporter) and the
// member gets the digest, which is the word that finds it in the log.
//
// One error is not a break and not worth a report: an action this bundle
// knows by a name the running build no longer has, because a deploy went out
// while the page sat open. Retrying that runs the same stale bundle at the
// same missing name, so the button has to be a reload (see stale-build).

import Link from "next/link";
import { unstable_isUnrecognizedActionError } from "next/navigation";
import { useEffect } from "react";
import { sendReport } from "@/components/error-reporter";
import { routes } from "@/lib/routes";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  // Read before the narrowing below: the predicate is a type guard, and past
  // it TypeScript has no `error` left to take a digest off.
  const digest = error.digest;
  const stale = unstable_isUnrecognizedActionError(error);

  useEffect(() => {
    console.error(error);
    // The server logged its own line for a stale build already, and a deploy
    // can put this in front of every phone at once.
    if (!stale) sendReport("boundary", error);
  }, [error, stale]);

  return (
    <div className="card mx-auto max-w-md p-6">
      <p className="eyebrow">{stale ? "New version" : "Something went wrong"}</p>
      <h1 className="display text-3xl font-extrabold uppercase tracking-wide">
        {stale ? "Souvenir updated" : "This page broke"}
      </h1>
      <p className="mt-2 text-sm text-soft">
        {stale
          ? "A new version went out while this page was open, so the server stopped answering this tab. Reload and carry on — everything already posted is on the log."
          : "It has been noted. Trying again usually works; if it keeps happening, your trips are safe ground."}
      </p>
      {!stale && digest && <p className="mono mt-2 text-xs text-soft">ref {digest}</p>}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={stale ? () => window.location.reload() : retry}
          className="btn btn-felt px-4 py-2 text-sm"
        >
          {stale ? "Reload" : "Try again"}
        </button>
        <Link href={routes.trips} className="btn btn-line px-4 py-2 text-sm">
          Your trips
        </Link>
      </div>
    </div>
  );
}
