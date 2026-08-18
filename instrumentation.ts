// Runs once when a Next.js server instance boots, before it serves requests.
// Importing lib/env here validates the whole environment up front, so a
// missing AUTH_SECRET (or any other invalid config) stops the server from
// starting instead of failing on the first request.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/lib/env");
  }
}
