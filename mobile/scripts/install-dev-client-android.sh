#!/usr/bin/env bash
set -euo pipefail

# Build and install the ehllo dev client (expo-dev-client + Metro live reload).
# Use this instead of the release APK while developing UI/JS changes.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

export APP_VARIANT="${APP_VARIANT:-production}"

REBUILD=0
for arg in "$@"; do
  if [[ "$arg" == "--rebuild" ]]; then
    REBUILD=1
  fi
done

cd "$ROOT"
node scripts/patch-react-native-hce.mjs
APK="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
MARKER="$ROOT/android/.dev-client-configured"
VARIANT_MARKER="$ROOT/android/.variant-configured"

# Switching variants always needs a clean prebuild — package name/app name
# are baked into the native manifest, not just the JS bundle.
if [[ ! -f "$VARIANT_MARKER" || "$(cat "$VARIANT_MARKER" 2>/dev/null)" != "$APP_VARIANT" ]]; then
  REBUILD=1
fi

if [[ "$REBUILD" == "1" || ! -f "$MARKER" ]]; then
  echo "Configuring Android project for expo-dev-client ($APP_VARIANT)…"
  if [[ "$REBUILD" == "1" ]]; then
    npx expo prebuild --platform android --clean
    echo "$APP_VARIANT" > "$VARIANT_MARKER"
  else
    npx expo prebuild --platform android
  fi
  echo "dev-client" > "$MARKER"
fi

if [[ "$REBUILD" == "1" || ! -f "$APK" ]]; then
  echo "Building debug dev client APK (connects to Metro on your Mac)…"
  (cd "$ROOT/android" && ./gradlew assembleDebug --no-daemon)
fi

echo "Waiting for Android device…"
adb wait-for-device
boot=""
for _ in $(seq 1 90); do
  boot="$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
  [[ "$boot" == "1" ]] && break
  sleep 2
done

echo "Forwarding Metro port 8081…"
adb reverse tcp:8081 tcp:8081

if [[ "$APP_VARIANT" == "staging" ]]; then
  PACKAGE="com.ehllo.app.staging"
  SCHEME="ehllo-staging"
else
  PACKAGE="com.ehllo.app"
  SCHEME="ehllo"
fi

echo "Installing $APK"
adb install -r -d "$APK"

encoded_url="$(python3 -c "import urllib.parse; print(urllib.parse.quote('http://127.0.0.1:8081', safe=''))")"
adb shell am start -a android.intent.action.VIEW -d "${SCHEME}://expo-development-client/?url=${encoded_url}" >/dev/null 2>&1 \
  || adb shell monkey -p "$PACKAGE" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true

echo ""
echo "Dev client installed."
echo "  1. In another terminal: cd mobile && npm run android:dev"
echo "  2. Or connect USB:       cd mobile && npm run android:dev:connect"
echo "  3. Shake device → Reload after code changes"
echo ""
echo "  APK: mobile/android/app/build/outputs/apk/debug/app-debug.apk"
echo ""
echo "Release APK (no Metro): npm run android:install"
