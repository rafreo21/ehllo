begin;

-- link_people_connection_from_scan has been failing on its first statement for
-- every caller since 202608180200. Scanning is not degraded, it is dead, and
-- the 42P10 fixed in 202608180400 is downstream of two defects that fire first.
-- All three were introduced by the same migration.
--
-- 1. `order by m.created_at asc` - workspace_memberships has no created_at
--    column. It has joined_at. Running the function's own opening SELECT
--    against the database returns
--
--      42703: column m.created_at does not exist
--      HINT: Perhaps you meant to reference the column "w.created_at" ...
--
--    This aborts the call before anything else is evaluated.
--
-- 2. `where m.user_id = auth.uid()` - workspace_memberships.user_id references
--    public.users(id), while auth.uid() returns users.auth_user_id. They are
--    never the same value: across all 4 users, `id = auth_user_id` holds 0
--    times, the auth.uid() form matches 0 of 4 memberships, and the
--    users-join form matches 4 of 4. Even with the 42703 gone, this returns no
--    row and raises 'workspace not found' for everybody.
--
-- 3. The ON CONFLICT arc, already corrected in 202608180400 and carried here.
--
-- The three sibling functions - link_people_connection_from_share_token,
-- _from_exchange, and link_people_connections_for_email - all resolve the
-- caller as `u.auth_user_id = auth.uid() and u.status = 'active'`, joined
-- through active membership and an active workspace. 202608180200 rewrote that
-- lookup into a new shape and lost the auth guard and both status filters with
-- it. This restores the proven pattern and orders by the column that exists.
--
-- Verified against the database: the restored SELECT executes and resolves a
-- workspace for 4 of 4 active users; the shipped one resolves 0.
--
-- Why it reached staging: the scan path cannot be exercised with one account.
-- Every defect here sits on the cross-user branch or in a statement only a
-- real caller reaches, and auth.uid() is null in a SQL console, so the query
-- returns empty rather than wrong. It needed two accounts to see at all.

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
  v_scanner_email text;
  v_card record;
  v_card_email text;
  v_connection_id uuid;
  v_scanner_card record;
  v_scanner_card_email text;
  v_mutual boolean := false;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  select w.id, u.display_name, u.primary_email
  into v_workspace_id, v_scanner_display_name, v_scanner_email
  from public.users u
  join public.workspace_memberships m on m.user_id = u.id and m.status = 'active'
  join public.workspaces w on w.id = m.workspace_id and w.status = 'active'
  where u.auth_user_id = auth.uid() and u.status = 'active'
  order by m.joined_at asc
  limit 1;

  if v_workspace_id is null then raise exception 'workspace not found'; end if;

  select c.id, c.slug, c.full_name, c.job_title, c.company, c.workspace_id
  into v_card
  from public.cards c
  where c.slug = lower(trim(p_slug)) and c.status = 'published'
  limit 1;

  if v_card.id is null then raise exception 'card not found'; end if;

  select trim(m.value) into v_card_email
  from public.card_methods m
  where m.card_id = v_card.id and m.method_type = 'email' and trim(m.value) <> ''
  order by m.sort_order asc
  limit 1;

  insert into public.people_connections (
    workspace_id, card_id, person_name, person_role, person_company, person_email,
    card_slug, card_owner_name, event_id, event_title, event_location, occurred_at
  ) values (
    v_workspace_id, v_card.id, v_card.full_name, coalesce(v_card.job_title, ''),
    coalesce(v_card.company, ''), coalesce(v_card_email, ''),
    v_card.slug, v_card.full_name,
    p_event_id, p_event_title, p_event_location, p_occurred_at
  )
  on conflict (workspace_id, card_id) do update set
    connected_at = now(),
    person_email = case
      when coalesce(excluded.person_email, '') <> '' then excluded.person_email
      else people_connections.person_email
    end,
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
      select trim(m.value) into v_scanner_card_email
      from public.card_methods m
      where m.card_id = v_scanner_card.id and m.method_type = 'email' and trim(m.value) <> ''
      order by m.sort_order asc
      limit 1;

      insert into public.people_connections (
        workspace_id, card_id, person_name, person_role, person_company, person_email,
        card_slug, card_owner_name, event_id, event_title, event_location, occurred_at
      ) values (
        v_card.workspace_id, v_scanner_card.id, v_scanner_card.full_name,
        coalesce(v_scanner_card.job_title, ''), coalesce(v_scanner_card.company, ''),
        coalesce(nullif(v_scanner_card_email, ''), v_scanner_email, ''),
        v_scanner_card.slug, v_scanner_card.full_name,
        p_event_id, p_event_title, p_event_location, p_occurred_at
      )
      on conflict (workspace_id, card_id) do update set
        connected_at = now(),
        person_email = case
          when coalesce(excluded.person_email, '') <> '' then excluded.person_email
          else people_connections.person_email
        end,
        event_id = coalesce(excluded.event_id, people_connections.event_id),
        event_title = coalesce(excluded.event_title, people_connections.event_title),
        event_location = coalesce(excluded.event_location, people_connections.event_location),
        occurred_at = coalesce(excluded.occurred_at, people_connections.occurred_at);

      v_mutual := true;

    elsif coalesce(v_scanner_email, '') <> '' then
      -- No published card, but a real person all the same. Record them from
      -- their account so the person whose card was scanned actually sees who
      -- scanned it. card_id stays null until they publish.
      insert into public.people_connections (
        workspace_id, card_id, person_name, person_role, person_company, person_email,
        card_slug, card_owner_name, event_id, event_title, event_location, occurred_at
      ) values (
        v_card.workspace_id, null,
        coalesce(nullif(trim(v_scanner_display_name), ''), split_part(v_scanner_email, '@', 1)),
        '', '', v_scanner_email,
        null,
        coalesce(nullif(trim(v_scanner_display_name), ''), split_part(v_scanner_email, '@', 1)),
        p_event_id, p_event_title, p_event_location, p_occurred_at
      )
      on conflict (workspace_id, lower(person_email)) where card_id is null and person_email <> ''
      do update set
        connected_at = now(),
        event_id = coalesce(excluded.event_id, people_connections.event_id),
        event_title = coalesce(excluded.event_title, people_connections.event_title),
        event_location = coalesce(excluded.event_location, people_connections.event_location),
        occurred_at = coalesce(excluded.occurred_at, people_connections.occurred_at);

      v_mutual := true;
    end if;

    if v_mutual then
      insert into public.notifications (
        workspace_id, user_id, type, title, body, dedupe_key
      )
      select
        v_card.workspace_id,
        owner_membership.user_id,
        'shared_meeting_update',
        coalesce(v_scanner_display_name, 'Someone') || ' connected with you',
        'They scanned your card. Open People to see them.',
        'connection_added:' || v_card.workspace_id::text || ':' || v_workspace_id::text
      from public.workspace_memberships owner_membership
      where owner_membership.workspace_id = v_card.workspace_id
      on conflict (user_id, dedupe_key) do nothing;
    end if;
  end if;

  return jsonb_build_object(
    'connectionId', v_connection_id,
    'mutual', v_mutual,
    'personName', v_card.full_name,
    'personRole', v_card.job_title,
    'personCompany', v_card.company,
    'personEmail', coalesce(v_card_email, '')
  );
end;
$$;

commit;
