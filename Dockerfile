# syntax=docker/dockerfile:1

FROM node:26-alpine AS deps
WORKDIR /app
RUN npm i -g pnpm@11
# HUSKY=0 skips git-hook installation (there is no .git in the image).
ENV HUSKY=0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:26-alpine AS build
WORKDIR /app
RUN npm i -g pnpm@11
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# The single runtime image. Serves the app, and also runs the one-shot
# `migrate` compose service: next.config.ts bundles the migrate script,
# migration SQL, and their dependencies into the standalone output.
FROM node:26-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
