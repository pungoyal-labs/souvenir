// Runs once when a Next.js server instance boots, before it serves requests —
// the build itself never calls this, so build machines don't need secrets.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertProductionAuthSecret } = await import("@/lib/env");
    assertProductionAuthSecret();
  }
}
