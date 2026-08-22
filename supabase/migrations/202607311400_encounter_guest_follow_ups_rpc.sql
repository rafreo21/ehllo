begin;

-- Replace the single anonymous jsonb blob with real rows in
-- encounter_guest_follow_ups (added in 202607311300_encounter_participants.sql).
-- Same signature as before - the anonymous guest page's submit flow is
-- unchanged; multiple guests can now each submit independently instead of
-- overwriting one another.
create or replace function public.commit_guest_follow_up(p_share_token text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_encounter_id uuid;
  v_row public.encounter_guest_follow_ups;
begin
  select id into v_encounter_id from public.encounters
  where share_token = p_share_token and status = 'shared'
  limit 1;

  if v_encounter_id is null then
    raise exception 'shared encounter not found';
  end if;

  insert into public.encounter_guest_follow_ups (encounter_id, note, committed_at)
  values (v_encounter_id, coalesce(nullif(trim(p_note), ''), ''), now())
  returning * into v_row;

  return jsonb_build_object('committedAt', v_row.committed_at, 'note', v_row.note);
end;
$$;

grant execute on function public.commit_guest_follow_up(text, text) to anon, authenticated;

-- Expose the guest-facing read path with participant/commitment data instead
-- of the single scalar guest_follow_up column.
create or replace function public.get_shared_encounter(p_share_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
  v_encounter_id uuid;
  v_latest_follow_up jsonb;
  v_follow_up_count integer;
  v_participants jsonb;
begin
  select e.id into v_encounter_id
  from public.encounters e
  where e.share_token = p_share_token and e.status = 'shared'
  limit 1;

  if v_encounter_id is null then
    return null;
  end if;

  select jsonb_build_object('committedAt', gfu.committed_at, 'note', gfu.note)
  into v_latest_follow_up
  from public.encounter_guest_follow_ups gfu
  where gfu.encounter_id = v_encounter_id
  order by gfu.committed_at desc
  limit 1;

  select count(*) into v_follow_up_count
  from public.encounter_guest_follow_ups
  where encounter_id = v_encounter_id;

  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'displayName', p.display_name) order by p.sort_order), '[]'::jsonb)
  into v_participants
  from public.encounter_participants p
  where p.encounter_id = v_encounter_id;

  select jsonb_build_object(
    'id', e.id,
    'title', e.title,
    'personName', e.person_name,
    'personEmail', e.person_email,
    'startedAt', e.started_at,
    'endedAt', e.ended_at,
    'durationSeconds', e.duration_seconds,
    'consent', e.consent,
    'sharedSummary', e.shared_summary,
    'actions', e.actions,
    'status', e.status,
    'shareToken', e.share_token,
    'contactId', e.contact_id,
    'exchangeId', e.exchange_id,
    'guestFollowUp', v_latest_follow_up,
    'guestFollowUpCount', v_follow_up_count,
    'participants', v_participants,
    'recording', case
      when e.recording_metadata is null then null
      when coalesce(e.recording_metadata ->> 'storagePath', '') = '' then null
      when coalesce(e.recording_metadata ->> 'cloudExpiresAt', '') <> ''
        and (e.recording_metadata ->> 'cloudExpiresAt')::timestamptz <= now() then null
      else jsonb_build_object(
        'durationSeconds', coalesce((e.recording_metadata ->> 'durationSeconds')::integer, 0),
        'mimeType', coalesce(e.recording_metadata ->> 'mimeType', 'audio/mp4'),
        'sharedAudioUrl', coalesce(
          e.recording_metadata ->> 'sharedAudioUrl',
          '/api/encounters/share/' || e.share_token || '/recording'
        ),
        'cloudExpiresAt', e.recording_metadata ->> 'cloudExpiresAt',
        'hasSharedAudio', true
      )
    end
  )
  into result
  from public.encounters e
  where e.id = v_encounter_id;

  return result;
end;
$$;

grant execute on function public.get_shared_encounter(text) to anon, authenticated;

-- Match a newly-signed-up guest's account to the participant row(s) they
-- were captured as on this shared encounter, and to any guest_follow_up
-- rows they left before signing up. Mirrors link_people_connection_from_exchange
-- in 202607261400_visitor_connections.sql. A claiming guest is never added
-- to the host's workspace_memberships - access is only ever through this
-- narrow SECURITY DEFINER projection, same as people_connections.
create or replace function public.claim_guest_encounter_participants(p_share_token text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_user_email text;
  v_encounter_id uuid;
  v_claimed integer := 0;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  select u.id, u.primary_email into v_user_id, v_user_email
  from public.users u
  where u.auth_user_id = auth.uid() and u.status = 'active'
  limit 1;
  if v_user_id is null then raise exception 'application user not provisioned'; end if;

  select id into v_encounter_id from public.encounters
  where share_token = trim(p_share_token) and status = 'shared'
  limit 1;
  if v_encounter_id is null then raise exception 'shared encounter not found'; end if;

  update public.encounter_participants
  set claimed_by_user_id = v_user_id, claimed_at = now(), source = 'guest_claim'
  where encounter_id = v_encounter_id
    and claimed_by_user_id is null
    and v_user_email is not null
    and lower(email) = lower(v_user_email);
  get diagnostics v_claimed = row_count;

  if v_claimed = 0 then
    update public.encounter_participants p
    set claimed_by_user_id = v_user_id, claimed_at = now(), source = 'guest_claim'
    where p.encounter_id = v_encounter_id
      and p.claimed_by_user_id is null
      and (select count(*) from public.encounter_participants where encounter_id = v_encounter_id) = 1;
    get diagnostics v_claimed = row_count;
  end if;

  update public.encounter_guest_follow_ups gfu
  set claimed_by_user_id = v_user_id, claimed_at = now()
  from public.encounter_participants p
  where gfu.encounter_id = v_encounter_id
    and gfu.claimed_by_user_id is null
    and (
      (gfu.participant_id = p.id and p.claimed_by_user_id = v_user_id)
      or (gfu.participant_id is null and v_user_email is not null and lower(gfu.guest_email) = lower(v_user_email))
    );

  return v_claimed;
end;
$$;

revoke all on function public.claim_guest_encounter_participants(text) from public;
grant execute on function public.claim_guest_encounter_participants(text) to authenticated;

-- Lets a claimed guest see their own owner:"guest" actions across encounters
-- they've been matched to, without workspace membership. Mirrors
-- list_my_people_connections in 202607261400_visitor_connections.sql.
create or replace function public.list_my_claimed_encounter_actions()
returns setof jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'encounterId', e.id,
    'encounterTitle', e.title,
    'shareToken', e.share_token,
    'participantId', p.id,
    'startedAt', e.started_at,
    'actions', (
      select coalesce(jsonb_agg(action), '[]'::jsonb)
      from jsonb_array_elements(e.actions) as action
      where action ->> 'owner' = 'guest'
        and (action ->> 'participantId') = p.id::text
    )
  )
  from public.encounter_participants p
  join public.encounters e on e.id = p.encounter_id
  where p.claimed_by_user_id = (select id from public.users where auth_user_id = auth.uid())
  order by e.started_at desc;
$$;

revoke all on function public.list_my_claimed_encounter_actions() from public;
grant execute on function public.list_my_claimed_encounter_actions() to authenticated;

commit;
