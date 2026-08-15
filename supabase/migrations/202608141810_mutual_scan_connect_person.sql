begin;

-- Return the scanned person's identity too, so the client can render the
-- connection-success sheet ("You're connected with X") without a second
-- round trip.
create or replace function public.link_people_connection_from_scan(
  p_slug text,
  p_event_id uuid default null,
  p_event_title text default null,
  p_event_location text default null,
  p_occurred_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_scanner_display_name text;
  v_card record;
  v_connection_id uuid;
  v_scanner_card record;
  v_mutual boolean := false;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  select w.id, u.display_name into v_workspace_id, v_scanner_display_name
  from public.users u
  join public.workspace_memberships m on m.user_id = u.id and m.status = 'active'
  join public.workspaces w on w.id = m.workspace_id and w.status = 'active'
  where u.auth_user_id = auth.uid() and u.status = 'active'
  limit 1;

  if v_workspace_id is null then raise exception 'workspace not found'; end if;

  select card.id, card.slug, card.full_name, card.job_title, card.company, card.workspace_id
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

  if v_card.workspace_id <> v_workspace_id then
    select c.id, c.slug, c.full_name, c.job_title, c.company
    into v_scanner_card
    from public.cards c
    where c.workspace_id = v_workspace_id and c.status = 'published'
    order by c.is_primary desc, c.created_at asc
    limit 1;

    if v_scanner_card.id is not null then
      insert into public.people_connections (
        workspace_id, card_id, person_name, person_role, person_company,
        card_slug, card_owner_name, event_id, event_title, event_location, occurred_at
      ) values (
        v_card.workspace_id, v_scanner_card.id, v_scanner_card.full_name,
        coalesce(v_scanner_card.job_title, ''), coalesce(v_scanner_card.company, ''),
        v_scanner_card.slug, v_scanner_card.full_name,
        p_event_id, p_event_title, p_event_location, p_occurred_at
      )
      on conflict (workspace_id, card_id) do update set
        connected_at = now(),
        event_id = coalesce(excluded.event_id, people_connections.event_id),
        event_title = coalesce(excluded.event_title, people_connections.event_title),
        event_location = coalesce(excluded.event_location, people_connections.event_location),
        occurred_at = coalesce(excluded.occurred_at, people_connections.occurred_at);

      v_mutual := true;

      begin
        insert into public.notifications (
          user_id, workspace_id, type, title, body, dedupe_key
        )
        select
          owner_membership.user_id,
          v_card.workspace_id,
          'connection_added',
          coalesce(v_scanner_display_name, 'Someone') || ' connected with you',
          'You''re now connected on ehllo — add a follow-up or view their card.',
          'connection_added:' || v_card.workspace_id::text || ':' || v_workspace_id::text
        from public.workspace_memberships owner_membership
        where owner_membership.workspace_id = v_card.workspace_id
          and owner_membership.status = 'active'
        on conflict (user_id, dedupe_key) do nothing;
      exception when others then
        null;
      end;
    end if;
  end if;

  return jsonb_build_object(
    'connectionId', v_connection_id,
    'mutual', v_mutual,
    'personName', v_card.full_name,
    'personRole', v_card.job_title,
    'personCompany', v_card.company
  );
end;
$$;

commit;
