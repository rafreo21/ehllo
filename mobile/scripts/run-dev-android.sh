#!/usr/bin/env bash
set -euo pipefail

# Start Metro for the ehllo Android dev client.
# USB: run connect-android-dev.sh (or npm run android:dev:connect) with the phone plugged in.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$ANDROID_HOME/platform-tools:$PATH"

cd "$ROOT"

export APP_VARIANT="${APP_VARIANT:-production}"
METRO_PORT=8081
SCHEME="ehllo"
if [[ "$APP_VARIANT" == "staging" ]]; then
  SCHEME="ehllo-staging"
fi

if adb devices | grep -v '^List' | grep -q 'device$'; then
  echo "Forwarding phone port $METRO_PORT → Mac Metro ($METRO_PORT)…"
  adb reverse "tcp:$METRO_PORT" "tcp:$METRO_PORT"
else
  echo ""
  echo "No USB device yet — Metro will still start."
  echo "When the phone is plugged in, run:  npm run android:dev:connect"
  lan_ip="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
  if [[ -n "$lan_ip" ]]; then
    echo "Or on the same Wi‑Fi, enter in the dev menu: http://${lan_ip}:${METRO_PORT}"
  fi
  echo ""
fi

if lsof -ti:"$METRO_PORT" >/dev/null 2>&1; then
  echo "Stopping existing Metro on port $METRO_PORT…"
  lsof -ti:"$METRO_PORT" | xargs kill -9 2>/dev/null || true
  sleep 1
fi

echo ""
echo "Starting Metro for dev client. Keep this terminal open."
echo "First-time / live updates not working:  npm run android:dev:connect"
echo "Release APK (no live reload):           npm run android:install"
echo ""

npx expo start --dev-client --clear --port "$METRO_PORT" --lan --scheme "$SCHEME"
