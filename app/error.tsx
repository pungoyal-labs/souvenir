"use client";

// The boundary under the root layout: a page that threw shows this in its
// place, header and footer intact. The phone keeps the reason in its own
// console; the server gets a report (components/error-reporter) and the
// member gets the digest, which is the word that finds it in the log.

import Link from "next/link";
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
  useEffect(() => {
    console.error(error);
    sendReport("boundary", error);
  }, [error]);

  return (
    <div className="card mx-auto max-w-md p-6">
      <p className="eyebrow">Something went wrong</p>
      <h1 className="display text-3xl font-extrabold uppercase tracking-wide">This page broke</h1>
      <p className="mt-2 text-sm text-soft">
        It has been noted. Trying again usually works; if it keeps happening, your trips are safe
        ground.
      </p>
      {error.digest && <p className="mono mt-2 text-xs text-soft">ref {error.digest}</p>}
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={retry} className="btn btn-felt px-4 py-2 text-sm">
          Try again
        </button>
        <Link href={routes.trips} className="btn btn-line px-4 py-2 text-sm">
          Your trips
        </Link>
      </div>
    </div>
  );
}
