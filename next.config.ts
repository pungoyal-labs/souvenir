import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // The leaderboard is the members page now — the group and how it's doing are
  // one table. Old links (and anyone's bookmark) land there instead of a 404.
  async redirects() {
    return [{ source: "/leaderboard", destination: "/members", permanent: true }];
  },
  // Keep pino out of the server bundle: its dynamic requires don't bundle
  // cleanly, and as an external it gets traced into standalone node_modules,
  // where `node scripts/migrate.ts` can also resolve it.
  serverExternalPackages: ["pino"],
  // The one runtime image doubles as the migration runner: bundle the
  // migration SQL, the migrate script (and the lib files it imports), and
  // drizzle's migrator into the standalone output so the compose `migrate`
  // service can run `node scripts/migrate.ts` from the same image.
  outputFileTracingIncludes: {
    "*": [
      "./drizzle/**",
      "./scripts/**",
      "./lib/**",
      // Raw packages the migrate script imports at runtime; the app's own
      // bundle compiles these in, so tracing wouldn't copy them by itself.
      "./node_modules/drizzle-orm/**",
      "./node_modules/zod/**",
      "./node_modules/pg/**",
      "./node_modules/pg-*/**",
      "./node_modules/postgres-*/**",
      "./node_modules/pgpass/**",
      "./node_modules/split2/**",
    ],
  },
};

export default nextConfig;
