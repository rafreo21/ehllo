# ehllo mobile — Home screen widget bugs: full investigation report

Repo: `site/mobile` (Expo SDK 57 / React Native 0.86). App: `com.ehllo.app.staging` ("ehllo Staging"), EAS project `aftermeet-staging`, channel/branch `staging`, runtime version `1.1.0`, native build 9 (commit `58c0072`). None of the changes below are committed to git yet — working tree is dirty.

## Original report
- iOS widgets (Recent Connections, Business Card, QR Scan) render broken for real testers; Android testers were unaffected.
- The Recent Connections widget's envelope icon (follow-up email) should produce the same email content as the in-app follow-up flow, on both platforms, online or offline.

## Confirmed root causes, fixed and shipped

### 1. Real-device WidgetKit memory crash (the original "white widget" bug)
- **Cause**: `node_modules/@expo/ui/ios/ImageView.swift:44-51` decodes every `<Image uiImage={...}>` via `Data(contentsOf: url)` + `UIImage(data: data)` — full native-resolution decode, no downsampling. `src/lib/widget-assets.ts`'s `cacheWidgetPhotoUri` downloaded remote profile photos with no resizing before writing them into the App Group container. A real phone photo (3000-4000px) decodes to 40-60MB RGBA; widget extensions have a strict real-device memory ceiling (~30MB, historically) that the Simulator does not enforce, so this was invisible there.
- **Fix**: `src/lib/widget-assets.ts` — `downsizeForWidget()` uses `expo-image-manipulator` to resize to 160px (avatars) / 128px (logo) before the App Group write. Output format is PNG (not JPEG, to preserve transparency).
- **Verified**: direct inspection of the Simulator's App Group container showed correctly-sized 160×160 PNG files after the fix ran (`~/Library/Developer/CoreSimulator/Devices/<udid>/data/Containers/Shared/AppGroup/<group-id>/widget-photo-*.png`).

### 2. Logo cache staleness (found via self-review)
- `ensureWidgetLogoUri()` short-circuited on `existing.exists`, so devices that had already cached the old full-resolution logo before the downsizing fix would never receive the smaller one.
- **Fix**: versioned the filename (`widget-logo.png` → `widget-logo-v2.png`).

### 3. Scratch-file race under concurrent syncs (found via self-review)
- `cacheWidgetPhotoUri`'s scratch path was deterministic per fileKey; two overlapping `syncAllWidgets` calls (no lock existed at the time) could race and delete each other's in-flight file.
- **Fix**: random nonce added to the scratch filename.

### 4. Follow-up email content diverged from the in-app flow
- `widget-sync.ts`'s local `followUpMailUrl()` hand-rolled its own subject/body instead of the app's real builder.
- **Fix**: now calls `buildFollowUpMailto()` from `src/features/follow-ups/action-links.ts` directly — single source of truth, consumed by both the iOS widget and Android's Kotlin renderer (`WidgetRenderer.kt` reads the same JS-computed `connectionNMail` field).
- Also added email-format validation to the bare-mailto fallback on both platforms (`widgets/RecentConnectionsWidget.tsx`, `android/.../WidgetRenderer.kt`) so a malformed address doesn't produce a guaranteed-broken link.

### 5. QR image silently lost on sync (found from a real screenshot: a genuinely published card showing "Publish your card")
- **Cause**: two independent, unlocked entry points call `buildWidgetSnapshot()` — the real `syncAllWidgets()` path, and a live preview in `src/features/card/card-tool-sheets.tsx`'s `WidgetToolSheetContent` (the "Card tools → Home screen widgets" sheet). Both hit the same shared, serial QR-render queue (`src/lib/widget-qr-renderer.tsx` — a single-item queue with a 4s-per-item timeout) and the same deterministic QR file path (keyed by card id). Two overlapping calls can race: one succeeds, the other times out and loses its `qrImageUri` (dropped silently by `JSON.stringify`, which omits `undefined` keys); whichever finishes **last** overwrites the whole App Group snapshot, even if it's the one that failed.
- Diagnosed via temporary `console.log` instrumentation (since removed) that caught a `buildWidgetQrFileUri` call firing *before* `syncAllWidgets`'s own logged start — proof of an untracked second caller.
- First fix attempt (a lock wrapping only `syncAllWidgets`) was verified **insufficient** via before/after plist reads — it didn't cover the preview sheet's independent call site.
- **Real fix**: the lock now wraps `buildWidgetSnapshot()` itself (`widgetSnapshot` → `snapshotChain` promise chain in `widget-sync.ts`), the actual shared resource, so every caller is serialized against every other.
- **Verified**: Simulator App Group plist read showed `qrImageUri` present and correct after the fix, across multiple clean cold launches.

### 6. "Refresh home-screen widgets" button lied about success
- `syncCardToolsForCard()` (`src/features/card/card-tools-sync.ts`) swallowed every error internally and never re-threw, so the button's unconditional `successMessage: 'Widget data refreshed...'` fired even when the sync had actually failed — meaning testers had no way to know a refresh had failed.
- **Fix**: added an opt-in `{ rethrow: true }` parameter, used only by the explicit Refresh button in `src/app/card-tools.tsx` (every other caller — app launch, card publish — keeps the original best-effort swallow, by design, so a widget hiccup can't break those screens).

### 7. Zero visibility into silent widget-asset failures
- Six separate `try/catch` blocks in `widget-sync.ts` (card QR, card photo, connection photo, logo, primary-QR fallback, load-connections) swallowed errors completely silently by design (graceful degradation — a missing QR shouldn't break the photo) — but that meant real failures were invisible to everyone, including me.
- **Fix**: added `reportWidgetAssetFailure(step, caught)` — logs via `console.warn` and reports to Sentry (`level: 'warning'`, tag `widget_asset_step: <step>`) without changing the degrade-gracefully behavior. Also added `Sentry.captureException` (tag `widget_sync_platform: ios|android`) to the two top-level sync-failure paths.
- **This instrumentation immediately worked** — surfaced 3 real Sentry issues from an actual tester's device within minutes of shipping (see below).

### 8. White background on iOS < 17 — CONFIRMED root cause, fix shipped, not yet visually verified
- **Cause**: `node_modules/@expo/ui/ios/Modifiers/ContainerBackgroundModifier.swift:30-46`:
  ```swift
  if #available(iOS 18.0, *) {
    content.containerBackground(color, for: container.toContainerBackgroundPlacement)
  } else if #available(iOS 17.0, *) {
    content.containerBackground(color, for: .widget)
  } else {
    content   // iOS < 17: complete no-op
  }
  ```
  On iOS 16.x this call does **nothing** — no background is ever painted — and WidgetKit falls back to its own default light/white widget background. `ios/Podfile` sets `platform :ios, ... || '16.4'`, so the app explicitly targets iOS 16.4+, but every widget relied solely on `containerBackground` with no fallback.
- **Fix**: added a plain `.background(color)` call (via `BackgroundModifier.swift`, which has **no** version gating) alongside `containerBackground` in the root modifiers array of all three widget files: `widgets/BusinessCardWidget.tsx`, `widgets/QrScanWidget.tsx`, `widgets/RecentConnectionsWidget.tsx`.
- **Status**: shipped via OTA (iOS update id `01a029ee-027f-73f7-a9d0-380bb501f888`); confirmed via Sentry that the affected device (see below) has that exact update id; **not yet visually confirmed on-device**, because that same device is still blocked by issue #9 below, which co-occurs and makes it hard to isolate.

## Confirmed but unresolved

### 9. App Group container "not writable" on a specific real device
- **Sentry issues**: `EHLLO-MOBILE-12`, `13`, `14`, `15` (https://ehllo.sentry.io/issues/EHLLO-MOBILE-12 etc.)
- **Errors**:
  ```
  Error: FunctionCallException: Calling the 'copyAsync' function has failed
  → Caused by: FileNotWritableException: File '/var/mobile/Containers/Shared/AppGroup/<group-uuid>/widget-logo-v2.png' is not writable (at ExpoFileSystem/FileSystemHelpers.swift:67)
  ```
  ```
  Error: FunctionCallException: Calling the 'writeAsStringAsync' function has failed
  → Caused by: FileNotWritableException: File '.../quick-share-qr-<id>.png' is not writable
  ```
  ```
  Error: ArgumentCastException: The 2nd argument cannot be cast to type String
  → Caused by: ConversionToNativeFailedException: Conversion from JavaScript value of type 'undefined' to native 'String' failed
  ```
  (`widget_asset_step` tags: `logo`, `card QR`, `primary QR fallback` — all three write paths failing identically, plus a downstream crash likely from the same root cause: `Paths.appleSharedContainers[id]` can resolve "truthy" in JS even when the underlying container URI is unusable, so code passes `undefined` into a native String-typed argument somewhere downstream.)
- **Device**: iPhone 8 (`iPhone10,4`), iOS 16.7.12 (build 20H364), 2GB RAM, Sentry user `52564b06-837c-4480-9361-0db339f8c1b6`, geo GB.
- **Root cause traced to**: `node_modules/expo-modules-core/ios/FileSystemUtilities/FileSystemUtilities.swift` — before any write, the native layer checks `appContext.config.appGroupSharedDirectories`, resolved from iOS's `containerURL(forSecurityApplicationGroupIdentifier:)` at app launch. If iOS returns `nil` for that call on a given device (a known real-world quirk on devices with many recent app reinstalls/updates to the same App Group, which this device has had today), **every** write into the App Group fails exactly this way — independent of entitlements, which were separately verified correct for this build's IPA (`security cms -D` + `codesign -d --entitlements` on both the main app and the widget extension target, both showing `group.com.ehllo.app.staging` correctly signed).
- **Not yet fixed in code.** `appleWidgetGroup()` in `widget-assets.ts`/`widget-qr.ts` only checks truthiness of `Paths.appleSharedContainers[id]`, which is apparently not a reliable signal that the container is actually writable on this device.
- **Recommended next step (untested)**: full app delete + reinstall on the affected device, to force iOS to reprovision the App Group container from scratch. Not yet confirmed effective — write errors were still appearing in Sentry as of the last check.
- **Possible code hardening to investigate**: can `widget-assets.ts` detect an unusable App Group directory *before* attempting a write (e.g. probe with a lightweight read/stat) and fail fast/cleanly instead of relying on the native exception? Is there a retry-with-backoff or a "recreate container" path available via `expo-file-system`?

### 10. Signed-out devices never sync at all — undiagnosed for two specific devices
- `src/features/card/card-context.tsx`'s `sync()`:
  ```ts
  const sync = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !session || !isOnline()) return;
    ...
  ```
  With no session, this returns immediately — **no** call to `persistCards`/`syncCardToolsForCard`/`syncAllWidgets` ever happens. A widget checked on a never-signed-in device has zero snapshot/layout data written for it, ever.
- `node_modules/expo-widgets/ios/Widgets/EntryView.swift:27-35` falls back to a `RedBoxView` (a red-background "No layout found for ..." card) when no layout string exists in storage — but that is **not** what was reported (see below), so this theory does not fully explain the two reports it was meant to explain.
- **Reports needing this investigation**:
  - iPhone 11 Pro, "latest iOS" (exact version unconfirmed) — reported white background, **including in the widget gallery** (i.e. before ever adding the widget to a home screen).
  - iPhone 17 (real hardware), iOS version unconfirmed — reported the widget "renders nothing at all."
  - Both reports came *before* the tester had signed into the account on either device.
- **Checked and ruled out nothing conclusively**: queried Sentry for all `level:warning OR level:error` events project-wide over the last hour — **zero events from any device other than the iPhone 8 above**. So either these two devices haven't picked up any of tonight's OTA updates at all (meaning even the original memory-crash bug could still be live and un-instrumented there, and "renders nothing at all" would be consistent with a native widget-extension crash, which happens in a process Sentry-for-React-Native never touches), or their failure mode doesn't reach any instrumented JS path.
- **Open, unanswered questions for whoever picks this up**:
  1. What is `Updates.updateId` (visible in-app under Settings, format `staging · runtime 1.1.0 · update <8-char-prefix> · <timestamp>`) on the iPhone 11 Pro and the iPhone 17? Compare against `01a029ee` (latest shipped fix). This was asked for twice and never obtained before the conversation moved on.
  2. Now that the tester has signed in on both devices (per the user's last message in the original thread — confirm this actually happened), do the widgets render correctly? If not, check Sentry again for those two device models specifically.
  3. Does `card-context.tsx` need a companion path that writes a "signed out" snapshot independently of `session`, so a signed-out widget shows "Sign in to ehllo" instead of nothing/a red box/white? A code comment near `persistCards` (~line 165) claims the signed-out case is handled, but that appears to only cover "don't skip a sync in progress because the card list is empty" — not "trigger a sync at all for a user who has never authenticated." This needs verification against actual behavior, not just the comment's claim.

## Not shipped
- The Android native fix (`android/app/src/main/java/com/ehllo/app/staging/widget/WidgetRenderer.kt` — email format validation via `Patterns.EMAIL_ADDRESS`) is Kotlin, not JS — it cannot ship via `eas update`. It needs a new native build to reach Android testers. Low severity (only affects malformed-email edge cases), not blocking.

## Environments
- **Simulator** (all direct file/plist verification): iPhone 17 Pro, iOS 26.5.
- **Real device A** (all current Sentry data): iPhone 8, `iPhone10,4`, iOS 16.7.12, build 20H364, 2GB RAM / ~2GB usable, geo GB (Lambeth/Finchley), Sentry user `52564b06-837c-4480-9361-0db339f8c1b6`.
- **Real device B**: iPhone 11 Pro, iOS version unconfirmed ("latest"), zero Sentry telemetry.
- **Real device C**: iPhone 17 (real hardware), iOS version unconfirmed, zero Sentry telemetry.

## OTA updates published this session (`eas update --branch staging --environment preview`)
1. Group `95ac4fab-2b2f-4918-b65b-7cb9d6191058` — memory-crash downsizing, logo/nonce/PNG fixes, email unification, first (insufficient) QR-race lock attempt.
2. Group `ae1b2a79-aee9-4d72-b4c6-08160b14c44a` — real QR-race fix (lock moved to `buildWidgetSnapshot`), Refresh-button honesty fix, Sentry instrumentation on all 8 failure points.
3. Group `7de959ff-1290-4b95-a1f9-2113c2fc0f46` — iOS 16 `background()` fallback (iOS update id `01a029ee-027f-73f7-a9d0-380bb501f888`).

## Files changed this session (all uncommitted)
- `site/mobile/src/lib/widget-assets.ts`
- `site/mobile/src/features/card/widget-sync.ts`
- `site/mobile/src/features/card/card-tools-sync.ts`
- `site/mobile/src/app/card-tools.tsx`
- `site/mobile/src/app/(tabs)/index.tsx` — unrelated feature also shipped this session: dismissible follow-up "nudge" cards now scroll horizontally when there's more than one, instead of stacking vertically.
- `site/mobile/widgets/RecentConnectionsWidget.tsx`
- `site/mobile/widgets/BusinessCardWidget.tsx`
- `site/mobile/widgets/QrScanWidget.tsx`
- `site/mobile/android/app/src/main/java/com/ehllo/app/staging/widget/WidgetRenderer.kt` (native, not yet shipped)

## Suggested priority order for further debugging
1. Get the iPhone 11 Pro / iPhone 17 update-id + post-sign-in retest data — this determines whether #10 is even still relevant or was just the signed-out gap all along.
2. If still broken post-sign-in: check Sentry for those device models specifically before writing any more code.
3. Resolve #9 (App Group not writable) on the iPhone 8 — confirm whether delete+reinstall fixes it; if not, this needs Apple-side or `expo-file-system`-level investigation, possibly a GitHub issue against `expo-modules-core`.
4. Decide whether #10's signed-out snapshot gap is worth fixing regardless (better UX: "Sign in to ehllo" beats a red error box or nothing).
5. Native Android build for the `WidgetRenderer.kt` fix, whenever the next Android build ships anyway.

## Codex follow-up stress review (22 Aug 2026)

- **#10 signed-out snapshot gap: fixed in code.** After local card storage hydrates,
  `card-context.tsx` now writes an explicit signed-out widget snapshot even when there is no
  session and no card. The write uses the real error-returning path and retries twice with a
  bounded backoff; it does not loop forever on a broken native bridge.
- **#9 App Group failure: hardened, not root-fixed.** `widget-assets.ts` now validates that the
  resolved App Group has a string URI and performs one cached write/delete probe per process.
  Logo, photo, and QR writes stop after a failed probe, and the probe produces one tagged
  Sentry warning instead of a cascade. This cannot repair an iOS container that the OS failed
  to mount; delete/reinstall on the affected iPhone 8 is still required to test that root cause.
- The review found and corrected two flaws in the first Codex pass: the signed-out retry was
  initially routed through a best-effort wrapper that swallowed its rejection, and photo-cache
  errors were swallowed below the Sentry reporting boundary. Photo failures now propagate to
  the snapshot builder for graceful fallback plus telemetry, and temporary files are cleaned in
  `finally` even when the App Group copy fails.
- Verification completed: `npm run typecheck`, `npm run lint`, iOS Expo export, and Android Expo
  export all pass. These checks validate JS/TS and OTA bundling; they do **not** prove that the
  iPhone 8's OS-level App Group container is repaired or that WidgetKit renders on the three
  physical devices.
