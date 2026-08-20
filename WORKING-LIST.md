# Working list

Everything outstanding, in priority order. Staging mobile + web consumer only.

## Done

- [x] **Answering a contact request never worked at all.** Both RPCs wrote status
      `shared`/`declined`; the table has only ever allowed `pending`/`fulfilled`/`dismissed`.
      Every answer failed the check constraint since 18 August, on phone and web, and the
      activity log recorded it as working.
- [x] **Notification tap was a dead end on web.** `notificationHref` routed by encounter,
      and a contact request has none, so it fell through to `/app/followups`.
- [x] **The sheet opens on arrival** from a notification, both surfaces, when exactly one
      person is waiting. With several, the list shows — guessing would open the wrong one.
- [x] **Web pre-fills from your own card**, so a detail ehllo already knows needs no typing.
- [x] **Sheet copy cut down**, pill strokes removed, spacing tightened, cells hold exactly
      two truncating lines so rows stay a uniform height.
- [x] **History of answered requests.** Who asked, what for, shared or declined, what was
      sent, when. Reads `answered_at` and `shared_value`, which were always being written.
- [x] **Daily reminder digest honours your chosen times.** Times now stored on the account;
      the decision is made in the user's own zone and their own day, not the server's
      midnight. Cron is the safety net (Hobby allows one run a day), with a 36-hour grace
      window so a preference can never silence the reminder entirely.
- [x] **Two-device checks automated.** The staging run now creates two real accounts and
      covers mutual scan, `scan_source` stored and not overwritten, both sides seeing each
      other, and the full contact-request round trip including decline. This is the check
      that would have caught the constraint bug on day one.

## Next

- [ ] **Exact-hour email digest.** The cron can only wake once a day, so the email lands at
      the run after your chosen time rather than at it. Closing this means the device asking
      on open — the same pattern already used for pushing calendar events. The decision
      logic is already shared (`lib/reminder-schedule.ts`), so this is an endpoint plus a
      call, not a redesign.
- [ ] **Sign-in codes to junk — the DNS half.** Not fixable in code. `ehllo.io` publishes
      `v=spf1 include:dc-aa8e722993._spfm.ehllo.io ~all` with **no Resend include**, while
      DMARC is `p=quarantine`, so failing mail is junked by instruction. Needs Resend's
      include added to the SPF record. The code half is done (plain-text alternative,
      proper document structure).

## Shipped but never once executed

- [ ] **Gemini has never run.** No encounter in the database has a transcript — ever. One
      capture on the phone exercises both transcription and the enhanced summary.
- [ ] **`wallet_pass_registrations` is 0.** Needs a pass actually added to Wallet;
      previewing registers nothing.
- [ ] **`scan_source` is 0 of 2 rows.** Needs a connection to a card you are not already
      connected to. The two existing rows will fill on a re-scan now.
