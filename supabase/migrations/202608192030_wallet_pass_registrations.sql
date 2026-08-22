begin;

-- Apple Wallet pass updates.
--
-- A pass in someone's Wallet is a copy, frozen at the moment it was added. Change a
-- job title and every pass already handed out still shows the old one, forever -
-- which for a business card is the whole point of the thing failing quietly.
--
-- PassKit's answer is a web service. The device registers itself against a pass it
-- holds; when that pass changes the server sends a silent push; the device then asks
-- for a fresh copy. This table is the registration half of that exchange.
--
-- One row per (device, pass type, serial), which is exactly the uniqueness Apple's
-- protocol assumes: the same device registering twice for the same pass is a
-- re-registration to be updated, not a second device to be added.
create table if not exists public.wallet_pass_registrations (
  id uuid primary key default gen_random_uuid(),
  device_library_identifier text not null,
  pass_type_identifier text not null,
  serial_number text not null,
  push_token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (device_library_identifier, pass_type_identifier, serial_number)
);

-- The two lookups the protocol actually performs, and no others: every serial a
-- given device holds, and every device holding a given serial.
create index if not exists wallet_pass_registrations_device_idx
  on public.wallet_pass_registrations (device_library_identifier, pass_type_identifier);

create index if not exists wallet_pass_registrations_pass_idx
  on public.wallet_pass_registrations (pass_type_identifier, serial_number);

-- No client ever reads or writes this. The PassKit endpoints authenticate with the
-- pass's own authenticationToken and run as the service role, so row-level security
-- is enabled with no policy at all - which denies every other caller by default
-- rather than relying on one being written correctly later.
alter table public.wallet_pass_registrations enable row level security;

comment on table public.wallet_pass_registrations is
  'Devices registered for Apple Wallet pass updates. Written only by the PassKit web service under /api/wallet/v1. Not related to push_tokens: the token here is an APNs token issued against the pass type certificate, not an Expo token for the app.';

comment on column public.wallet_pass_registrations.device_library_identifier is
  'Opaque per-device id Apple generates. Not a user id and not stable across reinstalls.';

comment on column public.wallet_pass_registrations.serial_number is
  'The pass serialNumber, which is the card slug. Deliberately not a foreign key to cards: a device may stay registered for a pass whose card has since been deleted, and Apple expects a 410 for that case rather than a broken row.';

commit;
