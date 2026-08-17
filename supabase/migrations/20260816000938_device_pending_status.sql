begin;

-- Lightweight per-device pending-sync counts, so a device can show "another
-- device has changes waiting to sync" without ever syncing the pending
-- items' actual content anywhere — just a count and a timestamp.
create table public.device_pending_status (
  user_id uuid not null references public.users(id) on delete cascade,
  device_id text not null,
  pending_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, device_id)
);

alter table public.device_pending_status enable row level security;

create policy "Users manage their own device pending status"
  on public.device_pending_status
  for all
  using (user_id in (select id from public.users where auth_user_id = auth.uid()))
  with check (user_id in (select id from public.users where auth_user_id = auth.uid()));

commit;
