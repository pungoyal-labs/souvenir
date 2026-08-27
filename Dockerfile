# syntax=docker/dockerfile:1

FROM node:24-alpine AS deps
WORKDIR /app
RUN npm i -g pnpm@11
# HUSKY=0 skips git-hook installation (there is no .git in the image).
ENV HUSKY=0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:24-alpine AS build
WORKDIR /app
RUN npm i -g pnpm@11
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The commit this image is built from: the build id, and what /privacy names.
ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA
ENV NEXT_TELEMETRY_DISABLED=1
# `AUTH_SECRET` is a placeholder for lib/env.ts during page-data collection; on
# the command, so it never enters the stage's environment. The trace then drags
# the TypeScript compiler into `.next/standalone`, and the `**` includes in
# next.config.ts copy their packages whole — declarations, source maps, tests
# and all. None of it is reachable at runtime: Node executes no `.d.ts`, and
# reads a `.map` only under --enable-source-maps, where a missing one costs a
# stack frame's mapping and nothing else. An `outputFileTracingExcludes` entry
# would be ignored (Turbopack reads only the include half), so they go here.
# `test -d` first: if the compiler ever moves, the build fails instead of
# quietly regaining 23MB. `./scripts/**` stays whole — the README sends
# operators there, and Node strips its types itself.
RUN AUTH_SECRET=insecure-build-time-placeholder pnpm build \
    && test -d .next/standalone/node_modules/@typescript \
    && rm -rf .next/standalone/node_modules/@typescript .next/standalone/node_modules/typescript \
    && find .next/standalone \
        \( -name '*.test.ts' -o -name '*.d.ts' -o -name '*.d.cts' -o -name '*.d.mts' -o -name '*.map' \) \
        -delete

# The single runtime image. Serves the app, and also runs the one-shot
# `migrate` compose service: next.config.ts bundles the migrate script,
# migration SQL, and their dependencies into the standalone output.
FROM node:24-alpine AS runner
WORKDIR /app
ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
