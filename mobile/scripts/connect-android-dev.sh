#!/usr/bin/env bash
set -euo pipefail

# Install the debug dev client (if needed), forward Metro, and open ehllo on a USB phone.
# Use this when live updates are not showing — usually means the release APK is installed.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

export APP_VARIANT="${APP_VARIANT:-production}"
if [[ "$APP_VARIANT" == "staging" ]]; then
  PACKAGE="com.ehllo.app.staging"
  SCHEME="ehllo-staging"
else
  PACKAGE="com.ehllo.app"
  SCHEME="ehllo"
fi

APK="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
METRO_PORT=8081

cd "$ROOT"

if [[ ! -f "$APK" ]]; then
  echo ""
  echo "Debug dev client APK not found."
  echo "Build it once with:  npm run android:dev-client"
  echo ""
  exit 1
fi

echo ""
echo "ehllo — connect phone for live updates"
echo "=========================================="
echo ""
echo "On your phone:"
echo "  • Settings → Developer options → USB debugging ON"
echo "  • USB mode: File transfer (MTP), not charge-only"
echo "  • Tap Allow on the USB debugging prompt"
echo ""
echo "Waiting for Android device…"

adb wait-for-device

boot=""
for _ in $(seq 1 90); do
  boot="$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
  [[ "$boot" == "1" ]] && break
  sleep 2
done

device="$(adb devices | awk '/device$/{print $1; exit}')"
if [[ -z "$device" ]]; then
  echo ""
  echo "Device connected but not authorized. Unlock the phone and tap Allow on the USB debugging prompt."
  exit 1
fi

echo "Device: $device"

if adb shell run-as "$PACKAGE" true >/dev/null 2>&1; then
  echo "Dev client already installed (debug build)."
else
  echo "Release or unknown build detected — installing debug dev client…"
  adb install -r -d "$APK"
fi

echo "Forwarding phone port $METRO_PORT → Mac Metro…"
adb reverse "tcp:$METRO_PORT" "tcp:$METRO_PORT"

lan_ip="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
dev_url="http://127.0.0.1:$METRO_PORT"
if [[ -n "$lan_ip" ]]; then
  echo "Wi‑Fi fallback (same network, no USB forward): http://${lan_ip}:${METRO_PORT}"
fi

encoded_url="$(python3 -c "import urllib.parse; print(urllib.parse.quote('$dev_url', safe=''))")"
deep_link="${SCHEME}://expo-development-client/?url=${encoded_url}"

echo "Opening ehllo dev client…"
adb shell am start -a android.intent.action.VIEW -d "$deep_link" >/dev/null 2>&1 \
  || adb shell monkey -p "$PACKAGE" -c android.intent.category.LAUNCHER 1 >/dev/null

echo ""
echo "Connected."
echo "  • Keep Metro running:  npm run android:dev"
echo "  • After code changes: shake phone → Reload"
echo "  • Dev APK path: mobile/android/app/build/outputs/apk/debug/app-debug.apk"
echo ""
