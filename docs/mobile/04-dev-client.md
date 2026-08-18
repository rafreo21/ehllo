# Android dev client (live reload)

ehllo uses **expo-dev-client**, not Expo Go. You need the **debug dev client APK** for live JS updates. The **release APK** embeds JavaScript at build time and will **never** show live fixes.

## Quick fix (phone plugged in via USB)

Terminal 1 - Metro (keep open):

```bash
cd mobile
npm run android:dev
```

Terminal 2 - install dev client + connect:

```bash
cd mobile
npm run android:dev:connect
```

Shake the phone → **Reload** after code changes.

---

## One-time: build the dev client APK

```bash
cd mobile
npm run android:dev-client
```

This builds and installs:

`mobile/android/app/build/outputs/apk/debug/app-debug.apk`

You can copy that file to your phone and install manually (enable “Install unknown apps” for Files/Drive). You still need Metro + USB forward or same Wi‑Fi.

---

## Daily development

| Command | What it does |
|---------|----------------|
| `npm run android:dev` | Start Metro on port 8081 (live reload) |
| `npm run android:dev:connect` | USB: install debug APK if needed, `adb reverse`, open app |
| `npm run android:dev-client` | Build + install debug dev client (first time) |
| `npm run android:install` | **Release APK - no Metro, no live reload** |

---

## USB setup (Samsung / Android)

1. **Developer options** → **USB debugging** ON  
2. Plug in USB → choose **File transfer / MTP** (not charge-only)  
3. Tap **Allow** on the “Allow USB debugging?” prompt  
4. On Mac, verify:

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$ANDROID_HOME/platform-tools:$PATH"
adb devices
```

You should see your device as `device` (not `unauthorized`).

---

## Troubleshooting

### “I don’t see updates” / stale UI

You almost certainly have the **release** build. Fix:

```bash
cd mobile
npm run android:dev:connect
npm run android:dev   # in another terminal if Metro is not running
```

### Stuck on splash screen

Metro is not running, or the phone cannot reach port 8081.

1. Run `npm run android:dev` on your Mac  
2. Run `npm run android:dev:connect` with USB plugged in  
3. Force-quit ehllo and reopen

### Same Wi‑Fi (no USB forward)

With Metro running (`npm run android:dev`), open the in-app dev menu and set the bundler URL to:

`http://<your-mac-ip>:8081`

Find your Mac IP: **System Settings → Network**, or run `ipconfig getifaddr en0`.

### Port 8081 in use

`run-dev-android.sh` stops the old Metro process automatically.

### Do not use Expo Go

This project uses native modules (speech, NFC, widgets). Expo Go cannot load it.

---

## APK locations

| Build | Path | Live reload? |
|-------|------|--------------|
| **Dev client (use this)** | `mobile/android/app/build/outputs/apk/debug/app-debug.apk` | Yes, with Metro |
| Release / standalone | `mobile/android/app/build/outputs/apk/release/app-release.apk` | No |

Both use the same app icon. Only the dev client talks to Metro on your Mac.
