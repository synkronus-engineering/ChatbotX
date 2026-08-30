FROM node:24-alpine AS base
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/landing/package.json apps/landing/
COPY packages/typescript-config/package.json packages/typescript-config/
COPY packages/vitest-config/package.json packages/vitest-config/
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/landing/node_modules ./apps/landing/node_modules
# Workspace packages resolve their own third-party deps from
# packages/*/node_modules (pnpm's per-package layout). Next's build typecheck
# follows app imports into package sources (vitest.config.ts →
# @chatbotx.io/vitest-config), so without this carry-over those imports hit
# modules that exist neither in the app's nor the root's node_modules.
# `COPY . .` below merges over it — the context's **/node_modules
# dockerignore means it never overwrites these installs.
COPY --from=deps /app/packages ./packages
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_BUILDER_URL="http://localhost:3123"
ENV NEXT_PUBLIC_SITE_URL="http://localhost:3200"
WORKDIR /app/apps/landing
RUN pnpm next build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/apps/landing/.next/standalone ./
COPY --from=builder /app/apps/landing/.next/static ./apps/landing/.next/static
COPY --from=builder /app/apps/landing/public ./apps/landing/public
EXPOSE 3200
CMD ["node", "apps/landing/server.js"]
