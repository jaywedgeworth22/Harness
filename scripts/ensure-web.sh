#!/usr/bin/env bash
# Start pm2 harness-web if http://127.0.0.1:3080 is down.  No Terminal, no browser.
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
URL="${DSH_WEB_URL:-http://127.0.0.1:3080/}"
PORT="${DSH_WEB_PORT:-3080}"
ECO="${HOME}/apps/pm2-ecosystem.config.cjs"
LOG="${HOME}/Library/Logs/harness-web-open.log"
LIVE="${HARNESS_RUNTIME_ROOT:-${HOME}/apps/harness-runtime}"
mkdir -p "$(dirname "$LOG")"

http_up() {
  local code
  code="$(/usr/bin/curl -s -o /dev/null -w '%{http_code}' --max-time 8 "$1" || true)"
  case "$code" in
    2*|3*|401|403) return 0 ;;
    *) return 1 ;;
  esac
}
listening() {
  /usr/sbin/lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1
}
http_up "$URL" && exit 0
# A listener on :3080 is already the web UI (auth-walled 401 counts).  Do not
# pm2 restart it — that reclaim-kills the healthy process.
if listening; then
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) ensure-web: :$PORT listening, skip restart" >>"$LOG"
  exit 0
fi

{
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) ensure-web starting harness-web"
  if [[ -f "$ECO" ]] && command -v pm2 >/dev/null 2>&1; then
    pm2 start "$ECO" --only harness-web --update-env || true
  fi
  if ! http_up "$URL" && ! listening && [[ -x "${LIVE}/scripts/start-web.sh" ]]; then
    nohup "${LIVE}/scripts/start-web.sh" >>"$LOG" 2>&1 &
  fi
} >>"$LOG" 2>&1

for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  http_up "$URL" && exit 0
  sleep 0.4
done
exit 1
