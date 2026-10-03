#!/bin/sh
set -e

if [ -z "$GATE_AWG_TOKEN" ]; then
  echo "GATE_AWG_TOKEN is required" >&2
  exit 1
fi

mkdir -p /run/gate-awg
chmod 700 /run/gate-awg

exec node dist/awg-agent.cjs
