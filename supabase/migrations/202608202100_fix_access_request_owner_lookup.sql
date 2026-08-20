begin;

-- request_encounter_access ordered the owning workspace's members by m.created_at, and
-- workspace_memberships has no such column - it records joined_at. So every request failed
-- with "column m.created_at does not exist" and the app said "we couldn't send that request".
--
-- My own mistake, and the same one I have been finding all day in other people's code:
-- assuming a column exists rather than looking. The only reason it took a minute to find
-- instead of an afternoon is that this route logs the database error rather than swallowing
-- it, which is worth more than the fix.
--
-- Also prefers the owner role now instead of relying on ordering alone. Every workspace here
-- has exactly one active owner, so this is the person who decides whether to share.
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

  if v_encounter.status = 'shared' then
    return jsonb_build_object('alreadyShared', true);
  end if;

  if v_encounter.workspace_id = v_actor.workspace_id then
    raise exception 'encounter_is_yours';
  end if;

  -- Entitlement mirrors get_connection_thread: a connection with the owning workspace, which
  -- is already what lets the caller see this meeting listed at all.
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
  where m.workspace_id = v_encounter.workspace_id
    and m.status = 'active'
  order by (m.role = 'owner') desc, m.joined_at
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
    'alreadyRequested', v_already,
    'ownerUserId', v_owner_user_id,
    'ownerWorkspaceId', v_encounter.workspace_id,
    'encounterTitle', coalesce(nullif(trim(v_encounter.title), ''), 'a meeting'),
    'requesterName', coalesce(nullif(trim(v_actor.display_name), ''), split_part(coalesce(v_actor.primary_email, ''), '@', 1))
  );
end;
$$;

commit;
