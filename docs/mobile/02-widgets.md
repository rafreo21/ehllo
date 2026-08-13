# iOS and Android widgets

## Product behaviour

ehllo ships three home-screen widgets:

1. **QR Scan** — large scannable QR code (2×2 on Android, small on iOS)
2. **Business Card** — QR plus name, role, and company (4×2 wide)
3. **Recent Connections** — recent people who shared their details (4×2 wide)

Tapping a widget opens the matching deep link (`aftermeet://share-card` or `aftermeet://connections`).

## Shared data model

Both platforms read from the same snapshot built in `mobile/src/features/card/widget-sync.ts`:

- `cardsJson` — all published cards, including per-card QR and photo assets
- `recentConnectionsJson` / `connection1Name`… — recent connections
- Placeholder/demo content when nothing is synced yet (Alex Morgan + sample connections)

## iOS

`expo-widgets` generates a WidgetKit extension from:

- `mobile/widgets/QrScanWidget.tsx`
- `mobile/widgets/BusinessCardWidget.tsx`
- `mobile/widgets/RecentConnectionsWidget.tsx`
- `mobile/widgets/widget-shared.ts`

Widget configuration lives in `mobile/app.json` under the `expo-widgets` plugin.

The app and extension share `group.com.aftermeet.app`. Apple Developer provisioning must enable that group for both targets.

Business Card widgets support multi-card paging with ‹ › buttons (iOS 17+ interactive widgets).

## Android

The custom Expo config plugin generates Kotlin `AppWidgetProvider` classes, XML layouts, picker preview PNGs, and the `QuickShareWidgetBridge` during prebuild:

- `mobile/plugins/withAndroidQuickShareWidget.js`
- `mobile/plugins/widget-preview-pngs.js`

Run `npx expo prebuild --platform android` after changing native widget metadata.

## Testing

1. Build and install the native development app on device or simulator.
2. Launch the app once and open **Card tools → Home screen widgets → Refresh**.
3. Add each widget from the system picker.
4. Confirm QR scan, card paging, and connection actions behave as expected.
5. Confirm deep links open the in-app Quick Share or Connections screens.

Widgets cannot be fully validated in Expo Go; use a dev or production native build.
