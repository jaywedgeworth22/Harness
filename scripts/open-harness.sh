#!/usr/bin/env bash
# Open (or focus) the local Harness window.  No Terminal.
# Display name "Harness"; on-disk name `Harness.app`; bundle id
# `services.jays.harness`.
set -euo pipefail
APP="${HOME}/Applications/Harness.app"
LIVE="${HARNESS_RUNTIME_ROOT:-${HOME}/apps/harness-runtime}"
if [[ -d "$APP" ]]; then
  open -a "$APP"
  exit 0
fi
"${LIVE}/scripts/ensure-web.sh" || true
open "${DSH_WEB_URL:-http://127.0.0.1:3080/}"
