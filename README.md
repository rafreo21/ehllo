# ehllo

ehllo turns a contact-card exchange into a relationship workflow: share,
capture context, organise the person, and surface the right next action.

## Products in this repository

- `app/` — responsive web application and public contact cards
- `mobile/` — Expo SDK 57 native app for iOS, Android, and web
- `supabase/` — authentication, workspace, card, RLS, and event migrations
- `docs/` — product architecture, state machines, vertical slices, and runbooks
- `docs/planning/` — early product lab notes, MVP scope, and technical plan

## Web app

```bash
npm install
cp .env.example .env.local
npm run dev
```

The web app runs at `http://localhost:3000`.

## Native app

```bash
cd mobile
npm install
cp .env.example .env
npm start
```

Use a development build for camera, secure authentication, and home-screen
widgets. Expo Go is useful for basic UI review but cannot host the widget
extensions.

## Verification

```bash
npm run build
npm test
cd mobile
npm run typecheck
npm run export:web
```

See [Mobile architecture](docs/mobile/01-mobile-architecture.md) and
[Widget implementation](docs/mobile/02-widgets.md) for native setup.
