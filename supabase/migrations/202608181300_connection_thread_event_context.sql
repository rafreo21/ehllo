begin;

-- Adds the event context to meetings in the thread.
--
-- encounters.event_id already says where a conversation happened, and the
-- connection screen was resolving it client-side against the caller's own
-- events. That works for your own captures and cannot work for the other
-- party's: the event row belongs to whichever workspace owns the encounter, so
-- the person on the other side has no way to read it. Resolving it inside this
-- definer function is what makes "we met at X" visible to both of them, which
-- is the whole point of the thread being shared.
--
-- Everything else is unchanged from 202608181200.

create or replace function public.get_connection_thread(p_connection_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor record;
  v_row record;
  v_other_ws uuid;
  v_other_email text;
  v_actor_email text;
  v_items jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  select * into v_actor from public.connection_actor();
  if v_actor.workspace_id is null then raise exception 'workspace not found'; end if;

  -- Definer function, so RLS does not apply and the caller's ownership of the
  -- side they are asking about has to be checked explicitly.
  select id, workspace_id, pair_key, person_email, person_name, connected_at,
         event_id, event_title, event_location, occurred_at
  into v_row
  from public.people_connections
  where id = p_connection_id and workspace_id = v_actor.workspace_id;
  if v_row.id is null then raise exception 'connection not found'; end if;

  v_actor_email := lower(coalesce(trim(v_actor.primary_email), ''));
  v_other_email := lower(coalesce(trim(v_row.person_email), ''));

  if v_row.pair_key is not null then
    v_other_ws := case
      when split_part(v_row.pair_key, ':', 1)::uuid = v_actor.workspace_id
        then split_part(v_row.pair_key, ':', 2)::uuid
      else split_part(v_row.pair_key, ':', 1)::uuid
    end;
  end if;

  -- 1. The meeting that started it.
  v_items := v_items || jsonb_build_array(jsonb_build_object(
    'kind', 'met',
    'at', v_row.connected_at,
    'mine', true,
    'eventId', v_row.event_id,
    'eventTitle', v_row.event_title,
    'eventLocation', v_row.event_location
  ));

  -- 2. Conversations either of them recorded, where both were present.
  v_items := v_items || coalesce((
    select jsonb_agg(jsonb_build_object(
      'kind', 'meeting',
      'at', encounter.started_at,
      'id', encounter.id,
      'mine', encounter.workspace_id = v_actor.workspace_id,
      'title', encounter.title,
      'personName', encounter.person_name,
      -- Their record: only the part they chose to share, and only once shared.
      'summary', case
        when encounter.workspace_id = v_actor.workspace_id then encounter.shared_summary
        when encounter.status = 'shared' then encounter.shared_summary
        else ''
      end,
      'shared', encounter.status = 'shared',
      'status', encounter.status,
      -- Where it happened. This has to be resolved here rather than by the
      -- client: the event row lives in whichever workspace owns the encounter,
      -- so the other party cannot read it themselves. A definer function can,
      -- and "we met at X" is a fact both people were present for.
      'eventId', encounter.event_id,
      'eventTitle', coalesce(event.title, ''),
      'eventLocation', coalesce(event.location, '')
    ))
    from public.encounters encounter
    left join public.events event on event.id = encounter.event_id
    where encounter.status <> 'archived'
      and (
        -- mine, about them
        (encounter.workspace_id = v_actor.workspace_id and (
          lower(trim(encounter.person_email)) = v_other_email and v_other_email <> ''
          or exists (
            select 1 from public.encounter_participants participant
            where participant.encounter_id = encounter.id
              and lower(trim(participant.email)) = v_other_email and v_other_email <> ''
          )
        ))
        -- theirs, with me in it
        or (v_other_ws is not null and encounter.workspace_id = v_other_ws and (
          lower(trim(encounter.person_email)) = v_actor_email and v_actor_email <> ''
          or exists (
            select 1 from public.encounter_participants participant
            where participant.encounter_id = encounter.id
              and lower(trim(participant.email)) = v_actor_email and v_actor_email <> ''
          )
        ))
      )
  ), '[]'::jsonb);

  -- 3. Follow-ups, reaching whoever they are recorded against.
  --
  -- This is the "correct for three of four" case: a follow-up is visible to the
  -- person who recorded it and to the person whose address it names, and to
  -- nobody else. No workspace-wide fallback, because that would hand someone a
  -- commitment that was never theirs.
  v_items := v_items || coalesce((
    select jsonb_agg(jsonb_build_object(
      'kind', 'follow_up',
      'at', coalesce(guest.due_at, guest.committed_at, guest.created_at),
      'id', guest.id,
      'mine', encounter.workspace_id = v_actor.workspace_id,
      'forMe', lower(trim(guest.guest_email)) = v_actor_email and v_actor_email <> '',
      'note', guest.note,
      'guestName', guest.guest_name,
      'channel', guest.channel,
      'dueAt', guest.due_at,
      'committedAt', guest.committed_at
    ))
    from public.encounter_guest_follow_ups guest
    join public.encounters encounter on encounter.id = guest.encounter_id
    where encounter.status <> 'archived'
      and (
        (encounter.workspace_id = v_actor.workspace_id
          and lower(trim(guest.guest_email)) = v_other_email and v_other_email <> '')
        or (lower(trim(guest.guest_email)) = v_actor_email and v_actor_email <> ''
          and v_other_ws is not null and encounter.workspace_id = v_other_ws)
      )
  ), '[]'::jsonb);

  if v_other_ws is null or v_other_email = '' then
    select coalesce(jsonb_agg(item order by (item->>'at') desc nulls last), '[]'::jsonb)
    into v_items from jsonb_array_elements(v_items) as item;
    return jsonb_build_object('connectionId', v_row.id, 'pairKey', v_row.pair_key,
      'personName', v_row.person_name, 'items', v_items);
  end if;

  -- 4. Invitations between them, either direction.
  v_items := v_items || coalesce((
    select jsonb_agg(jsonb_build_object(
      'kind', 'event_invite',
      'at', invitation.created_at,
      'mine', event.workspace_id = v_actor.workspace_id,
      'direction', case when event.workspace_id = v_actor.workspace_id then 'outbound' else 'inbound' end,
      'eventId', event.id,
      'eventTitle', event.title,
      'status', invitation.status
    ))
    from public.event_invitations invitation
    join public.events event on event.id = invitation.event_id
    where invitation.status <> 'revoked'
      and (
        (event.workspace_id = v_actor.workspace_id and lower(trim(invitation.invited_email)) = v_other_email)
        or (event.workspace_id = v_other_ws and lower(trim(invitation.invited_email)) = v_actor_email)
      )
  ), '[]'::jsonb);

  -- 5. Emails that actually reached the other side. Subjects only: the
  -- recipient already holds the body, and copying it here widens exposure for
  -- nothing. Queued or failed ones are excluded - showing one would invent a
  -- message the other person never received.
  v_items := v_items || coalesce((
    select jsonb_agg(jsonb_build_object(
      'kind', 'email',
      'at', outbox.sent_at,
      'mine', event.workspace_id = v_actor.workspace_id,
      'direction', case when event.workspace_id = v_actor.workspace_id then 'outbound' else 'inbound' end,
      'subject', outbox.subject,
      'eventTitle', event.title
    ))
    from public.event_email_outbox outbox
    join public.events event on event.id = outbox.event_id
    where outbox.status = 'sent' and outbox.sent_at is not null
      and (
        (event.workspace_id = v_actor.workspace_id and lower(trim(outbox.recipient_email)) = v_other_email)
        or (event.workspace_id = v_other_ws and lower(trim(outbox.recipient_email)) = v_actor_email)
      )
  ), '[]'::jsonb);

  select coalesce(jsonb_agg(item order by (item->>'at') desc nulls last, item->>'kind'), '[]'::jsonb)
  into v_items
  from jsonb_array_elements(v_items) as item;

  return jsonb_build_object(
    'connectionId', v_row.id,
    'pairKey', v_row.pair_key,
    'personName', v_row.person_name,
    'items', v_items
  );
end;
$$;

commit;
