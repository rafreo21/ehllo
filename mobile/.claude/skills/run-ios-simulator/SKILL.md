---
name: run-ios-simulator
description: Build, run, and screenshot the ehllo mobile app (Expo/React Native) on the iOS Simulator. Use when asked to run the mobile app, start it on the simulator, build the iOS app, take a screenshot of the mobile UI, or verify a mobile change actually works.
---

ehllo's mobile app lives in `mobile/` (Expo SDK 57, React Native 0.86, bundle ids `com.ehllo.app` and `com.ehllo.app.staging`). Drive it via `.claude/skills/run-ios-simulator/driver.sh`, which wraps `xcrun simctl` + `expo run:ios` for boot/build/launch/screenshot. All paths below are relative to `mobile/`.

## Prerequisites (macOS only - this app has no meaningful Linux/headless path)

- Xcode + iOS Simulator runtimes installed (`xcrun simctl list runtimes` should show at least one `iOS` runtime).
- CocoaPods **1.13+** (current React Native/Expo podspecs use `visionos.deployment_target`, which older CocoaPods can't parse). Check with `pod --version`; if too old:
  ```bash
  brew upgrade cocoapods
  ```
- A UTF-8 locale exported before any `pod install` / `expo run:ios` call - see Gotchas.

## Setup

```bash
cd mobile
npm install
```

## Run (agent path)

Use the driver - it exports the required locale, resolves a simulator by name, and drives the whole build/launch/verify loop.

```bash
# 1. Boot a simulator (default "iPhone 17 Pro"; prints the UDID)
.claude/skills/run-ios-simulator/driver.sh boot "iPhone 17 Pro"

# 2. Build + install + launch (pod install runs automatically; first build
#    is several minutes, incremental builds are much faster)
.claude/skills/run-ios-simulator/driver.sh run "iPhone 17 Pro"

# 3. Screenshot the running app
.claude/skills/run-ios-simulator/driver.sh screenshot /tmp/aftermeet-sim.png
```

Or do all three in sequence (boots, builds/runs, waits for the JS bundle, then screenshots):

```bash
.claude/skills/run-ios-simulator/driver.sh full "iPhone 17 Pro" /tmp/aftermeet-sim.png
```

If the simulator goes idle and the app backgrounds itself to the home screen, bring it back to the front without rebuilding (state is preserved):

```bash
.claude/skills/run-ios-simulator/driver.sh foreground
```

| driver.sh command | what it does |
|---|---|
| `boot [device-name]` | Resolves a simulator by name and boots it if not already booted; prints the UDID |
| `run [device-name]` | `expo run:ios --device <udid>` - pod install, xcodebuild, install, launch |
| `foreground` | `simctl launch booted <bundle-id>` - re-launch the already-installed app |
| `screenshot <out.png>` | `simctl io booted screenshot` |
| `full [device-name] <out.png>` | boot + run + sleep 20s (let bundling finish) + screenshot |

Look at the screenshot after every step - first launch shows a splash screen with "Bundling NN%…", then a one-time Expo dev-client "developer menu" overlay (not an error - has a "Continue" button), then the actual app UI.

## Run (human path)

```bash
cd mobile
npm run ios   # expo run:ios - same as driver.sh run, but picks a default/prompted simulator
```

## Test

```bash
cd mobile
npm run typecheck   # tsc --noEmit
npm run lint        # expo lint
```

Measured 2026-08-18: `npm run typecheck` is **clean (0 errors)** and `npm run lint` reports **17 problems** (8 errors, 9 warnings), all pre-existing - impure-call-during-render in `(tabs)/settings.tsx`, setState-in-effect in `settings/edit-profile.tsx`, unused imports, one unescaped entity, and import ordering plus "value cannot be modified" in `method-list-editor.tsx`. The earlier note here claimed ~3 type errors and a 45-error/26-warning lint baseline; both were stale, and a stale baseline is worse than none - it invites you to wave through a regression as pre-existing. Re-measure rather than trusting this line, and update it when you do.

## Gotchas

- **`pod install` crashes with `Encoding::CompatibilityError` in `unicode_normalize`** if the shell's locale is unset (bare `C` locale - check with `locale`; `LANG=""` is the tell). CocoaPods' Ruby code requires UTF-8. The driver exports `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` itself; if you run `pod install` manually outside the driver, export these first.
- **Outdated CocoaPods (e.g. 1.11.3 from an old Homebrew install) fails with `undefined method 'visionos' for #<Pod::Specification ...>`** - current RN/Expo podspecs (e.g. `react-native-safe-area-context.podspec`) set `s.visionos.deployment_target`, which only newer CocoaPods understands. Fix is `brew upgrade cocoapods` (confirmed working at 1.17.0), not a podspec edit.
- **The app backgrounds itself to the home screen after sitting idle** in the simulator (observed after ~1 minute with no interaction). This isn't a crash - `driver.sh foreground` (i.e. `simctl launch booted com.ehllo.app`) brings it back in front with state intact, no rebuild needed.
- Device names in `boot`/`run` must match a string from `xcrun simctl list devicetypes` (e.g. "iPhone 17 Pro", "iPhone 16"); the match is a substring check against `xcrun simctl list devices available`, so pick something unambiguous.

## Gotchas that cost real time

- **Two apps are installed on the simulator**: `com.ehllo.app` ("ehllo") and
  `com.ehllo.app.staging` ("ehllo Staging"), each with its own scheme -
  `ehllo://` and `ehllo-staging://` respectively (see `scheme` in
  `app.config.js`). `expo run:ios` builds and installs **one** of them, so a
  deep link on the other scheme opens a different, older binary with its own
  stale JS. The symptom is a screen that never changes no matter how many times
  you reload, which reads exactly like a broken Fast Refresh. Check with
  `xcrun simctl listapps booted | grep -iE 'ehllo|aftermeet'`, and confirm which
  app is frontmost from the status-bar back-label in a screenshot.
- **A long-lived Metro serves stale code.** A dev server left running for days
  stops picking up file changes; edits land on disk, typecheck fine, and never
  reach the app. Check its age with `ps -p $(lsof -ti:8081) -o etime,command`
  and restart with `--clear` if it is not minutes old. Verify from disk first
  (`grep` the file) so you are not debugging the bundler when the edit itself
  failed.
- **`simctl openurl` prompts "Open in <app>?"** on current iOS, and `simctl`
  cannot tap. Return does not accept it - the dialog needs a real click. Read
  the Simulator window rect via System Events, then click the scaled
  coordinate:
  ```bash
  osascript -e 'tell application "System Events" to tell process "Simulator" \
    to return {position, size} of first window'
  osascript -e 'tell application "System Events" to click at {x, y}'
  ```
  Each unaccepted `openurl` queues another copy of the dialog, so avoid firing
  it repeatedly while debugging.

## Troubleshooting

- **`Unable to determine whether to build 'React-jsinspector' as a module due to a conflict...` during `pod install`**: informational, not fatal - CocoaPods defaults to skipping the module and install still succeeds. Same for the various `<Pod> has added N script phases` warnings.
- **`No available simulator matching '<name>'` from `driver.sh boot`**: the device type isn't installed for any runtime on this machine. Run `xcrun simctl list devicetypes` to see installed types, or open Xcode → Settings → Platforms to add an iOS runtime.
