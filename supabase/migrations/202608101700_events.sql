begin;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by_user_id uuid not null references public.users(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 160),
  location text not null default '' check (length(location) <= 320),
  starts_at timestamptz not null,
  ends_at timestamptz,
  source text not null check (source in ('manual', 'link', 'calendar')),
  source_url text not null default '' check (length(source_url) <= 2000),
  -- Populated for calendar-sourced events; used to key the "not going" ->
  -- suppress-future-candidates lookup in lib/events.ts (candidateSuppressionKey)
  -- without a separate dismissal table.
  organizer_email text not null default '',
  -- Calendar provider event id, used to dedupe re-syncing the same calendar
  -- entry across repeated candidate fetches. Null for manual/link events.
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index events_workspace_external_uidx
  on public.events (workspace_id, external_id) where external_id is not null;
create index events_workspace_starts_idx on public.events (workspace_id, starts_at desc);

alter table public.events enable row level security;
grant select, insert, update, delete on public.events to authenticated;

create policy "events_member_all" on public.events for all to authenticated
  using (exists (
    select 1 from public.workspace_memberships membership
    join public.users app_user on app_user.id = membership.user_id
    where membership.workspace_id = events.workspace_id
      and membership.status = 'active'
      and app_user.auth_user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.workspace_memberships membership
    join public.users app_user on app_user.id = membership.user_id
    where membership.workspace_id = events.workspace_id
      and membership.status = 'active'
      and app_user.auth_user_id = (select auth.uid())
  ));

comment on table public.events is
  'Events a user may attend, sourced from manual entry, a pasted link, or calendar sync (see lib/events.ts for the calendar candidate filter). Scoped to workspace like encounters/contacts.';

create table public.event_attendance (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  status text not null check (status in ('going', 'not_going')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create index event_attendance_user_idx on public.event_attendance (user_id, status);

alter table public.event_attendance enable row level security;
grant select, insert, update, delete on public.event_attendance to authenticated;

create policy "event_attendance_owner_all" on public.event_attendance for all to authenticated
  using (exists (
    select 1 from public.users app_user
    where app_user.id = event_attendance.user_id
      and app_user.auth_user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.users app_user
    where app_user.id = event_attendance.user_id
      and app_user.auth_user_id = (select auth.uid())
  ));

comment on table public.event_attendance is
  'Per-user going/not_going decision for an event. Absence of a row means undecided (calendar candidates awaiting a decision) - there is no explicit "unknown" status stored.';

alter table public.encounters
  add column if not exists event_id uuid references public.events(id) on delete set null;

create index if not exists encounters_workspace_event_idx
  on public.encounters (workspace_id, event_id) where event_id is not null;

commit;
