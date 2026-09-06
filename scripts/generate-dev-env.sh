#!/bin/sh
set -e
cd "$(dirname "$0")/.."

if [ -f .env ]; then
  echo ".env already exists" >&2
  exit 1
fi

SECRET="$(openssl rand -base64 32)"
KEY="$(openssl rand -base64 32)"

cat > .env <<EOF
POSTGRES_PASSWORD=gate
POSTGRES_PORT=5435
APP_PORT=8088
APP_BIND=127.0.0.1
APP_URL=http://localhost:8088
BETTER_AUTH_SECRET=${SECRET}
APP_ENCRYPTION_KEY=${KEY}
GEOIP_API_URL=
GEOIP_API_KEY=
EOF

echo "Wrote .env"
