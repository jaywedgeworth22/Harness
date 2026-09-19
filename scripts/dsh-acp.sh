#!/usr/bin/env bash
# Shellular ACP spawn for DeepSeek Harness. Stdout is JSON-RPC only.
# Canonical: this repo.  Live: ~/apps/harness-runtime/dsh-acp.sh (root shim).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
export HARNESS_RUNTIME_ROOT="${HARNESS_RUNTIME_ROOT:-$ROOT}"
export DSH_RUNTIME_ROOT="${DSH_RUNTIME_ROOT:-$HARNESS_RUNTIME_ROOT}"
export DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
export DSH_PERMISSION_MODE="${DSH_PERMISSION_MODE:-danger-full-access}"
export DSH_PROFILE="${DSH_PROFILE:-dsh-headless}"

exec /opt/homebrew/bin/python3 "$ROOT/bridges/dsh/dsh-acp.py" "$@"
