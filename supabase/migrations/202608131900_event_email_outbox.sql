begin;

create table public.event_email_outbox (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  invitation_id uuid references public.event_invitations(id) on delete cascade,
  recipient_email text not null,
  kind text not null check (kind in ('invitation', 'schedule_changed', 'cancelled', 'reminder')),
  subject text not null,
  html text not null,
  dedupe_key text not null unique,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 10),
  next_attempt_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  sent_at timestamptz,
  last_error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index event_email_outbox_due_idx on public.event_email_outbox (next_attempt_at, created_at)
  where status in ('pending', 'failed') and attempt_count < 8;
create index event_email_outbox_event_idx on public.event_email_outbox (event_id, created_at desc);

alter table public.event_email_outbox enable row level security;
grant select, insert, update on public.event_email_outbox to authenticated;

create policy "event_email_outbox_event_member_all" on public.event_email_outbox for all to authenticated
  using (exists (
    select 1 from public.events event
    join public.workspace_memberships membership on membership.workspace_id = event.workspace_id
    join public.users app_user on app_user.id = membership.user_id
    where event.id = event_email_outbox.event_id
      and membership.status = 'active'
      and app_user.auth_user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.events event
    join public.workspace_memberships membership on membership.workspace_id = event.workspace_id
    join public.users app_user on app_user.id = membership.user_id
    where event.id = event_email_outbox.event_id
      and membership.status = 'active'
      and app_user.auth_user_id = (select auth.uid())
  ));

comment on table public.event_email_outbox is
  'Durable, idempotent event email delivery. Failed sends remain retryable and visible to event hosts.';

commit;
