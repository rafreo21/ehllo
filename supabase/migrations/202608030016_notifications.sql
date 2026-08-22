begin;

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  device_id text not null check (length(device_id) between 1 and 200),
  platform text not null check (platform in ('ios', 'android')),
  expo_push_token text not null check (length(expo_push_token) between 1 and 400),
  device_label text not null default '' check (length(device_label) <= 160),
  last_seen_at timestamptz not null default now(),
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, device_id)
);

-- A token string should resolve to at most one active registration; Expo can
-- reissue a token to a different install, so only one *active* row may claim
-- it at a time.
create unique index push_tokens_token_active_uidx
  on public.push_tokens (expo_push_token) where disabled_at is null;
create index push_tokens_user_active_idx
  on public.push_tokens (user_id) where disabled_at is null;

alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from anon, authenticated;
grant select, insert, update, delete on public.push_tokens to authenticated;

create policy "push_tokens_owner_all" on public.push_tokens for all to authenticated
  using (exists (
    select 1 from public.users app_user
    where app_user.id = push_tokens.user_id
      and app_user.auth_user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.users app_user
    where app_user.id = push_tokens.user_id
      and app_user.auth_user_id = (select auth.uid())
  ));

comment on table public.push_tokens is
  'Per-device Expo push tokens for authenticated users. A user may register multiple devices; disabled_at marks tokens the app or Expo has reported invalid, without losing the audit trail.';

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  type text not null check (type in ('review_ready', 'follow_up_due', 'follow_up_overdue', 'shared_meeting_update')),
  title text not null check (length(title) <= 200),
  body text not null default '' check (length(body) <= 500),
  encounter_id uuid references public.encounters(id) on delete cascade,
  action_id text not null default '' check (length(action_id) <= 200),
  -- Identifies the triggering event so at-most-one row is ever created per
  -- (user, event) regardless of how many times the trigger path runs
  -- (retries, multiple devices, cron re-runs).
  dedupe_key text not null check (length(dedupe_key) between 1 and 200),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index notifications_user_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant insert on public.notifications to authenticated;

create policy "notifications_select_self" on public.notifications for select to authenticated
  using (exists (
    select 1 from public.users app_user
    where app_user.id = notifications.user_id
      and app_user.auth_user_id = (select auth.uid())
  ));

create policy "notifications_update_self" on public.notifications for update to authenticated
  using (exists (
    select 1 from public.users app_user
    where app_user.id = notifications.user_id
      and app_user.auth_user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.users app_user
    where app_user.id = notifications.user_id
      and app_user.auth_user_id = (select auth.uid())
  ));

-- Self-service insert covers events triggered inside the owning user's own
-- authenticated request (e.g. review-ready when they save their own
-- capture). Cron jobs and guest-triggered events (e.g. a guest submitting
-- their own follow-up commitment) insert via the service-role client, which
-- bypasses RLS entirely and does not need this policy.
create policy "notifications_insert_self" on public.notifications for insert to authenticated
  with check (exists (
    select 1 from public.users app_user
    where app_user.id = notifications.user_id
      and app_user.auth_user_id = (select auth.uid())
  ));

comment on table public.notifications is
  'Cross-device notification records shared by mobile and consumer web. Follow-up notifications only ever reference reviewed encounters - see lib/follow-ups-server.ts and the API routes that insert here.';

alter table public.users
  add column if not exists notification_preferences jsonb not null default '{}'::jsonb;

comment on column public.users.notification_preferences is
  'Per-type notification toggles, e.g. {"review_ready": true, "follow_up_due": true, "follow_up_overdue": true, "shared_meeting_update": true}. A missing key defaults to enabled at the application layer, not in the database.';

commit;
