begin;

alter table public.workspaces drop constraint if exists workspaces_type_check;
alter table public.workspaces
  add constraint workspaces_type_check check (type in ('personal', 'team'));

alter table public.workspaces drop constraint if exists workspaces_owner_user_id_key;
create unique index if not exists workspaces_one_personal_per_owner
  on public.workspaces (owner_user_id)
  where type = 'personal';

alter table public.workspace_memberships drop constraint if exists workspace_memberships_role_check;
alter table public.workspace_memberships
  add constraint workspace_memberships_role_check check (role in ('owner', 'admin', 'member'));

alter table public.workspace_memberships
  add column if not exists membership_kind text not null default 'personal'
  check (membership_kind in ('personal', 'team'));

drop index if exists public.one_active_personal_workspace_per_user;
create unique index if not exists one_active_personal_membership_per_user
  on public.workspace_memberships (user_id)
  where status = 'active' and membership_kind = 'personal';

alter table public.users
  add column if not exists active_workspace_id uuid references public.workspaces(id) on delete set null;

alter table public.cards
  add column if not exists owner_user_id uuid references public.users(id) on delete set null;

create index if not exists cards_workspace_owner_idx
  on public.cards (workspace_id, owner_user_id);

create table if not exists public.card_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 80),
  company text not null default '',
  theme_color text not null default '#9FE870' check (theme_color ~ '^#[0-9A-Fa-f]{6}$'),
  company_logo_url text not null default '',
  cover_image_url text not null default '',
  bio_template text not null default '',
  default_methods jsonb not null default '[]'::jsonb,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists card_templates_workspace_idx on public.card_templates (workspace_id);

alter table public.card_templates enable row level security;

create policy "card_templates_member_read" on public.card_templates for select to authenticated
  using (exists (
    select 1
    from public.workspace_memberships membership
    join public.users app_user on app_user.id = membership.user_id
    where membership.workspace_id = card_templates.workspace_id
      and membership.status = 'active'
      and app_user.auth_user_id = (select auth.uid())
  ));

create policy "card_templates_admin_write" on public.card_templates for all to authenticated
  using (exists (
    select 1
    from public.workspace_memberships membership
    join public.users app_user on app_user.id = membership.user_id
    where membership.workspace_id = card_templates.workspace_id
      and membership.status = 'active'
      and membership.role in ('owner', 'admin')
      and app_user.auth_user_id = (select auth.uid())
  ))
  with check (exists (
    select 1
    from public.workspace_memberships membership
    join public.users app_user on app_user.id = membership.user_id
    where membership.workspace_id = card_templates.workspace_id
      and membership.status = 'active'
      and membership.role in ('owner', 'admin')
      and app_user.auth_user_id = (select auth.uid())
  ));

grant select, insert, update, delete on public.card_templates to authenticated;

create or replace function public.enforce_workspace_card_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_workspace_type text;
begin
  select type into v_workspace_type from public.workspaces where id = new.workspace_id;

  if v_workspace_type = 'team' then
    if new.owner_user_id is null then
      raise exception 'Team cards require an owner';
    end if;
    if (
      select count(*)
      from public.cards
      where workspace_id = new.workspace_id
        and owner_user_id = new.owner_user_id
        and status <> 'archived'
    ) >= 5 then
      raise exception 'Each team member can have at most five active cards';
    end if;
  elsif (
    select count(*)
    from public.cards
    where workspace_id = new.workspace_id and status <> 'archived'
  ) >= 5 then
    raise exception 'A workspace can have at most five active cards';
  end if;

  return new;
end;
$$;

create or replace function public.provision_personal_workspace()
returns table (user_id uuid, workspace_id uuid, onboarding_status text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_auth_user_id uuid := auth.uid();
  v_user_id uuid;
  v_workspace_id uuid;
  v_email text;
  v_user_created boolean := false;
  v_workspace_created boolean := false;
begin
  if v_auth_user_id is null then raise exception 'authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_auth_user_id::text, 0));
  select coalesce(auth.jwt() ->> 'email', '') into v_email;

  insert into public.users(auth_user_id, primary_email)
  values (v_auth_user_id, v_email)
  on conflict (auth_user_id) do update set
    primary_email = excluded.primary_email,
    updated_at = now()
  returning id, (xmax = 0) into v_user_id, v_user_created;

  insert into public.workspaces(name, owner_user_id, type)
  values ('My workspace', v_user_id, 'personal')
  on conflict (owner_user_id) where (type = 'personal') do update set updated_at = public.workspaces.updated_at
  returning id, (xmax = 0) into v_workspace_id, v_workspace_created;

  if v_workspace_id is null then
    select w.id into v_workspace_id
    from public.workspaces w
    where w.owner_user_id = v_user_id and w.type = 'personal';
  end if;

  insert into public.workspace_memberships(workspace_id, user_id, role, membership_kind)
  values (v_workspace_id, v_user_id, 'owner', 'personal')
  on conflict (workspace_id, user_id) do nothing;

  if v_user_created then
    insert into public.domain_events(event_name, actor_type, actor_id, workspace_id, object_type, object_id, correlation_id)
    values ('UserSignedUp', 'User', v_user_id, v_workspace_id, 'User', v_user_id, v_user_id)
    on conflict do nothing;
  end if;
  if v_workspace_created then
    insert into public.domain_events(event_name, actor_type, actor_id, workspace_id, object_type, object_id, correlation_id)
    values ('PersonalWorkspaceProvisioned', 'System', v_user_id, v_workspace_id, 'Workspace', v_workspace_id, v_workspace_id)
    on conflict do nothing;
  end if;

  return query
    select v_user_id, v_workspace_id, u.onboarding_status
    from public.users u
    where u.id = v_user_id;
end;
$$;

-- Drops signup_intent and adds workspace_name/type/role, so the existing
-- function must be dropped first - CREATE OR REPLACE cannot change a
-- function's return shape.
drop function if exists public.get_my_app_context();

create function public.get_my_app_context()
returns table (
  user_id uuid,
  primary_email text,
  display_name text,
  avatar_url text,
  locale text,
  time_zone text,
  onboarding_status text,
  workspace_id uuid,
  workspace_name text,
  workspace_type text,
  workspace_role text
)
language sql stable security definer set search_path = ''
as $$
  select
    u.id,
    u.primary_email,
    u.display_name,
    u.avatar_url,
    u.locale,
    u.time_zone,
    u.onboarding_status,
    w.id,
    w.name,
    w.type,
    m.role
  from public.users u
  join public.workspace_memberships m on m.user_id = u.id and m.status = 'active'
  join public.workspaces w on w.id = m.workspace_id and w.status = 'active'
  where u.auth_user_id = (select auth.uid())
    and u.status = 'active'
    and w.id = coalesce(
      u.active_workspace_id,
      (
        select w2.id
        from public.workspaces w2
        join public.workspace_memberships m2 on m2.workspace_id = w2.id
        where m2.user_id = u.id
          and m2.status = 'active'
          and m2.membership_kind = 'personal'
        limit 1
      )
    )
  limit 1
$$;

create or replace function public.create_team_workspace(p_name text)
returns table (workspace_id uuid, workspace_name text)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id uuid;
  v_workspace_id uuid;
  v_name text := trim(p_name);
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if length(v_name) < 2 or length(v_name) > 80 then raise exception 'invalid workspace name'; end if;

  select u.id into v_user_id from public.users u where u.auth_user_id = auth.uid() and u.status = 'active';
  if v_user_id is null then raise exception 'application user not provisioned'; end if;

  insert into public.workspaces(name, owner_user_id, type)
  values (v_name, v_user_id, 'team')
  returning id into v_workspace_id;

  insert into public.workspace_memberships(workspace_id, user_id, role, membership_kind)
  values (v_workspace_id, v_user_id, 'owner', 'team');

  update public.users set active_workspace_id = v_workspace_id, updated_at = now() where id = v_user_id;

  insert into public.domain_events(
    event_name, actor_type, actor_id, workspace_id, object_type, object_id, correlation_id, payload
  ) values (
    'TeamWorkspaceCreated', 'User', v_user_id, v_workspace_id, 'Workspace', v_workspace_id, v_workspace_id,
    jsonb_build_object('name', v_name)
  );

  return query select v_workspace_id, v_name;
end;
$$;

create or replace function public.set_active_workspace(p_workspace_id uuid)
returns table (workspace_id uuid, workspace_name text, workspace_type text, workspace_role text)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_workspace_id is null then raise exception 'workspace required'; end if;

  select u.id into v_user_id from public.users u where u.auth_user_id = auth.uid() and u.status = 'active';
  if v_user_id is null then raise exception 'application user not provisioned'; end if;

  if not exists (
    select 1
    from public.workspace_memberships membership
    where membership.user_id = v_user_id
      and membership.workspace_id = p_workspace_id
      and membership.status = 'active'
  ) then
    raise exception 'workspace membership required';
  end if;

  update public.users set active_workspace_id = p_workspace_id, updated_at = now() where id = v_user_id;

  return query
    select w.id, w.name, w.type, membership.role
    from public.workspaces w
    join public.workspace_memberships membership on membership.workspace_id = w.id
    where w.id = p_workspace_id
      and membership.user_id = v_user_id
      and membership.status = 'active';
end;
$$;

revoke all on function public.create_team_workspace(text) from public, anon;
revoke all on function public.set_active_workspace(uuid) from public, anon;
grant execute on function public.create_team_workspace(text) to authenticated;
grant execute on function public.set_active_workspace(uuid) to authenticated;

commit;
