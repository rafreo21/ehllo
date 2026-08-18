begin;

-- Delivery tracking for the server-side Expo push dispatcher. No secrets are
-- stored here - only Expo's own ticket status/error code and a timestamp,
-- enough to debug "why didn't this device get a push" without exposing
-- anything sensitive.
alter table public.push_tokens
  add column if not exists device_model text not null default '',
  add column if not exists last_delivery_status text,
  add column if not exists last_delivery_error text,
  add column if not exists last_delivery_at timestamptz;

alter table public.push_tokens
  add constraint push_tokens_last_delivery_status_check
  check (last_delivery_status is null or last_delivery_status in ('ok', 'error'));

commit;
