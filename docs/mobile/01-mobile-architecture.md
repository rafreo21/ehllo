# ehllo mobile architecture

## Goal

The native app makes the contact card instantly available at the moment of a
meeting while preserving the relationship-first information architecture used
by the web product.

## Runtime

- Expo SDK 57 and React Native
- Expo Router with five primary tabs: Home, People, Card, Inbox, Settings
- Supabase Auth using passwordless email links and encrypted SecureStore session
  persistence
- AsyncStorage as an offline-first card cache
- Supabase RPC for idempotent workspace provisioning and atomic card publishing
- Phosphor icons across native navigation and actions

## Primary flow

1. A user can explore the app in preview mode.
2. They edit identity, imagery, theme, and contact methods.
3. Changes save locally immediately and remain after restarting the app.
4. Signing in provisions the personal workspace.
5. Publish writes the card and its methods in one database transaction.
6. Quick Share raises screen brightness and presents the public QR.
7. A visitor opens `/c/:slug`, can use each contact action, and can download a
   vCard.
8. The scanner reads any supported QR URL and opens it through the operating
   system.

## Data boundaries

The public card exposes only published identity and contact methods. Encounter
notes, people, inbox items, and relationship intelligence remain private.
Row-level security permits anonymous reads only for published cards.

## Environment

Create `mobile/.env` from `mobile/.env.example`:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-publishable-key
EXPO_PUBLIC_CARD_BASE_URL=https://your-public-web-domain.example
```

For a physical phone on the same network, do not use `localhost` for the public
card URL. Use the computer's LAN address or a deployed HTTPS web URL.

## Native development

```bash
cd mobile
npx expo prebuild
npx expo run:ios
npx expo run:android
```

The app identifiers are `com.ehllo.app` for production and
`com.ehllo.app.staging` for staging.

## Current scope

Implemented: native shell, preview mode, magic-link authentication, local card
editing, Supabase publishing, public card, QR share, QR scanning, native contact
actions, and widget foundations.

People, encounter capture, AI review, and inbox persistence intentionally remain
the next vertical slices instead of mocked backend features.
