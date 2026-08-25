#!/usr/bin/env bash
set -euo pipefail

BUILD_VERSION="2026.825.8"
ROOT="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="/opt/signaldesk"
ENV_DIR="/etc/signaldesk"
ENV_FILE="$ENV_DIR/signaldesk.env"
SERVICE_FILE="/etc/systemd/system/signaldesk.service"
cd "$ROOT"

if ! id signaldesk >/dev/null 2>&1; then
  sudo useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin signaldesk
fi

sudo install -d -o signaldesk -g signaldesk -m 0755 "$APP_DIR"
sudo install -d -o root -g root -m 0755 "$ENV_DIR"
sudo install -o root -g root -m 0644 deploy/signaldesk.service "$SERVICE_FILE"
sudo install -o signaldesk -g signaldesk -m 0644 index.html app.js styles.css backend.py "$APP_DIR/"

# The installed token is deliberately preserved. This branch runs only on first setup.
if ! sudo test -s "$ENV_FILE"; then
  if [[ -n "${X_BEARER_TOKEN:-}" ]]; then
    TOKEN="$X_BEARER_TOKEN"
  else
    read -r -s -p "One-time setup: paste your X Bearer Token, then press Enter: " TOKEN
    echo
  fi
  if [[ -z "${TOKEN:-}" ]]; then
    echo "No token supplied; existing installations never reach this branch." >&2
    exit 1
  fi
  TEMP_ENV="$(mktemp)"
  printf 'X_BEARER_TOKEN=%s\nHOST=127.0.0.1\nPORT=4173\n' "$TOKEN" > "$TEMP_ENV"
  unset TOKEN
  sudo install -o root -g root -m 0600 "$TEMP_ENV" "$ENV_FILE"
  rm -f "$TEMP_ENV"
fi

sudo systemctl daemon-reload
sudo systemctl enable signaldesk >/dev/null
# enable --now does not reload a running Python process. A real restart is mandatory.
sudo systemctl restart signaldesk

HEALTH=''
for _ in $(seq 1 30); do
  if HEALTH="$(curl -fsS http://127.0.0.1:4173/health 2>/dev/null)"; then
    ACTUAL_BUILD="$(printf '%s' "$HEALTH" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("build", ""))')"
    TOKEN_READY="$(printf '%s' "$HEALTH" | python3 -c 'import json,sys; print("yes" if json.load(sys.stdin).get("token_configured") else "no")')"
    if [[ "$ACTUAL_BUILD" == "$BUILD_VERSION" && "$TOKEN_READY" == "yes" ]]; then
      echo "SignalDesk $ACTUAL_BUILD is running at http://127.0.0.1:4173/"
      if command -v xdg-open >/dev/null 2>&1; then
        xdg-open http://127.0.0.1:4173/ >/dev/null 2>&1 || true
      fi
      exit 0
    fi
  fi
  sleep 0.25
done

echo "SignalDesk failed its build/token health check. Last response: ${HEALTH:-none}" >&2
sudo systemctl status signaldesk --no-pager
exit 1
