#!/bin/sh
set -e

if [ -z "$GATE_DOCKER_AGENT_TOKEN" ]; then
  echo "GATE_DOCKER_AGENT_TOKEN is required" >&2
  exit 1
fi

exec node dist/docker-agent.cjs
