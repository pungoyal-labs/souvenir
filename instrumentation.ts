import type { Instrumentation } from "next";

// Runs once when a Next.js server instance boots, before it serves requests.
// Importing lib/env here validates the whole environment up front, so a
// missing AUTH_SECRET (or any other invalid config) stops the server from
// starting instead of failing on the first request. In production it also
// takes over console, so Next's own error reporting comes out as JSON lines
// like everything else (see lib/logger).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { env } = await import("@/lib/env");
    if (env.NODE_ENV === "production") {
      const { consoleToLogger } = await import("@/lib/logger");
      consoleToLogger();
    }
  }
}

/**
 * Every error the server catches on a request — a render, a route handler, an
 * action — as one record that says where. Next prints the error itself too
 * (through console, so as JSON once register() has run); this is the line with
 * the route on it, and the two share the digest. The path is masked and the
 * headers are left out: a link's code is a path segment and a session is a
 * cookie.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logger } = await import("@/lib/logger");
  const { maskPath } = await import("@/lib/report");
  const digest =
    typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : undefined;
  logger.error(
    {
      err,
      digest,
      method: request.method,
      path: maskPath(request.path),
      route: context.routePath,
      routeType: context.routeType,
      renderSource: context.renderSource,
      revalidateReason: context.revalidateReason,
    },
    "request failed",
  );
};
