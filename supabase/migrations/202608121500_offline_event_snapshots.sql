begin;

alter table public.people_connections
  add column if not exists event_id uuid references public.events(id) on delete set null,
  add column if not exists event_title text,
  add column if not exists event_location text,
  add column if not exists occurred_at timestamptz;

create or replace function public.link_people_connection_from_scan(
  p_slug text,
  p_event_id uuid default null,
  p_event_title text default null,
  p_event_location text default null,
  p_occurred_at timestamptz default null
)
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
  where card.slug = lower(trim(p_slug)) and card.status = 'published'
  limit 1;

  if v_card.id is null then raise exception 'card not found'; end if;

  if p_event_id is not null and not exists (
    select 1 from public.event_attendance attendance
    join public.users app_user on app_user.id = attendance.user_id
    join public.events event on event.id = attendance.event_id
    where attendance.event_id = p_event_id
      and attendance.status = 'going'
      and app_user.auth_user_id = auth.uid()
      and coalesce(p_occurred_at, now()) >= event.starts_at
      and coalesce(p_occurred_at, now()) <= least(
        coalesce(event.ends_at, event.starts_at + interval '4 hours'),
        coalesce(attendance.left_at, 'infinity'::timestamptz)
      )
  ) then
    p_event_id := null;
    p_event_title := null;
    p_event_location := null;
  end if;

  insert into public.people_connections (
    workspace_id, card_id, person_name, person_role, person_company,
    card_slug, card_owner_name, event_id, event_title, event_location, occurred_at
  ) values (
    v_workspace_id, v_card.id, v_card.full_name, coalesce(v_card.job_title, ''),
    coalesce(v_card.company, ''), v_card.slug, v_card.full_name,
    p_event_id, p_event_title, p_event_location, p_occurred_at
  )
  on conflict (workspace_id, card_id) do update set
    connected_at = now(),
    event_id = coalesce(excluded.event_id, people_connections.event_id),
    event_title = coalesce(excluded.event_title, people_connections.event_title),
    event_location = coalesce(excluded.event_location, people_connections.event_location),
    occurred_at = coalesce(excluded.occurred_at, people_connections.occurred_at)
  returning id into v_connection_id;

  return v_connection_id;
end;
$$;

grant execute on function public.link_people_connection_from_scan(text, uuid, text, text, timestamptz) to authenticated;

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
    'connectedAt', connection.connected_at,
    'eventId', connection.event_id,
    'eventTitle', connection.event_title,
    'eventLocation', connection.event_location,
    'occurredAt', connection.occurred_at
  )
  from public.people_connections connection
  join public.workspace_memberships membership on membership.workspace_id = connection.workspace_id
  join public.users app_user on app_user.id = membership.user_id
  where membership.status = 'active' and app_user.auth_user_id = auth.uid()
  order by connection.connected_at desc;
$$;

commit;
