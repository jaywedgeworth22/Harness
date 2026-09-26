#!/usr/bin/env bash
# Shellular ACP spawn for MiniMax via Harness coding path (dsh + MiniMax LLM).
# Stdout is JSON-RPC only.
# Canonical: this repo.  Live: ~/apps/harness-runtime/mmh-acp.sh (root shim).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
export HARNESS_RUNTIME_ROOT="${HARNESS_RUNTIME_ROOT:-$ROOT}"
export DSH_RUNTIME_ROOT="${DSH_RUNTIME_ROOT:-$HARNESS_RUNTIME_ROOT}"
export DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
export DSH_PERMISSION_MODE="${DSH_PERMISSION_MODE:-danger-full-access}"
export MMH_PROFILE="${MMH_PROFILE:-mmh-headless}"
export DSH_PROFILE="${DSH_PROFILE:-$MMH_PROFILE}"
export MMH_API_KEY_NAME="${MMH_API_KEY_NAME:-MINIMAX_API_KEY}"
export MMH_ACP_TIMEOUT_SEC="${MMH_ACP_TIMEOUT_SEC:-900}"
export MMH_ACP_HEARTBEAT_SEC="${MMH_ACP_HEARTBEAT_SEC:-5}"

exec /opt/homebrew/bin/python3 "$ROOT/bridges/mmh/mmh-acp.py" "$@"
