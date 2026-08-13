#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"

export APP_VARIANT="${APP_VARIANT:-production}"
if [[ "$APP_VARIANT" == "staging" ]]; then
  PACKAGE="com.ehllo.app.staging"
else
  PACKAGE="com.ehllo.app"
fi

REBUILD=0
for arg in "$@"; do
  if [[ "$arg" == "--rebuild" ]]; then
    REBUILD=1
  fi
done

cd "$ROOT"
APK="$ROOT/android/app/build/outputs/apk/release/app-release.apk"
VARIANT_MARKER="$ROOT/android/.variant-configured"

# The native project (android/) reflects whichever variant it was last
# prebuilt for — switching variants always needs a clean prebuild, not just
# a rebuild, since the package name/app name are baked into the manifest.
if [[ ! -f "$VARIANT_MARKER" || "$(cat "$VARIANT_MARKER" 2>/dev/null)" != "$APP_VARIANT" ]]; then
  REBUILD=1
fi

if [[ "$REBUILD" == "1" || ! -f "$APK" ]]; then
  echo "Building ehllo standalone release APK ($APP_VARIANT, JS bundle embedded — no Metro required)…"
  echo "This can take several minutes on a clean rebuild."
  if [[ "$REBUILD" == "1" ]]; then
    npx expo prebuild --platform android --clean
    echo "$APP_VARIANT" > "$VARIANT_MARKER"
  fi
  # Use Gradle directly — expo run:android waits on Metro and may try to launch an emulator.
  (cd "$ROOT/android" && ./gradlew assembleRelease)
fi

echo "Waiting for Android device…"
adb wait-for-device
boot=""
for _ in $(seq 1 90); do
  boot="$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
  [[ "$boot" == "1" ]] && break
  sleep 2
done

echo "Installing $APK"
adb install -r -d "$APK"
adb shell am start -n "$PACKAGE/.MainActivity"
echo ""
echo "Done."
echo ""
echo "  ⚠️  RELEASE BUILD — JavaScript is baked in. No live reload."
echo "  For live updates while developing, use the dev client instead:"
echo "    npm run android:dev-client   # once"
echo "    npm run android:dev          # Metro"
echo "    npm run android:dev:connect  # USB connect"
echo ""
echo "  Standalone build — opens without Metro on your Mac."
echo "  Sign in with rafreo21@gmail.com to receive a 6-digit OTP (Resend sandbox)."
echo "  For live JS reload while developing:"
echo "    npm run android:dev-client   # install dev build once"
echo "    npm run android:dev          # start Metro + USB forward"
echo "  Force a fresh native rebuild anytime:"
echo "    npm run android:rebuild"
