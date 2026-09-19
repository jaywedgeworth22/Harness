#!/usr/bin/env bash
# Publish Harness web (127.0.0.1:3080) on this Mac's Tailscale HTTPS port 3080.
# Idempotent.  Does not funnel (tailnet only).
# Live install: ~/apps/harness-runtime/scripts/serve-tailscale.sh
set -euo pipefail

PORT="${DSH_WEB_PORT:-3080}"
TARGET="http://127.0.0.1:${PORT}"
HOST="${HARNESS_TAILNET_HOST:-macbook.boa-roygbiv.ts.net}"

if ! command -v tailscale >/dev/null 2>&1; then
  echo "harness serve-tailscale: tailscale CLI not on PATH" >&2
  exit 127
fi

tailscale serve --bg --https "$PORT" "$TARGET"
echo "harness-web on Tailscale: https://${HOST}:${PORT} -> ${TARGET}"
