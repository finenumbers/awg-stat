FROM node:22-bookworm-slim AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV DATABASE_URL=postgresql://gate:gate@postgres:5432/gate?schema=public
ENV NEXT_TELEMETRY_DISABLED=1
ARG APP_VERSION=0.1.12
ARG BUILD_SHA=unknown
ENV NEXT_PUBLIC_APP_VERSION=$APP_VERSION
ENV NEXT_PUBLIC_BUILD_SHA=$BUILD_SHA

RUN npx prisma generate
RUN npm run build
RUN npx esbuild src/worker/main.ts --bundle --platform=node --outfile=dist/poller.cjs --alias:server-only=./src/worker/server-only-stub.ts --external:@prisma/client --external:ssh2

FROM base AS migrator
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
CMD ["npx", "prisma", "migrate", "deploy"]

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8088
ENV HOSTNAME=0.0.0.0

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER nextjs

EXPOSE 8088

ENTRYPOINT ["/entrypoint.sh"]

FROM base AS poller
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/dist/poller.cjs ./dist/poller.cjs
COPY docker/poller-health.cjs ./poller-health.cjs
COPY docker/poller-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER nextjs

STOPSIGNAL SIGTERM

ENTRYPOINT ["/entrypoint.sh"]
