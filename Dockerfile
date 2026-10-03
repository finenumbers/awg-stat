FROM golang:1.25-bookworm AS awg-go
RUN apt-get update \
  && apt-get install -y --no-install-recommends git make ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /src
RUN git clone --depth 1 --branch v3.1.20260828 https://github.com/amnezia-vpn/amneziawg-go.git .
RUN CGO_ENABLED=0 make

FROM debian:bookworm-slim AS awg-tools
RUN apt-get update \
  && apt-get install -y --no-install-recommends git make gcc libc6-dev libmnl-dev pkg-config ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /src
RUN git clone --depth 1 --branch v3.1.20260812 https://github.com/amnezia-vpn/amneziawg-tools.git .
WORKDIR /src/src
RUN make && make install DESTDIR=/out PREFIX=/usr

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

RUN npx prisma generate
RUN npm run build
RUN npx esbuild src/worker/main.ts --bundle --platform=node --outfile=dist/poller.cjs --alias:server-only=./src/worker/server-only-stub.ts --external:@prisma/client --external:ssh2 \
  && npx esbuild src/docker-agent/main.ts --bundle --platform=node --outfile=dist/docker-agent.cjs --external:dockerode \
  && npx esbuild src/awg-agent/main.ts --bundle --platform=node --outfile=dist/awg-agent.cjs

FROM base AS migrator
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates postgresql-client \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
COPY docker/migrate-entrypoint.sh /migrate-entrypoint.sh
RUN chmod +x /migrate-entrypoint.sh
ENTRYPOINT ["/migrate-entrypoint.sh"]

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

FROM base AS docker-agent
WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist/docker-agent.cjs ./dist/docker-agent.cjs
COPY docker/docker-agent-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8090

ENTRYPOINT ["/entrypoint.sh"]

FROM base AS poller
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates iputils-ping \
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

FROM base AS awg
WORKDIR /app

ENV NODE_ENV=production
ENV AWG_GO_VERSION=v3.1.20260828
ENV AWG_TOOLS_VERSION=v3.1.20260812

RUN apt-get update \
  && apt-get install -y --no-install-recommends iproute2 iputils-ping iptables libmnl0 ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=awg-go /src/amneziawg-go /usr/local/bin/amneziawg-go
COPY --from=awg-tools /out/usr/bin/awg /usr/local/bin/awg
COPY --from=builder /app/dist/awg-agent.cjs ./dist/awg-agent.cjs
COPY docker/awg-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh /usr/local/bin/amneziawg-go /usr/local/bin/awg

EXPOSE 8091

ENTRYPOINT ["/entrypoint.sh"]
