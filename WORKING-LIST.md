# Working list

Staging mobile + web consumer only.

## Done

Contact requests
- [x] **Answering never worked at all.** Both RPCs wrote status `shared`/`declined`; the
      table has only ever allowed `pending`/`fulfilled`/`dismissed`, so every answer failed
      the check constraint from 18 August, on both surfaces — while the log said it worked.
- [x] Notification tap dead-ended on web (`notificationHref` routed by encounter; a request
      has none, so it fell to `/app/followups`). Now opens the request.
- [x] Sheet opens on arrival when exactly one person is waiting.
- [x] Web pre-fills from your own card. Copy cut to one line. Pill strokes gone, spacing
      tightened, cells hold two truncating lines.
- [x] **History** of answered requests — who, what, shared or declined, what was sent, when.
      A decline never carries a value, enforced in the query.

Reminders
- [x] **Chosen times honoured.** Stored on the account; decided in the user's own zone and
      own day, not the server's midnight (which was quietly wrong for anyone outside UTC).
- [x] **Exact-hour delivery.** The plan allows one cron run a day, so the app asks on
      foreground and the cron is the backstop. Both share `sendReminderDigest` and
      `reminderDigestDue`, so they cannot disagree about whether you were already reminded.
- [x] 36-hour grace window, so a preference can never silence the reminder entirely.

Email deliverability
- [x] **Plain-text alternative, for real.** `sendEmail` posted `html` only. The log claimed
      since the 18th that a text part had been added — it had not. Now derived from the
      HTML (so the two can't drift), with link destinations written out.

Testing
- [x] **Two-device checks automated.** The staging run creates two real accounts and covers
      mutual scan, `scan_source` stored and not overwritten, both sides seeing each other,
      and the request round trip: three asks → one answer → all cleared, plus a decline.
      This is the check that would have caught the constraint bug on day one.

Verified by inspection, not assumption
- [x] **Gemini works.** Credentials and `gemini-3.5-flash` answer with `finishReason: STOP`.
      A first probe came back blank because 70 **thinking tokens** consumed a 16-token
      budget — worth knowing, but no `maxTokens` cap is set anywhere in our call paths, so
      it cannot truncate a real capture.
- [x] **DNS is correct.** `resend._domainkey.ehllo.io` publishes a key, `send.ehllo.io` has
      `v=spf1 include:amazonses.com ~all` and the right MX, and DMARC is `adkim=r` — relaxed
      — so DKIM alone passes it. The earlier "SPF needs changing" diagnosis was wrong.

## Needs you — cannot be done in code

- [ ] **Sign-in codes to junk.** They are sent by **Supabase Auth's own shared mail server**,
      not by us, on a domain unrelated to ehllo.io — which is why iCloud distrusts them. Our
      own mail is fine. Fix is Supabase dashboard → Authentication → SMTP Settings:
      - Host `smtp.resend.com`, port `465`
      - Username `resend`, password = the Resend API key
      - Sender `product@ehllo.io`, name `ehllo`

      Then sign-in codes inherit the DKIM and SPF that already pass.

- [ ] **One capture on the phone.** Gemini's credentials and model are confirmed, but no
      encounter in the database has ever had a transcript, so the audio path itself is
      untried. This is the largest remaining unknown in the app.
- [ ] **Add a pass to Wallet properly** (not preview) — `wallet_pass_registrations` is 0, so
      the PassKit service has never been exercised.
- [ ] **Scan a card you are not already connected to** — `scan_source` is 0 of 2 rows. The
      two existing rows will now fill on a re-scan.
