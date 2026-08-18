begin;

alter table public.users
  add column if not exists signup_intent text not null default 'owner'
    check (signup_intent in ('owner', 'visitor'));

create table if not exists public.people_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  card_id uuid not null references public.cards(id) on delete cascade,
  exchange_id uuid references public.card_exchanges(id) on delete set null,
  person_name text not null check (length(trim(person_name)) between 1 and 160),
  person_role text not null default '' check (length(person_role) <= 120),
  person_company text not null default '' check (length(person_company) <= 120),
  person_email text not null default '' check (length(person_email) <= 320),
  card_slug text not null check (length(card_slug) between 1 and 120),
  card_owner_name text not null check (length(card_owner_name) between 1 and 160),
  connected_at timestamptz not null default now(),
  unique (workspace_id, card_id)
);

create index if not exists people_connections_workspace_idx
  on public.people_connections (workspace_id, connected_at desc);

alter table public.people_connections enable row level security;

grant select, insert, update on public.people_connections to authenticated;

create policy "people_connections_member_read" on public.people_connections
  for select to authenticated
  using (exists (
    select 1 from public.workspace_memberships membership
    join public.users app_user on app_user.id = membership.user_id
    where membership.workspace_id = people_connections.workspace_id
      and membership.status = 'active'
      and app_user.auth_user_id = (select auth.uid())
  ));

create policy "people_connections_member_write" on public.people_connections
  for insert to authenticated
  with check (exists (
    select 1 from public.workspace_memberships membership
    join public.users app_user on app_user.id = membership.user_id
    where membership.workspace_id = people_connections.workspace_id
      and membership.status = 'active'
      and app_user.auth_user_id = (select auth.uid())
  ));

create or replace function public.complete_visitor_onboarding(p_display_name text)
returns table (user_id uuid, workspace_id uuid, onboarding_status text, signup_intent text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_workspace_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if length(trim(p_display_name)) < 2 or length(trim(p_display_name)) > 100 then
    raise exception 'invalid display name';
  end if;

  update public.users
  set
    display_name = trim(p_display_name),
    signup_intent = 'visitor',
    onboarding_status = 'completed',
    updated_at = now()
  where auth_user_id = auth.uid()
  returning id into v_user_id;

  if v_user_id is null then raise exception 'application user not provisioned'; end if;

  select w.id into v_workspace_id
  from public.workspaces w
  join public.workspace_memberships m on m.workspace_id = w.id
  where m.user_id = v_user_id and m.status = 'active'
  limit 1;

  return query
  select v_user_id, v_workspace_id, 'completed'::text, 'visitor'::text;
end;
$$;

create or replace function public.link_people_connection_from_scan(p_slug text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_card record;
  v_connection_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  select w.id into v_workspace_id
  from public.users u
  join public.workspace_memberships m on m.user_id = u.id and m.status = 'active'
  join public.workspaces w on w.id = m.workspace_id and w.status = 'active'
  where u.auth_user_id = auth.uid() and u.status = 'active'
  limit 1;

  if v_workspace_id is null then raise exception 'workspace not found'; end if;

  select card.id, card.slug, card.full_name, card.job_title, card.company
  into v_card
  from public.cards card
  where card.slug = lower(trim(p_slug))
    and card.status = 'published'
  limit 1;

  if v_card.id is null then raise exception 'card not found'; end if;

  insert into public.people_connections (
    workspace_id,
    card_id,
    person_name,
    person_role,
    person_company,
    card_slug,
    card_owner_name
  ) values (
    v_workspace_id,
    v_card.id,
    v_card.full_name,
    coalesce(v_card.job_title, ''),
    coalesce(v_card.company, ''),
    v_card.slug,
    v_card.full_name
  )
  on conflict (workspace_id, card_id) do update set
    connected_at = now()
  returning id into v_connection_id;

  return v_connection_id;
end;
$$;

create or replace function public.link_people_connection_from_exchange(p_exchange_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_user_email text;
  v_exchange record;
  v_connection_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  select u.primary_email, w.id
  into v_user_email, v_workspace_id
  from public.users u
  join public.workspace_memberships m on m.user_id = u.id and m.status = 'active'
  join public.workspaces w on w.id = m.workspace_id and w.status = 'active'
  where u.auth_user_id = auth.uid() and u.status = 'active'
  limit 1;

  if v_workspace_id is null then raise exception 'workspace not found'; end if;

  select
    exchange.id,
    exchange.visitor_email,
    card.id as card_id,
    card.slug,
    card.full_name,
    card.job_title,
    card.company
  into v_exchange
  from public.card_exchanges exchange
  join public.cards card on card.id = exchange.card_id
  where exchange.id = p_exchange_id
  limit 1;

  if v_exchange.id is null then raise exception 'exchange not found'; end if;

  if v_exchange.visitor_email <> ''
     and lower(v_exchange.visitor_email) <> lower(coalesce(v_user_email, '')) then
    raise exception 'exchange email mismatch';
  end if;

  insert into public.people_connections (
    workspace_id,
    card_id,
    exchange_id,
    person_name,
    person_role,
    person_company,
    person_email,
    card_slug,
    card_owner_name
  ) values (
    v_workspace_id,
    v_exchange.card_id,
    v_exchange.id,
    v_exchange.full_name,
    coalesce(v_exchange.job_title, ''),
    coalesce(v_exchange.company, ''),
    coalesce(v_exchange.visitor_email, ''),
    v_exchange.slug,
    v_exchange.full_name
  )
  on conflict (workspace_id, card_id) do update set
    exchange_id = excluded.exchange_id,
    person_role = excluded.person_role,
    person_company = excluded.person_company,
    person_email = excluded.person_email,
    connected_at = now()
  returning id into v_connection_id;

  return v_connection_id;
end;
$$;

create or replace function public.list_my_people_connections()
returns setof jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', connection.id,
    'personName', connection.person_name,
    'personRole', connection.person_role,
    'personCompany', connection.person_company,
    'personEmail', connection.person_email,
    'cardSlug', connection.card_slug,
    'cardOwnerName', connection.card_owner_name,
    'exchangeId', connection.exchange_id,
    'connectedAt', connection.connected_at
  )
  from public.people_connections connection
  join public.workspace_memberships membership on membership.workspace_id = connection.workspace_id
  join public.users app_user on app_user.id = membership.user_id
  where membership.status = 'active'
    and app_user.auth_user_id = auth.uid()
  order by connection.connected_at desc;
$$;

revoke all on function public.complete_visitor_onboarding(text) from public;
revoke all on function public.link_people_connection_from_scan(text) from public;
revoke all on function public.link_people_connection_from_exchange(uuid) from public;
revoke all on function public.list_my_people_connections() from public;

grant execute on function public.complete_visitor_onboarding(text) to authenticated;
grant execute on function public.link_people_connection_from_scan(text) to authenticated;
grant execute on function public.link_people_connection_from_exchange(uuid) to authenticated;
grant execute on function public.list_my_people_connections() to authenticated;

-- Adds signup_intent to the output columns, so the existing function must be
-- dropped first - CREATE OR REPLACE cannot change a function's return shape.
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
  signup_intent text,
  workspace_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select
    u.id,
    u.primary_email,
    u.display_name,
    u.avatar_url,
    u.locale,
    u.time_zone,
    u.onboarding_status,
    u.signup_intent,
    w.id
  from public.users u
  join public.workspace_memberships m on m.user_id = u.id and m.status = 'active'
  join public.workspaces w on w.id = m.workspace_id and w.status = 'active'
  where u.auth_user_id = auth.uid() and u.status = 'active'
  limit 1;
$$;

revoke all on function public.get_my_app_context() from public, anon;
grant execute on function public.get_my_app_context() to authenticated;

commit;
