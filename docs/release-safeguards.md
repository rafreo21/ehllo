# ehllo release safeguards

## Environment policy

- Staging and production are separate Supabase projects and therefore contain separate accounts and data.
- All ordinary local web and mobile commands default to staging.
- Production mobile commands must include the explicit `:production` script.
- Production web development requires both `.env.production.local` and the one-command opt-in `EHLLO_ALLOW_PRODUCTION=1` (`AFTERMEET_ALLOW_PRODUCTION` remains a temporary migration alias).
- Never copy production user data into staging. Use seeded or tester-created staging data.

## Local development

1. Copy `.env.staging.example` to `.env.staging.local` and enter public staging values.
2. Run `npm run dev` for consumer web against staging.
3. Run `npm start`, `npm run ios`, or `npm run android` from `mobile/` for the staging app.
4. Do not run staging and production native prebuilds concurrently: they share `mobile/ios` and `mobile/android`.

Production verification must be brief and intentional:

```sh
EHLLO_ALLOW_PRODUCTION=1 npm run dev:production
cd mobile && npm run ios:production
```

## EAS and beta distribution

- `development`, `staging`, and `staging-simulator` EAS profiles always build the staging app and staging backend.
- The `production` EAS profile builds `com.ehllo.app` for TestFlight, Play Internal Testing, and eventual store release.
- Internal teammates may use staging builds. External beta testers should use store-managed production beta tracks so authentication, links, notifications, and data match the eventual release.
- Never submit the staging bundle IDs to either store as the public app.

Before any beta build:

1. Confirm `git status` is clean and CI passes.
2. Confirm the intended EAS profile and app identifier.
3. Confirm Supabase redirect URLs and the public web domain for that environment.
4. Run `npm run release:check`, web tests, and mobile typecheck/lint.
5. Record the commit and build numbers in the release notes.

## Automated readiness

`npm run release:check` is the minimum release gate. It checks tracked files for
privileged Supabase credentials and verifies that ordinary web/mobile commands,
EAS profiles, app identifiers, and backend references preserve the staging-first
release split. CI runs the same command for every pull request and push to `main`.

This check is intentionally static: it prevents configuration regressions without
connecting to either Supabase project or mutating external services.

## External and hardware work still required

These items cannot be made complete by repository checks alone:

- Link the Expo project and configure EAS credentials and push-notification keys.
- Confirm every production database migration has been applied to production.
- Validate NFC programming on a supported physical Android device.
- Validate the complete QR exchange with two physical phones.
- Complete App Store and Play Store privacy, screenshots, listing, and review data.

Do not describe the app as store-ready until those items have recorded evidence.

## Credential safeguards

- Publishable/anonymous Supabase keys may exist in a client build; privileged service-role or secret keys must never be committed or bundled.
- CI scans every tracked file for privileged Supabase credentials.
- Server-only credentials belong in Supabase, Vercel, GitHub, or EAS secret storage—not package scripts or source files.
- A production secret previously shared in conversation or committed history must be rotated in Supabase, then updated in Vercel and any authorized local secret store. Removing it from the latest source does not invalidate the old credential.

## Rollout and rollback

- Release to staging first, then TestFlight/Play Internal Testing, then a limited production rollout.
- Verify sign-in, card sharing, QR exchange, capture, review, follow-ups, notifications, and three-day recording expiry before widening rollout.
- Roll back the client to the previous store build when possible. Database changes must be backward-compatible and use a tested corrective migration rather than destructive rollback.
- Do not deploy directly from an unreviewed dirty worktree.
