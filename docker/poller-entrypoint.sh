#!/bin/sh
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is required for gate-poller" >&2
  exit 1
fi
if [ -z "$APP_ENCRYPTION_KEY" ]; then
  echo "APP_ENCRYPTION_KEY is required for gate-poller" >&2
  exit 1
fi

exec node dist/poller.cjs
