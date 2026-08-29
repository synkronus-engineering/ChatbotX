FROM node:24-alpine AS base
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/console/package.json apps/console/
COPY packages/slice-tenancy/package.json packages/slice-tenancy/
COPY packages/database/package.json packages/database/
COPY packages/business/package.json packages/business/
COPY packages/utils/package.json packages/utils/
COPY packages/typescript-config/package.json packages/typescript-config/
COPY packages/vitest-config/package.json packages/vitest-config/
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/console/node_modules ./apps/console/node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="postgres://placeholder:placeholder@localhost:5432/placeholder"
WORKDIR /app/apps/console
RUN pnpm next build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/apps/console/.next/standalone ./
COPY --from=builder /app/apps/console/.next/static ./apps/console/.next/static
COPY --from=builder /app/apps/console/public ./apps/console/public
EXPOSE 3100
CMD ["node", "apps/console/server.js"]
