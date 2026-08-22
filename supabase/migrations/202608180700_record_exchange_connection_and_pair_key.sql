begin;

-- Two things, both consequences of record_connection existing.
--
-- 1. An exchange never recorded a connection at all.
--
-- submit_card_exchange writes a card_exchanges row, and the route then
-- provisions the visitor an auth user, a workspace, a membership and a
-- published card. So by the end of that request BOTH parties are real ehllo
-- users with workspaces - and neither one appears in the other's People list.
-- The owner sees the visitor only as a card_exchanges row, and the visitor
-- sees the owner only if and when they later sign in and
-- link_people_connections_for_email happens to run.
--
-- That is the same "works for the first person, does nothing for the second"
-- shape as the rest of this surface, just deferred instead of dropped. The
-- exchange is the moment they met; that is when it should be recorded.
--
-- Note this needs no pending-identity machinery. record_connection already
-- handles a counterparty with no workspace: the reverse row is still written
-- because `v_left_ws is distinct from v_right_ws` is true when the left side
-- is null, so the owner sees the visitor even if provisioning failed. The
-- visitor's own side fills in later, and the upserts make that idempotent.
--
-- 2. pair_key, so the two halves of a connection can find each other.
--
-- Both rows are written from one record_connection call but nothing links
-- them, so "shared history between the two parties" has nothing to hang on.
-- Deterministic from the two workspace ids, ordered so both sides compute the
-- same value. Additive and unused for now: shared history still needs the
-- privacy boundary decided before anything reads it.

alter table public.people_connections
  add column if not exists pair_key text;

comment on column public.people_connections.pair_key is
  'Deterministic key identifying the two workspaces in this connection, identical on both sides. Null when the other party has no workspace yet.';

create index if not exists people_connections_pair_idx
  on public.people_connections (pair_key)
  where pair_key is not null;

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
  v_pair_key text := nullif(p_context->>'pair_key', '');
  v_id uuid;
begin
  if p_owner_workspace_id is null then return null; end if;

  v_name := left(coalesce(
    nullif(trim(coalesce(p_subject->>'name', '')), ''),
    nullif(split_part(v_email, '@', 1), ''),
    'Someone'
  ), 160);

  if v_card_id is null and v_email = '' then return null; end if;

  if v_card_id is not null then
    insert into public.people_connections (
      workspace_id, card_id, exchange_id, person_name, person_role, person_company,
      person_email, card_slug, card_owner_name, event_id, event_title, event_location,
      occurred_at, pair_key
    ) values (
      p_owner_workspace_id, v_card_id, v_exchange_id, v_name, v_role, v_company,
      v_email, v_slug, v_name, v_event_id, v_event_title, v_event_location,
      v_occurred_at, v_pair_key
    )
    on conflict (workspace_id, card_id) do update set
      connected_at = now(),
      person_email = case when excluded.person_email <> '' then excluded.person_email else people_connections.person_email end,
      person_role = case when excluded.person_role <> '' then excluded.person_role else people_connections.person_role end,
      person_company = case when excluded.person_company <> '' then excluded.person_company else people_connections.person_company end,
      card_slug = coalesce(excluded.card_slug, people_connections.card_slug),
      exchange_id = coalesce(excluded.exchange_id, people_connections.exchange_id),
      event_id = coalesce(excluded.event_id, people_connections.event_id),
      event_title = coalesce(excluded.event_title, people_connections.event_title),
      event_location = coalesce(excluded.event_location, people_connections.event_location),
      occurred_at = coalesce(excluded.occurred_at, people_connections.occurred_at),
      pair_key = coalesce(excluded.pair_key, people_connections.pair_key)
    returning id into v_id;
  else
    insert into public.people_connections (
      workspace_id, card_id, exchange_id, person_name, person_role, person_company,
      person_email, card_slug, card_owner_name, event_id, event_title, event_location,
      occurred_at, pair_key
    ) values (
      p_owner_workspace_id, null, v_exchange_id, v_name, v_role, v_company,
      v_email, null, v_name, v_event_id, v_event_title, v_event_location,
      v_occurred_at, v_pair_key
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
      occurred_at = coalesce(excluded.occurred_at, people_connections.occurred_at),
      pair_key = coalesce(excluded.pair_key, people_connections.pair_key)
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

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
  v_ctx jsonb := coalesce(p_context, '{}'::jsonb);
  v_left_id uuid;
  v_right_id uuid;
  v_mutual boolean := false;
  v_actor_name text;
begin
  -- Ordered so both sides of the same connection compute the same key.
  if v_left_ws is not null and v_right_ws is not null and v_left_ws <> v_right_ws then
    v_ctx := v_ctx || jsonb_build_object(
      'pair_key',
      least(v_left_ws::text, v_right_ws::text) || ':' || greatest(v_left_ws::text, v_right_ws::text)
    );
  end if;

  v_left_id := public.record_connection_side(v_left_ws, p_right, v_ctx);

  if v_right_ws is not null and v_left_ws is distinct from v_right_ws then
    v_right_id := public.record_connection_side(v_right_ws, p_left, v_ctx);
    v_mutual := v_right_id is not null;
  end if;

  if v_mutual and coalesce((v_ctx->>'notify')::boolean, true) then
    v_actor_name := coalesce(nullif(trim(p_left->>'name'), ''), 'Someone');
    insert into public.notifications (workspace_id, user_id, type, title, body, dedupe_key)
    select
      v_right_ws,
      m.user_id,
      'shared_meeting_update',
      left(v_actor_name || ' connected with you', 200),
      coalesce(nullif(v_ctx->>'notice_body', ''), 'Open People to see them.'),
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

-- Record the connection at the moment of the exchange, from the service role.
-- The visitor is the party who acted, so they are the left side and the card
-- owner is the one notified.
create or replace function public.record_exchange_connection(p_exchange_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exchange record;
  v_visitor_ws uuid;
  v_visitor_card record;
  v_card_email text;
begin
  select exchange.id, exchange.visitor_email, exchange.visitor_name, exchange.visitor_role,
         exchange.visitor_company, exchange.event_id,
         card.id as card_id, card.slug, card.full_name, card.job_title,
         card.company, card.workspace_id
  into v_exchange
  from public.card_exchanges exchange
  join public.cards card on card.id = exchange.card_id
  where exchange.id = p_exchange_id
  limit 1;
  if v_exchange.id is null then raise exception 'exchange not found'; end if;

  -- With no address there is no key for a card-less row, so there is nothing
  -- to record on either side. Say so rather than failing.
  if coalesce(trim(v_exchange.visitor_email), '') = '' then
    return jsonb_build_object('mutual', false, 'reason', 'no visitor email');
  end if;

  select w.id into v_visitor_ws
  from public.users u
  join public.workspace_memberships m on m.user_id = u.id and m.status = 'active'
  join public.workspaces w on w.id = m.workspace_id and w.status = 'active'
  where lower(trim(u.primary_email)) = lower(trim(v_exchange.visitor_email))
    and u.status = 'active'
  order by m.joined_at asc
  limit 1;

  select c.id, c.slug, c.full_name, c.job_title, c.company
  into v_visitor_card
  from public.cards c
  where c.workspace_id = v_visitor_ws and c.status = 'published'
  order by c.is_primary desc, c.created_at asc
  limit 1;

  v_card_email := coalesce(public.connection_card_email(v_exchange.card_id), '');

  return public.record_connection(
    jsonb_build_object(
      'workspace_id', v_visitor_ws,
      'card_id', v_visitor_card.id,
      'name', coalesce(
        nullif(trim(v_exchange.visitor_name), ''),
        nullif(trim(v_visitor_card.full_name), ''),
        split_part(trim(v_exchange.visitor_email), '@', 1)
      ),
      'role', coalesce(nullif(trim(v_exchange.visitor_role), ''), v_visitor_card.job_title, ''),
      'company', coalesce(nullif(trim(v_exchange.visitor_company), ''), v_visitor_card.company, ''),
      'email', trim(v_exchange.visitor_email),
      'card_slug', v_visitor_card.slug
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
end;
$$;

revoke all on function public.record_exchange_connection(uuid) from public, anon, authenticated;

commit;
