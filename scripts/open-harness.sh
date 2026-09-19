#!/usr/bin/env bash
# Open (or focus) the local Harness window.  No Terminal.
# The Dock app is a WKWebView shell; this script just launches/activates it.
# Display name "Harness"; on-disk name `Harness.app`; bundle id
# `com.jays.dsh-harness-web`.
set -euo pipefail
APP="${HOME}/Applications/Harness.app"
if [[ -d "$APP" ]]; then
  open -a "$APP"
  exit 0
fi
# Fallback if the .app is missing: ensure server and open the URL.
"${HOME}/apps/dsh-runtime/ensure-web.sh" || true
open "${DSH_WEB_URL:-http://127.0.0.1:3080/}"
