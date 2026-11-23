#!/usr/bin/env bash
# Start Metro for a physical phone without opening Chrome.
# Prefer USB (adb reverse) when a device is plugged in; otherwise LAN.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ADB="${ADB:-$(command -v adb || true)}"
if [[ -z "$ADB" && -x "${HOME}/Library/Android/sdk/platform-tools/adb" ]]; then
  ADB="${HOME}/Library/Android/sdk/platform-tools/adb"
fi

kill_port() {
  local pids
  pids="$(lsof -tiTCP:8081 -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    sleep 0.5
    pids="$(lsof -tiTCP:8081 -sTCP:LISTEN 2>/dev/null || true)"
    if [[ -n "$pids" ]]; then
      # shellcheck disable=SC2086
      kill -9 $pids 2>/dev/null || true
    fi
  fi
}

lan_ip() {
  ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true
}

usb_device() {
  [[ -n "$ADB" ]] || return 1
  "$ADB" devices 2>/dev/null | awk 'NR>1 && $2=="device" && $1 !~ /^emulator-/ {print $1; exit}'
}

kill_port

DEVICE="$(usb_device || true)"
if [[ -n "$DEVICE" ]]; then
  echo "[start-phone] USB device $DEVICE — using adb reverse (no Wi‑Fi needed)"
  "$ADB" -s "$DEVICE" reverse tcp:8081 tcp:8081
  echo
  echo "In Expo Go → Enter URL manually:"
  echo "  exp://127.0.0.1:8081"
  echo
  exec ./node_modules/.bin/expo start --go --localhost --port 8081
fi

IP="$(lan_ip)"
if [[ -z "$IP" ]]; then
  echo "[start-phone] No LAN IP on en0/en1. Plug the phone in with USB debugging, or join Wi‑Fi."
  exit 1
fi

echo "[start-phone] No USB phone detected — using LAN $IP"
echo
echo "Do NOT open the QR / URL in Chrome."
echo "Open Expo Go → Enter URL manually and paste:"
echo "  exp://$IP:8081"
echo
# --go: expo-dev-client is installed, so without this Expo serves dev-build
# links that Expo Go rejects ("This link is for a development build").
exec ./node_modules/.bin/expo start --go --lan --port 8081
