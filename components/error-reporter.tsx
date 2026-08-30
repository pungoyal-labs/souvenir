"use client";

// How a phone tells the server it broke. The boundaries (app/error.tsx,
// app/global-error.tsx) call `sendReport` for what React caught; the
// component below catches what React never sees — an event handler, an
// effect, a promise nobody awaited — as window events. What goes is decided
// in lib/report: name, message, stack, digest, and the path with its secret
// masked. A few per page load, each once, and a report that itself fails is
// dropped rather than reported.

import { useEffect } from "react";
import { reportClientErrorAction } from "@/app/actions";
import { describeError, isNoise, type ReportKind } from "@/lib/report";

const MAX_PER_LOAD = 5;

export function sendReport(kind: ReportKind, err: unknown) {
  reportClientErrorAction({ kind, ...describeError(err), path: window.location.pathname }).catch(
    () => {},
  );
}

export function ErrorReporter() {
  useEffect(() => {
    const seen = new Set<string>();
    const report = (kind: ReportKind, err: unknown) => {
      const described = describeError(err);
      const key = `${described.name}: ${described.message}`;
      if (seen.size >= MAX_PER_LOAD || seen.has(key) || isNoise(described)) return;
      seen.add(key);
      sendReport(kind, err);
    };
    const onError = (event: ErrorEvent) => report("window", event.error ?? event.message);
    const onRejection = (event: PromiseRejectionEvent) => report("rejection", event.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
