begin;

-- Asking the host for access to a meeting, instead of hitting a wall.
--
-- A meeting the host has not shared correctly answers "not available" - and then offers
-- nothing. The other person can see in their shared history that the meeting happened,
-- because they were there, and has no way to ask for it. So a true answer reads as a broken
-- feature, and the only route forward is to message the person outside the app.
--
-- The notification type list is widened in the same migration as the code that writes these
-- types. Adding a value in application code while the table still refuses it is exactly how
-- answering a contact request came to fail silently for two days.
alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check check (type = any (array[
    'review_ready',
    'follow_up_due',
    'follow_up_overdue',
    'shared_meeting_update',
    'connection_added',
    'keep_in_touch',
    'contact_request',
    'follow_up_completed',
    'access_request',
    'access_granted'
  ]));

create table if not exists public.encounter_access_requests (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references public.encounters(id) on delete cascade,
  requester_user_id uuid not null references public.users(id) on delete cascade,
  requester_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'granted')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  -- One standing request per person per meeting. Asking twice is the same ask, and a table
  -- of duplicates would turn a nudge into a way to spam somebody's notifications.
  unique (encounter_id, requester_user_id)
);

comment on table public.encounter_access_requests is
  'Someone asking the host to share a meeting they were part of. Resolved to granted when the host shares it; there is deliberately no declined state, because a host who does not want to share simply does not, and recording a refusal would invite asking why.';

create index if not exists encounter_access_requests_encounter_idx
  on public.encounter_access_requests (encounter_id, status);

alter table public.encounter_access_requests enable row level security;

-- Readable by the person who asked, and by anyone in the workspace that owns the meeting.
-- Written only through the function below, which is where the entitlement check lives.
drop policy if exists encounter_access_requests_select on public.encounter_access_requests;
create policy encounter_access_requests_select on public.encounter_access_requests
  for select using (
    requester_user_id in (select u.id from public.users u where u.auth_user_id = auth.uid())
    or encounter_id in (
      select e.id from public.encounters e
      join public.workspace_memberships m on m.workspace_id = e.workspace_id
      join public.users u on u.id = m.user_id
      where u.auth_user_id = auth.uid() and m.status = 'active'
    )
  );

/**
 * Records a request, and returns who to tell.
 *
 * Entitlement mirrors get_connection_thread exactly: the caller may ask about a meeting
 * belonging to a workspace they hold a connection to, because that is already the rule that
 * lets them see the meeting listed at all. Anything looser would let someone probe for
 * meetings between strangers; anything tighter would refuse the very case this exists for,
 * since an unshared meeting has no participant rows to check against.
 */
create or replace function public.request_encounter_access(p_encounter_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor record;
  v_encounter record;
  v_owner_user_id uuid;
  v_already boolean;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  select * into v_actor from public.connection_actor();
  if v_actor.workspace_id is null then raise exception 'workspace not found'; end if;

  select id, workspace_id, title, status into v_encounter
  from public.encounters where id = p_encounter_id;
  if v_encounter.id is null then raise exception 'encounter_not_found'; end if;

  -- Nothing to ask for. Told apart from the not-found case so the app can simply open it
  -- rather than showing a request button for something already available.
  if v_encounter.status = 'shared' then
    return jsonb_build_object('alreadyShared', true);
  end if;

  if v_encounter.workspace_id = v_actor.workspace_id then
    raise exception 'encounter_is_yours';
  end if;

  if not exists (
    select 1 from public.people_connections c
    where c.workspace_id = v_actor.workspace_id
      and c.pair_key is not null
      and v_encounter.workspace_id::text in (
        split_part(c.pair_key, ':', 1),
        split_part(c.pair_key, ':', 2)
      )
  ) then
    raise exception 'encounter_not_found';
  end if;

  select m.user_id into v_owner_user_id
  from public.workspace_memberships m
  where m.workspace_id = v_encounter.workspace_id and m.status = 'active'
  order by m.created_at
  limit 1;
  if v_owner_user_id is null then raise exception 'encounter_not_found'; end if;

  select exists (
    select 1 from public.encounter_access_requests r
    where r.encounter_id = p_encounter_id
      and r.requester_user_id = v_actor.user_id
      and r.status = 'pending'
  ) into v_already;

  insert into public.encounter_access_requests (
    encounter_id, requester_user_id, requester_workspace_id, status
  ) values (p_encounter_id, v_actor.user_id, v_actor.workspace_id, 'pending')
  on conflict (encounter_id, requester_user_id) do update
    set status = 'pending', resolved_at = null;

  return jsonb_build_object(
    'alreadyShared', false,
    -- So the caller can say "already asked" rather than implying a second nudge was sent.
    'alreadyRequested', v_already,
    'ownerUserId', v_owner_user_id,
    'ownerWorkspaceId', v_encounter.workspace_id,
    'encounterTitle', coalesce(nullif(trim(v_encounter.title), ''), 'a meeting'),
    'requesterName', coalesce(nullif(trim(v_actor.display_name), ''), split_part(coalesce(v_actor.primary_email, ''), '@', 1))
  );
end;
$$;

/**
 * Marks every pending request on a meeting granted, and returns who was waiting.
 *
 * Called after the host shares, so the people who asked are told rather than left to keep
 * checking - being ignored and being unread look identical from their side, which is the
 * same silence that made contact requests feel broken.
 */
create or replace function public.resolve_encounter_access_requests(p_encounter_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor record;
  v_encounter record;
  v_waiting jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  select * into v_actor from public.connection_actor();
  select id, workspace_id, title, status into v_encounter
  from public.encounters where id = p_encounter_id;

  -- Only the owning workspace can resolve these, and only once it really is shared.
  if v_encounter.id is null
     or v_encounter.workspace_id <> v_actor.workspace_id
     or v_encounter.status <> 'shared' then
    return jsonb_build_object('granted', jsonb_build_array());
  end if;

  with granted as (
    update public.encounter_access_requests r
    set status = 'granted', resolved_at = now()
    where r.encounter_id = p_encounter_id and r.status = 'pending'
    returning r.requester_user_id, r.requester_workspace_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'userId', g.requester_user_id,
    'workspaceId', g.requester_workspace_id
  )), jsonb_build_array()) into v_waiting from granted g;

  return jsonb_build_object(
    'granted', v_waiting,
    'encounterTitle', coalesce(nullif(trim(v_encounter.title), ''), 'a meeting'),
    'ownerName', coalesce(nullif(trim(v_actor.display_name), ''), 'Someone')
  );
end;
$$;

revoke all on function public.request_encounter_access(uuid) from public, anon;
revoke all on function public.resolve_encounter_access_requests(uuid) from public, anon;
grant execute on function public.request_encounter_access(uuid) to authenticated;
grant execute on function public.resolve_encounter_access_requests(uuid) to authenticated;

commit;
