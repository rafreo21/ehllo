begin;

-- Shared history between two parties, hanging off the pair_key added in
-- 202608180700.
--
-- The boundary is the whole design, so it is stated here rather than left to
-- each caller. Mutually visible means: facts both people already witnessed.
--
--   shared   when and where they met, the event context of that meeting,
--            invitations sent between them and the response, and the subject
--            and time of emails that were actually delivered between them
--   private  capture notes, AI summaries, follow-up drafts, commitments
--            recorded during a capture, and anything queued but not sent
--
-- An email is included only at status 'sent'. A queued or failed one has not
-- reached the other party, so showing it to them would be inventing history;
-- showing it as "shared" to the sender would be worse, implying it landed.
-- Subjects only, never html: the recipient has the body in their mail client
-- already, and copying it into an API response widens the exposure for nothing.
--
-- encounter_guest_follow_ups is deliberately excluded even though it is
-- guest-facing. Its `note` is commitment text written during a private capture,
-- and the line above puts capture content on the private side.

create or replace function public.get_shared_history(p_connection_id uuid)
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

  -- The caller must own the side they are asking about. This is a definer
  -- function, so RLS on people_connections does not apply and the check has to
  -- be explicit; without it any connection id would read any pair's history.
  select id, workspace_id, pair_key, person_email, person_name, connected_at,
         event_id, event_title, event_location, occurred_at
  into v_row
  from public.people_connections
  where id = p_connection_id and workspace_id = v_actor.workspace_id;
  if v_row.id is null then raise exception 'connection not found'; end if;

  v_actor_email := lower(coalesce(trim(v_actor.primary_email), ''));
  v_other_email := lower(coalesce(trim(v_row.person_email), ''));

  -- pair_key is least:greatest of the two workspace ids, and a uuid contains no
  -- colon, so splitting is unambiguous. Null means the other party has no
  -- workspace yet, in which case the meeting is all there is to show.
  if v_row.pair_key is not null then
    v_other_ws := case
      when split_part(v_row.pair_key, ':', 1)::uuid = v_actor.workspace_id
        then split_part(v_row.pair_key, ':', 2)::uuid
      else split_part(v_row.pair_key, ':', 1)::uuid
    end;
  end if;

  -- 1. The meeting itself.
  v_items := v_items || jsonb_build_array(jsonb_build_object(
    'kind', 'met',
    'at', v_row.connected_at,
    'eventId', v_row.event_id,
    'eventTitle', v_row.event_title,
    'eventLocation', v_row.event_location,
    'occurredAt', v_row.occurred_at
  ));

  if v_other_ws is null or v_other_email = '' then
    return jsonb_build_object('connectionId', v_row.id, 'pairKey', v_row.pair_key, 'items', v_items);
  end if;

  -- 2. Invitations either way. Being invited and responding are both facts the
  -- other side saw, so direction is reported rather than hidden.
  v_items := v_items || coalesce((
    select jsonb_agg(jsonb_build_object(
      'kind', 'event_invite',
      'at', invitation.created_at,
      'direction', case when event.workspace_id = v_actor.workspace_id then 'outbound' else 'inbound' end,
      'eventId', event.id,
      'eventTitle', event.title,
      'status', invitation.status,
      'respondedAt', invitation.responded_at
    ))
    from public.event_invitations invitation
    join public.events event on event.id = invitation.event_id
    where invitation.status <> 'revoked'
      and (
        (event.workspace_id = v_actor.workspace_id and lower(trim(invitation.invited_email)) = v_other_email)
        or (event.workspace_id = v_other_ws and lower(trim(invitation.invited_email)) = v_actor_email)
      )
  ), '[]'::jsonb);

  -- 3. Delivered emails between them, subject and time only.
  v_items := v_items || coalesce((
    select jsonb_agg(jsonb_build_object(
      'kind', 'email',
      'at', outbox.sent_at,
      'direction', case when event.workspace_id = v_actor.workspace_id then 'outbound' else 'inbound' end,
      'emailKind', outbox.kind,
      'subject', outbox.subject,
      'eventId', event.id,
      'eventTitle', event.title
    ))
    from public.event_email_outbox outbox
    join public.events event on event.id = outbox.event_id
    where outbox.status = 'sent'
      and outbox.sent_at is not null
      and (
        (event.workspace_id = v_actor.workspace_id and lower(trim(outbox.recipient_email)) = v_other_email)
        or (event.workspace_id = v_other_ws and lower(trim(outbox.recipient_email)) = v_actor_email)
      )
  ), '[]'::jsonb);

  -- Newest first, and stable when two things share a timestamp.
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

revoke all on function public.get_shared_history(uuid) from public, anon;
grant execute on function public.get_shared_history(uuid) to authenticated;

commit;
