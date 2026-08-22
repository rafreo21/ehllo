begin;

-- Reciprocity was decided independently in four functions, and three of them
-- decided it wrong.
--
--   link_people_connection_from_scan          both directions, email, notify
--   link_people_connection_from_share_token   one direction, no email at all
--   link_people_connection_from_exchange      one direction
--   link_people_connections_for_email         one direction
--
-- Nothing enforced agreement between them, so each new path re-derived four
-- separate decisions - write the reverse row, capture the email, notify, feed
-- the nudge - and quietly got a different subset right. The share-token path
-- never wrote person_email, and the keep-in-touch cron filters
-- `.neq("person_email", "")`, so those people were silently ineligible for the
-- follow-up reminder that is the entire point of recording them.
--
-- The same drift produced the outage fixed in 202608180500: the scan function
-- was rewritten with a caller lookup none of its three siblings used, and the
-- siblings were the correct ones.
--
-- So: one rule, in one place. record_connection(left, right, context) decides
-- both directions, email capture and notification once. Every entry path now
-- only resolves who was met and hands over two identities. A fifth path cannot
-- forget the reverse row, because it never gets to make that decision.

-- Resolving the caller belongs in exactly one place. Three functions had this
-- right and the fourth drifted; there is now nothing to drift from.
create or replace function public.connection_actor()
returns table (workspace_id uuid, user_id uuid, display_name text, primary_email text)
language sql
stable
security definer
set search_path = public
as $$
  select
    w.id,
    u.id,
    coalesce(
      nullif(trim(u.display_name), ''),
      nullif(split_part(coalesce(u.primary_email, ''), '@', 1), ''),
      'Someone'
    ),
    coalesce(trim(u.primary_email), '')
  from public.users u
  join public.workspace_memberships m on m.user_id = u.id and m.status = 'active'
  join public.workspaces w on w.id = m.workspace_id and w.status = 'active'
  where u.auth_user_id = auth.uid() and u.status = 'active'
  order by m.joined_at asc
  limit 1;
$$;

-- The card's first email. Previously inlined in the scan path and absent from
-- every other one, which is why a share-token connection had no address to
-- follow up to.
create or replace function public.connection_card_email(p_card_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select trim(m.value)
  from public.card_methods m
  where m.card_id = p_card_id
    and m.method_type = 'email'
    and trim(m.value) <> ''
  order by m.sort_order asc
  limit 1;
$$;

-- One direction of a connection: p_owner's people list gains p_subject.
-- Every length here is clamped to the table's own check constraints so a long
-- card title can never turn a connection into a constraint violation that the
-- caller reports as "couldn't link that card".
create or replace function public.record_connection_side(
  p_owner_workspace_id uuid,
  p_subject jsonb,
  p_context jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card_id uuid := nullif(p_subject->>'card_id', '')::uuid;
  v_email text := left(coalesce(trim(p_subject->>'email'), ''), 320);
  v_name text;
  v_role text := left(coalesce(trim(p_subject->>'role'), ''), 120);
  v_company text := left(coalesce(trim(p_subject->>'company'), ''), 120);
  v_slug text := left(nullif(trim(coalesce(p_subject->>'card_slug', '')), ''), 120);
  v_exchange_id uuid := nullif(p_context->>'exchange_id', '')::uuid;
  v_event_id uuid := nullif(p_context->>'event_id', '')::uuid;
  v_event_title text := left(nullif(trim(coalesce(p_context->>'event_title', '')), ''), 160);
  v_event_location text := left(nullif(trim(coalesce(p_context->>'event_location', '')), ''), 320);
  v_occurred_at timestamptz := nullif(p_context->>'occurred_at', '')::timestamptz;
  v_id uuid;
begin
  if p_owner_workspace_id is null then return null; end if;

  -- person_name is NOT NULL with a trimmed-length check, so it always needs a
  -- real value; fall back to the address's local part before giving up.
  v_name := left(coalesce(
    nullif(trim(coalesce(p_subject->>'name', '')), ''),
    nullif(split_part(v_email, '@', 1), ''),
    'Someone'
  ), 160);

  -- Both unique arcs need either a card or an email. With neither, the row has
  -- no key and would duplicate on every rescan, so decline rather than litter.
  if v_card_id is null and v_email = '' then return null; end if;

  if v_card_id is not null then
    insert into public.people_connections (
      workspace_id, card_id, exchange_id, person_name, person_role, person_company,
      person_email, card_slug, card_owner_name, event_id, event_title, event_location, occurred_at
    ) values (
      p_owner_workspace_id, v_card_id, v_exchange_id, v_name, v_role, v_company,
      v_email, v_slug, v_name, v_event_id, v_event_title, v_event_location, v_occurred_at
    )
    on conflict (workspace_id, card_id) do update set
      connected_at = now(),
      -- Never overwrite known detail with a blank: a later, thinner sighting of
      -- the same person must not erase the address the follow-up depends on.
      person_email = case when excluded.person_email <> '' then excluded.person_email else people_connections.person_email end,
      person_role = case when excluded.person_role <> '' then excluded.person_role else people_connections.person_role end,
      person_company = case when excluded.person_company <> '' then excluded.person_company else people_connections.person_company end,
      card_slug = coalesce(excluded.card_slug, people_connections.card_slug),
      exchange_id = coalesce(excluded.exchange_id, people_connections.exchange_id),
      event_id = coalesce(excluded.event_id, people_connections.event_id),
      event_title = coalesce(excluded.event_title, people_connections.event_title),
      event_location = coalesce(excluded.event_location, people_connections.event_location),
      occurred_at = coalesce(excluded.occurred_at, people_connections.occurred_at)
    returning id into v_id;
  else
    -- Card-less: the person is real and has an address, they just have not
    -- published a card. Keyed on the person, per people_connections_cardless_person_uidx.
    insert into public.people_connections (
      workspace_id, card_id, exchange_id, person_name, person_role, person_company,
      person_email, card_slug, card_owner_name, event_id, event_title, event_location, occurred_at
    ) values (
      p_owner_workspace_id, null, v_exchange_id, v_name, v_role, v_company,
      v_email, null, v_name, v_event_id, v_event_title, v_event_location, v_occurred_at
    )
    on conflict (workspace_id, lower(person_email)) where card_id is null and person_email <> ''
    do update set
      connected_at = now(),
      person_name = case when excluded.person_name <> '' then excluded.person_name else people_connections.person_name end,
      person_role = case when excluded.person_role <> '' then excluded.person_role else people_connections.person_role end,
      person_company = case when excluded.person_company <> '' then excluded.person_company else people_connections.person_company end,
      exchange_id = coalesce(excluded.exchange_id, people_connections.exchange_id),
      event_id = coalesce(excluded.event_id, people_connections.event_id),
      event_title = coalesce(excluded.event_title, people_connections.event_title),
      event_location = coalesce(excluded.event_location, people_connections.event_location),
      occurred_at = coalesce(excluded.occurred_at, people_connections.occurred_at)
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

-- The whole reciprocity rule, once. p_left is the party who acted.
create or replace function public.record_connection(
  p_left jsonb,
  p_right jsonb,
  p_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_left_ws uuid := nullif(p_left->>'workspace_id', '')::uuid;
  v_right_ws uuid := nullif(p_right->>'workspace_id', '')::uuid;
  v_left_id uuid;
  v_right_id uuid;
  v_mutual boolean := false;
  v_actor_name text;
begin
  v_left_id := public.record_connection_side(v_left_ws, p_right, p_context);

  -- Reverse only across workspaces. Same workspace means you scanned your own
  -- card, and putting yourself in your own people list is not a connection.
  -- A right side with no workspace is not an ehllo user yet: nothing to write
  -- for them today, and the place a pending record will hook in later.
  if v_right_ws is not null and v_left_ws is distinct from v_right_ws then
    v_right_id := public.record_connection_side(v_right_ws, p_left, p_context);
    v_mutual := v_right_id is not null;
  end if;

  if v_mutual and coalesce((p_context->>'notify')::boolean, true) then
    v_actor_name := coalesce(nullif(trim(p_left->>'name'), ''), 'Someone');
    -- One row per member: the unique arc is (user_id, dedupe_key), so keying
    -- on dedupe_key alone both fails to plan and would have silenced everyone
    -- after the first member.
    insert into public.notifications (workspace_id, user_id, type, title, body, dedupe_key)
    select
      v_right_ws,
      m.user_id,
      'shared_meeting_update',
      left(v_actor_name || ' connected with you', 200),
      coalesce(nullif(p_context->>'notice_body', ''), 'Open People to see them.'),
      'connection_added:' || v_right_ws::text || ':' || coalesce(v_left_ws::text, 'unknown')
    from public.workspace_memberships m
    where m.workspace_id = v_right_ws and m.status = 'active'
    on conflict (user_id, dedupe_key) do nothing;
  end if;

  return jsonb_build_object(
    'connectionId', v_left_id,
    'reverseConnectionId', v_right_id,
    'mutual', v_mutual
  );
end;
$$;

-- Each entry path below now does one job: work out who the two parties are.
-- None of them decides whether the reverse row exists.

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
  v_actor record;
  v_card record;
  v_card_email text;
  v_actor_card record;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  select * into v_actor from public.connection_actor();
  if v_actor.workspace_id is null then raise exception 'workspace not found'; end if;

  select c.id, c.slug, c.full_name, c.job_title, c.company, c.workspace_id
  into v_card
  from public.cards c
  where c.slug = lower(trim(p_slug)) and c.status = 'published'
  limit 1;
  if v_card.id is null then raise exception 'card not found'; end if;

  v_card_email := coalesce(public.connection_card_email(v_card.id), '');

  -- The scanner's own card if they have published one. If they have not, the
  -- card-less branch of record_connection_side records them from their account,
  -- which is what 202608180200 set out to do.
  select c.id, c.slug, c.full_name, c.job_title, c.company
  into v_actor_card
  from public.cards c
  where c.workspace_id = v_actor.workspace_id and c.status = 'published'
  order by c.is_primary desc, c.created_at asc
  limit 1;

  v_result := public.record_connection(
    jsonb_build_object(
      'workspace_id', v_actor.workspace_id,
      'card_id', v_actor_card.id,
      'name', coalesce(nullif(trim(v_actor_card.full_name), ''), v_actor.display_name),
      'role', coalesce(v_actor_card.job_title, ''),
      'company', coalesce(v_actor_card.company, ''),
      'email', coalesce(nullif(coalesce(public.connection_card_email(v_actor_card.id), ''), ''), v_actor.primary_email),
      'card_slug', v_actor_card.slug
    ),
    jsonb_build_object(
      'workspace_id', v_card.workspace_id,
      'card_id', v_card.id,
      'name', v_card.full_name,
      'role', coalesce(v_card.job_title, ''),
      'company', coalesce(v_card.company, ''),
      'email', v_card_email,
      'card_slug', v_card.slug
    ),
    jsonb_build_object(
      'event_id', p_event_id,
      'event_title', p_event_title,
      'event_location', p_event_location,
      'occurred_at', p_occurred_at,
      'notice_body', 'They scanned your card. Open People to see them.'
    )
  );

  -- Contract unchanged: app/api/people/connections/route.ts reads exactly these.
  return jsonb_build_object(
    'connectionId', v_result->>'connectionId',
    'mutual', coalesce((v_result->>'mutual')::boolean, false),
    'personName', v_card.full_name,
    'personRole', coalesce(v_card.job_title, ''),
    'personCompany', coalesce(v_card.company, ''),
    'personEmail', v_card_email
  );
end;
$$;

create or replace function public.link_people_connection_from_share_token(p_share_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor record;
  v_encounter record;
  v_card_email text;
  v_actor_card record;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  select * into v_actor from public.connection_actor();
  if v_actor.workspace_id is null then raise exception 'workspace not found'; end if;

  select encounter.id, encounter.workspace_id,
         card.id as card_id, card.slug, card.full_name, card.job_title, card.company
  into v_encounter
  from public.encounters encounter
  join public.cards card on card.workspace_id = encounter.workspace_id and card.status = 'published'
  where encounter.share_token = trim(p_share_token) and encounter.status = 'shared'
  limit 1;
  if v_encounter.id is null then raise exception 'shared encounter not found'; end if;

  -- This path never captured an address before, so every connection it made was
  -- ineligible for the keep-in-touch nudge that filters on person_email <> ''.
  v_card_email := coalesce(public.connection_card_email(v_encounter.card_id), '');

  select c.id, c.slug, c.full_name, c.job_title, c.company
  into v_actor_card
  from public.cards c
  where c.workspace_id = v_actor.workspace_id and c.status = 'published'
  order by c.is_primary desc, c.created_at asc
  limit 1;

  v_result := public.record_connection(
    jsonb_build_object(
      'workspace_id', v_actor.workspace_id,
      'card_id', v_actor_card.id,
      'name', coalesce(nullif(trim(v_actor_card.full_name), ''), v_actor.display_name),
      'role', coalesce(v_actor_card.job_title, ''),
      'company', coalesce(v_actor_card.company, ''),
      'email', coalesce(nullif(coalesce(public.connection_card_email(v_actor_card.id), ''), ''), v_actor.primary_email),
      'card_slug', v_actor_card.slug
    ),
    jsonb_build_object(
      'workspace_id', v_encounter.workspace_id,
      'card_id', v_encounter.card_id,
      'name', v_encounter.full_name,
      'role', coalesce(v_encounter.job_title, ''),
      'company', coalesce(v_encounter.company, ''),
      'email', v_card_email,
      'card_slug', v_encounter.slug
    ),
    jsonb_build_object('notice_body', 'They opened a meeting you shared. Open People to see them.')
  );

  return (v_result->>'connectionId')::uuid;
end;
$$;

create or replace function public.link_people_connection_from_exchange(p_exchange_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor record;
  v_exchange record;
  v_card_email text;
  v_actor_card record;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  select * into v_actor from public.connection_actor();
  if v_actor.workspace_id is null then raise exception 'workspace not found'; end if;

  select exchange.id, exchange.visitor_email, exchange.visitor_name,
         exchange.visitor_role, exchange.visitor_company, exchange.event_id,
         card.id as card_id, card.slug, card.full_name, card.job_title,
         card.company, card.workspace_id
  into v_exchange
  from public.card_exchanges exchange
  join public.cards card on card.id = exchange.card_id
  where exchange.id = p_exchange_id
  limit 1;
  if v_exchange.id is null then raise exception 'exchange not found'; end if;

  if v_exchange.visitor_email <> ''
     and lower(v_exchange.visitor_email) <> lower(coalesce(v_actor.primary_email, '')) then
    raise exception 'exchange email mismatch';
  end if;

  v_card_email := coalesce(public.connection_card_email(v_exchange.card_id), '');

  select c.id, c.slug, c.full_name, c.job_title, c.company
  into v_actor_card
  from public.cards c
  where c.workspace_id = v_actor.workspace_id and c.status = 'published'
  order by c.is_primary desc, c.created_at asc
  limit 1;

  v_result := public.record_connection(
    jsonb_build_object(
      'workspace_id', v_actor.workspace_id,
      'card_id', v_actor_card.id,
      -- Prefer what they typed on the card over their account name: it is what
      -- the other party actually saw at the time.
      'name', coalesce(nullif(trim(v_exchange.visitor_name), ''), nullif(trim(v_actor_card.full_name), ''), v_actor.display_name),
      'role', coalesce(nullif(trim(v_exchange.visitor_role), ''), v_actor_card.job_title, ''),
      'company', coalesce(nullif(trim(v_exchange.visitor_company), ''), v_actor_card.company, ''),
      'email', coalesce(nullif(trim(v_exchange.visitor_email), ''), v_actor.primary_email),
      'card_slug', v_actor_card.slug
    ),
    jsonb_build_object(
      'workspace_id', v_exchange.workspace_id,
      'card_id', v_exchange.card_id,
      'name', v_exchange.full_name,
      'role', coalesce(v_exchange.job_title, ''),
      'company', coalesce(v_exchange.company, ''),
      'email', v_card_email,
      'card_slug', v_exchange.slug
    ),
    jsonb_build_object(
      'exchange_id', v_exchange.id,
      'event_id', v_exchange.event_id,
      'notice_body', 'They shared their details from your card. Open People to see them.'
    )
  );

  return (v_result->>'connectionId')::uuid;
end;
$$;

create or replace function public.link_people_connections_for_email()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor record;
  v_exchange record;
  v_linked integer := 0;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  select * into v_actor from public.connection_actor();
  if v_actor.workspace_id is null or coalesce(v_actor.primary_email, '') = '' then
    return 0;
  end if;

  for v_exchange in
    select exchange.id
    from public.card_exchanges exchange
    where lower(trim(exchange.visitor_email)) = lower(v_actor.primary_email)
  loop
    -- Delegating to the exchange path keeps the backfill and the live claim
    -- identical by construction; they used to be two similar-looking inserts.
    begin
      if public.link_people_connection_from_exchange(v_exchange.id) is not null then
        v_linked := v_linked + 1;
      end if;
    exception when others then
      -- One unusable exchange must not abandon the rest of the backfill.
      continue;
    end;
  end loop;

  return v_linked;
end;
$$;

revoke all on function public.connection_actor() from public, anon;
revoke all on function public.connection_card_email(uuid) from public, anon;
revoke all on function public.record_connection_side(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.record_connection(jsonb, jsonb, jsonb) from public, anon;

grant execute on function public.connection_actor() to authenticated;
grant execute on function public.connection_card_email(uuid) to authenticated;
grant execute on function public.record_connection_side(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.record_connection(jsonb, jsonb, jsonb) to authenticated;

commit;
