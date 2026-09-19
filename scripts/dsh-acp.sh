#!/usr/bin/env bash
# Shellular ACP spawn for DeepSeek Harness. Stdout is JSON-RPC only.
# Tracked copy: ai-fleet-coordinator/scripts/dsh-runtime/dsh-acp.sh
# Live install: ~/apps/harness-runtime/dsh-acp.sh
set -euo pipefail

export DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
export DSH_RUNTIME_ROOT="${DSH_RUNTIME_ROOT:-/Users/jay/apps/dsh-runtime}"
export DSH_PERMISSION_MODE="${DSH_PERMISSION_MODE:-danger-full-access}"
export DSH_PROFILE="${DSH_PROFILE:-dsh-headless}"

ROOT="$(cd "$(dirname "$0")" && pwd)"
exec /opt/homebrew/bin/python3 "$ROOT/dsh-acp.py" "$@"
