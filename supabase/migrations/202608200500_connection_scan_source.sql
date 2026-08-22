begin;

-- Where a connection actually came from.
--
-- A card link is emitted by a lot of surfaces - the app's own QR, an NFC tag, a home
-- screen widget, an Apple or Google Wallet pass, the branded QR behind an email
-- signature, a watch face, a virtual background, and the web scanner - and until now
-- every one of them arrived indistinguishable. So "which of these actually gets people
-- connecting" was unanswerable, for a product whose whole subject is how people meet.
--
-- Deliberately free text with a check rather than an enum: adding a surface should not
-- need a migration, and an unrecognised value should be rejected at the edge rather
-- than silently stored. The API validates against the same list.
alter table public.people_connections
  add column if not exists scan_source text;

comment on column public.people_connections.scan_source is
  'Which surface the connection was made through - camera, link, nfc, web. Null for connections recorded before this existed, and for any path that does not report one. First touch wins: it records how the connection began, not the most recent time someone scanned the same card.';

-- Answering "which surface drives connections" is a scan over a workspace's own rows,
-- so the workspace leads the index.
create index if not exists people_connections_scan_source_idx
  on public.people_connections (workspace_id, scan_source);

commit;
