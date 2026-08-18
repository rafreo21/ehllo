begin;

-- 202608180200 made scanning mutual and, in the same function, started
-- notifying the person whose card was scanned. That notification insert reads
--
--   on conflict (dedupe_key) do nothing
--
-- but the only unique constraint on public.notifications is
-- notifications_user_id_dedupe_key_key, UNIQUE (user_id, dedupe_key). Postgres
-- infers an arc from the exact column list given, and a subset does not match,
-- so the statement fails to plan with 42P10 ("there is no unique or exclusion
-- constraint matching the ON CONFLICT specification"). Verified directly
-- against the database: planning `on conflict (dedupe_key)` raises 42P10,
-- while `on conflict (user_id, dedupe_key)` plans and reaches execution.
--
-- The insert has no exception handler around it, so the 42P10 aborts
-- link_people_connection_from_scan entirely and rolls back the work it had
-- already done - including the forward connection row. The migration that was
-- written to stop a scan being silently one-way instead made every
-- cross-workspace scan fail outright.
--
-- It survives testing because of where it sits: the notification block only
-- runs under `if v_card.workspace_id <> v_workspace_id`. Scanning your own
-- card, or any card in your own workspace, never reaches it. Only a scan
-- between two real users does - which is the only case that matters and the
-- one a single-account test cannot produce.
--
-- This is the same defect class as 202608111000, where a partial unique index
-- could not serve as an ON CONFLICT target and every calendar upsert had been
-- failing since the table was created.

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
  select w.id, u.display_name, u.primary_email
  into v_workspace_id, v_scanner_display_name, v_scanner_email
  from public.workspace_memberships m
  join public.workspaces w on w.id = m.workspace_id
  join public.users u on u.id = m.user_id
  where m.user_id = auth.uid()
  order by m.created_at asc
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
