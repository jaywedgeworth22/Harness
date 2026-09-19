#!/usr/bin/env bash
# Publish DeepSeek Harness web (127.0.0.1:3080) on this Mac's Tailscale
# HTTPS port 3080.  Idempotent.  Does not funnel (tailnet only).
# Tracked copy: ai-fleet-coordinator/scripts/dsh-runtime/serve-tailscale.sh
# Live install: ~/apps/dsh-runtime/serve-tailscale.sh
set -euo pipefail

PORT="${DSH_WEB_PORT:-3080}"
TARGET="http://127.0.0.1:${PORT}"

if ! command -v tailscale >/dev/null 2>&1; then
  echo "dsh serve-tailscale: tailscale CLI not on PATH" >&2
  exit 127
fi

# Background persist in tailscaled.  Same mapping is a no-op.
tailscale serve --bg --https "$PORT" "$TARGET"
echo "dsh web on Tailscale: https://macbook.boa-roygbiv.ts.net:${PORT} -> ${TARGET}"
