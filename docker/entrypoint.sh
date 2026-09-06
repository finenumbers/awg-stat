#!/bin/sh
set -e

if [ "$NODE_ENV" = "production" ]; then
  if [ -z "$BETTER_AUTH_SECRET" ]; then
    echo "BETTER_AUTH_SECRET is required in production" >&2
    exit 1
  fi
  if [ -z "$APP_ENCRYPTION_KEY" ]; then
    echo "APP_ENCRYPTION_KEY is required in production" >&2
    exit 1
  fi
  if [ -z "$APP_URL" ] && [ -z "$BETTER_AUTH_URL" ]; then
    echo "APP_URL is required in production" >&2
    exit 1
  fi
fi

exec node server.js
