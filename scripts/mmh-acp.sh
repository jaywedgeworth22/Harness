#!/usr/bin/env bash
# Shellular ACP spawn for MiniMax harness (MMH).  Stdout is JSON-RPC only.
# Tracked copy: ai-fleet-coordinator/scripts/dsh-runtime/mmh-acp.sh
# Live install: ~/apps/harness-runtime/mmh-acp.sh
set -euo pipefail

export DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
export MMH_BASE_URL="${MMH_BASE_URL:-https://api.minimax.io/v1}"
export MMH_MODEL="${MMH_MODEL:-MiniMax-M2.7-highspeed}"
export MMH_ACP_TIMEOUT_SEC="${MMH_ACP_TIMEOUT_SEC:-900}"
export MMH_ACP_HEARTBEAT_SEC="${MMH_ACP_HEARTBEAT_SEC:-5}"
export MMH_API_KEY_NAME="${MMH_API_KEY_NAME:-MINIMAX_API_KEY}"
export MMH_PROFILE="${MMH_PROFILE:-mmh-headless}"

ROOT="$(cd "$(dirname "$0")" && pwd)"
exec /opt/homebrew/bin/python3 "$ROOT/mmh-acp.py" "$@"
