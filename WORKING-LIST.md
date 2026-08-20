# Working list

Everything outstanding, in priority order. Staging mobile + web consumer only.

## Fixed in this batch (pending push)

- [x] **Answering a contact request never worked at all.** Both RPCs wrote status
      `shared`/`declined`; the table has only ever allowed `pending`/`fulfilled`/`dismissed`.
      Every answer failed the check constraint since 18 August, on phone and web, and the
      activity log recorded it as working. Corrected to the table's own vocabulary in
      `202608201400_answer_contact_request_status.sql`.
- [x] **Notification tap was a dead end on web.** `notificationHref` routed by encounter,
      and a contact request has none, so it fell through to `/app/followups`. Now goes to
      the contact requests screen with `?open=1`.
- [x] **The sheet opens on arrival** from a notification, on both surfaces, when exactly
      one person is waiting. With several, the list shows — guessing would open the wrong
      person's request.
- [x] **Web pre-fills from your own card**, so a detail ehllo already knows needs no typing.
      The phone always did this; web asked you to type it.
- [x] **Sheet copy cut down.** Was three clauses explaining the mechanism; now one line.
- [x] **Pill strokes removed** (share-step prompt) and spacing tightened.
- [x] **Cells hold exactly two lines** — title and description, both truncating rather than
      wrapping, so every row is the same height.

## Next

- [ ] **Answered requests vanish with no history.** No way to see what you shared, with whom,
      or when. Wants a history view (top right of Contact requests). The rows are all still
      there with `answered_at` and `shared_value`, so this is a read of data we already keep —
      needs a decision on whether it shows the value you sent.
- [ ] **Daily reminder digest ignores your chosen times.** Hobby plan allows one cron run per
      day, so the server cannot fire at three local times. `users.time_zone` is already
      populated for all 7 users — the log saying otherwise is out of date. Remaining work:
      store chosen times on the account, gate the digest on the user's local time, and let
      the device trigger it (the pattern already used for the calendar: "the cron is the
      safety net, not the mechanism").
- [ ] **Sign-in codes to junk — the DNS half.** Live records confirm it: `ehllo.io` publishes
      `v=spf1 include:dc-aa8e722993._spfm.ehllo.io ~all` with **no Resend include**, while
      DMARC is `p=quarantine`. So mail is junked by instruction. The code half is done
      (plain-text alternative, proper document structure). This needs one DNS change and
      cannot be fixed in code.
- [ ] **Two-device checks.** Currently manual and therefore never finished. Turn the
      two-account paths into an automated staging check so it stops depending on having two
      phones to hand.

## Shipped but never once executed

- [ ] **Gemini has never run.** No encounter in the database has a transcript — ever. One
      capture on the phone exercises both transcription and the enhanced summary.
- [ ] **`wallet_pass_registrations` is 0.** Needs a pass actually added to Wallet; previewing
      registers nothing.
- [ ] **`scan_source` is 0 of 2 rows.** Needs a connection to a card you are not already
      connected to.
