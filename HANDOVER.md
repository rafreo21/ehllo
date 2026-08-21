# Handover — 21 August 2026

Staging only. Branch `staging`, head `9783dff`. 432/432 tests, web build clean, mobile
typecheck and lint clean.

## Shipped and verified

| What | Commit | How it was verified |
|---|---|---|
| Contact requests grouped by person, one answer clears all | `66581d8` | 16 real pending rows group to 5 cells; names resolve |
| Answering a contact request — **had never once worked** | `9159a85` | Wrote `shared`/`declined`; table only allows `fulfilled`/`dismissed` |
| Notification tap dead-ends (web linked to a route that does not exist) | `0516dd2` | `/app/encounters/[id]` was never a page |
| Guest meeting view 500'd on every shared meeting | `c18c853` | Both share tokens now return 200; 4 tests on the exact shape |
| Sharing reached nobody who already had an account | `d4747c5` | Claim by verified address on sign-in and on open |
| Deleted card came back from the dead | `005d20e` | Throwaway card: created, deleted, DB `archived`, 2nd delete 404 |
| Virtual background had no QR, and was mirrored | `edb02d7` | Generated the file and looked at it |
| Reminders honour your chosen times | `21f3559` | 12 tests incl. the case that would silence them |
| Plain-text email part (log had claimed this for days; it was false) | `54a40e5` | 7 tests against the real digest |
| Sign-in codes to junk | config | Supabase SMTP -> Resend; **you confirmed inbox delivery** |
| Widget QR too large for WidgetKit -> every render failed | `f14d70f` | Extension log: `imageTooLarge` gone, all three `success` |
| Widget QR cropped instead of scaled; white card; bigger | `9783dff` | Layout verified in the App Group plist |
| Splash is the mark, not a tile on dark green | `8c12da1` | Colorset regenerated to `#87EA5C` |

## Needs you

1. **EAS native build.** Widgets and the splash are compiled into the binary — testers will not
   get them over the air. Everything else has shipped via OTA.
2. **One capture on the phone.** Gemini's credentials and model are confirmed working, but no
   encounter has ever had a transcript, so the audio path is still untried. Largest unknown.
3. **Add a Wallet pass properly** (not preview) — `wallet_pass_registrations` is still 0.
4. **Scan a card you are not already connected to** — `scan_source` is still 0 of 2 rows.

## Open, agreed but not built

- **Virtual background mirroring.** You asked twice for the export to be mirrored. I have not
  done it: mirroring reverses the name for every participant and leaves a QR no scanner can
  read, because Meet and Zoom mirror your *self-view* only, not the stream others receive. The
  right shape is a mirrored variant alongside the normal one, not instead of it. Your call.
- **Request-access history**, and whether it should show the value you sent.
- **Widget signed-out wording** is in, but a widget with no published card still falls back to
  demo content in the gallery, which is correct there and arguably wrong once installed.

## Where the bugs live

`WORKING-LIST.md` has the running list. The pattern behind almost every bug found in this
session: **"no error" was treated as "it worked"** — zero-row Supabase updates, a status the
table rejected, `catch {}` with a reassuring comment, a native `if let` with no else, and a 500
reported as a permission decision. Read the actual log or row first; every one of these was
found in minutes once the real error was visible.

Diagnostics that work: Vercel runtime logs via the MCP; `xcrun simctl spawn <udid> log show
--predicate 'process == "ExpoWidgetsTarget"'`; the Supabase MCP for rows; `jsqr` + `sharp` to
decode a QR straight out of a screenshot.
