#!/bin/bash
# Driver for building, launching, and screenshotting the ehllo
# mobile app (Expo/React Native) on the iOS Simulator.
#
# Usage:
#   driver.sh boot [device-name]        # boot a simulator (default: "iPhone 17 Pro")
#   driver.sh run [device-name]         # pod install + expo run:ios against a booted/bootable sim
#   driver.sh foreground                # re-launch the already-installed app (bring to front)
#   driver.sh screenshot <out.png>      # screenshot the currently booted simulator
#   driver.sh full [device-name] <out.png>  # boot + run + screenshot in one go

export APP_VARIANT="${APP_VARIANT:-production}"
if [ "$APP_VARIANT" = "staging" ]; then
  BUNDLE_ID="com.ehllo.app.staging"
else
  BUNDLE_ID="com.ehllo.app"
fi
set -euo pipefail

# CocoaPods needs a UTF-8 locale or `pod install` crashes in Ruby's
# unicode_normalize step (Encoding::CompatibilityError). See Gotchas.
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

MOBILE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

resolve_udid() {
  local name="${1:-iPhone 17 Pro}"
  xcrun simctl list devices available | awk -F'[()]' -v name="$name" '
    $0 ~ name { print $2; exit }
  '
}

cmd_boot() {
  local name="${1:-iPhone 17 Pro}"
  local udid
  udid="$(resolve_udid "$name")"
  if [ -z "$udid" ]; then
    echo "No available simulator matching '$name'. Run: xcrun simctl list devicetypes" >&2
    exit 1
  fi
  local state
  state="$(xcrun simctl list devices | grep "$udid" | sed -E 's/.*\((Booted|Shutdown)\).*/\1/')"
  if [ "$state" != "Booted" ]; then
    xcrun simctl boot "$udid"
    open -a Simulator
  fi
  echo "$udid"
}

cmd_run() {
  local name="${1:-iPhone 17 Pro}"
  local udid
  udid="$(cmd_boot "$name")"
  cd "$MOBILE_DIR"
  # ios/ reflects whichever variant it was last prebuilt for - the bundle ID
  # is baked into Info.plist, so switching variants needs a clean prebuild.
  local variant_marker="$MOBILE_DIR/ios/.variant-configured"
  if [ ! -f "$variant_marker" ] || [ "$(cat "$variant_marker" 2>/dev/null)" != "$APP_VARIANT" ]; then
    npx expo prebuild --platform ios --clean
    echo "$APP_VARIANT" > "$variant_marker"
  fi
  npx expo run:ios --device "$udid"
}

cmd_foreground() {
  xcrun simctl launch booted "$BUNDLE_ID"
}

cmd_screenshot() {
  local out="${1:?usage: driver.sh screenshot <out.png>}"
  xcrun simctl io booted screenshot "$out"
  echo "$out"
}

cmd_full() {
  local name="${1:-iPhone 17 Pro}"
  local out="${2:?usage: driver.sh full [device-name] <out.png>}"
  cmd_run "$name"
  sleep 20   # let the dev-client finish bundling before capturing
  cmd_screenshot "$out"
}

case "${1:-}" in
  boot) shift; cmd_boot "$@" ;;
  run) shift; cmd_run "$@" ;;
  foreground) shift; cmd_foreground "$@" ;;
  screenshot) shift; cmd_screenshot "$@" ;;
  full) shift; cmd_full "$@" ;;
  *)
    echo "usage: driver.sh {boot|run|foreground|screenshot|full} [args]" >&2
    exit 1
    ;;
esac
