#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
AGENT_ROOT="${AGENT_V2_AGENT_ROOT:-$ROOT_DIR/../agent}"

if [[ ! -f "$AGENT_ROOT/package.json" ]]; then
  echo "Agent repository was not found at $AGENT_ROOT" >&2
  exit 1
fi

AGENT_V2_LOCAL_EXTERNAL_SMOKE="$ROOT_DIR/dev/agentV2/runSdkSmoke.sh" \
  AGENT_V2_LOCAL_ALLOW_SANITIZATION=true \
  npm --prefix "$AGENT_ROOT" run local:verify
