begin;

-- Scanning was only mutual when the scanner already had a *published* card.
--
-- link_people_connection_from_scan looked up the scanner's published card and
-- skipped the reverse row entirely when there wasn't one. Every new tester is
-- in exactly that position: DEC-032 auto-creates their card as a draft, so a
-- brand new user scans someone, gets them added, and stays invisible to the
-- person they just met. Observed live - Uzoma scanned Raphael's card, the
-- forward row was written, and the reverse row was never attempted because the
-- draft card did not match `status = 'published'`.
--
-- The card requirement was never real. A connection needs a person, and a user
-- always has one: users.display_name and users.primary_email. card_id and
-- card_slug become nullable so a connection can exist before its subject has
-- published anything, and gain their card later.
alter table public.people_connections
  alter column card_id drop not null,
  alter column card_slug drop not null;

-- `unique (workspace_id, card_id)` still dedupes card-backed connections, but
-- Postgres treats NULLs as distinct, so card-less rows would duplicate on every
-- rescan. Key those on the person instead.
create unique index if not exists people_connections_cardless_person_uidx
  on public.people_connections (workspace_id, lower(person_email))
  where card_id is null and person_email <> '';

comment on column public.people_connections.card_id is
  'The card this connection came from. Null when the person had not published a card when you met - they are still a connection, and this fills in if they publish later.';

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
      on conflict (dedupe_key) do nothing;
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
