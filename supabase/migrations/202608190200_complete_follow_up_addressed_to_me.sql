begin;

-- Let the person a follow-up names mark it done.
--
-- A commitment recorded during someone else's capture reaches the person it names -
-- get_follow_ups_addressed_to_me returns it - but they could only ever read it. The
-- row lives in the author's workspace, so row-level security refuses their write,
-- and the client blocks it up front rather than showing them a permission error.
--
-- That leaves the wrong person holding the only switch: A records "B will send the
-- deck", B sends the deck, and only A can say so. This gives B the switch for their
-- own commitment and nobody else's.
alter table public.encounter_guest_follow_ups
  add column if not exists completed_at timestamptz,
  add column if not exists completed_by_user_id uuid references public.users(id);

comment on column public.encounter_guest_follow_ups.completed_at is
  'When the person this names marked it done. Distinct from committed_at, which is when they agreed to it.';

-- Security definer because the row is deliberately outside the caller's workspace.
-- That makes the ownership check this function''s own responsibility: it matches on
-- the caller''s verified address and nothing else, so it can only ever complete a
-- commitment actually addressed to them.
create or replace function public.complete_follow_up_addressed_to_me(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor record;
  v_email text;
  v_row record;
  v_owner_id uuid;
  v_owner_workspace uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  select * into v_actor from public.connection_actor();
  if v_actor.workspace_id is null then raise exception 'workspace not found'; end if;

  v_email := lower(coalesce(trim(v_actor.primary_email), ''));
  if v_email = '' then raise exception 'no address on this account'; end if;

  select guest.*, encounter.workspace_id as encounter_workspace, encounter.created_by_user_id
    into v_row
  from public.encounter_guest_follow_ups guest
  join public.encounters encounter on encounter.id = guest.encounter_id
  where guest.id = p_id
    and lower(trim(guest.guest_email)) = v_email
  limit 1;

  -- Deliberately the same answer whether the row is missing or belongs to somebody
  -- else: a caller must not be able to probe for follow-ups that are not theirs.
  if v_row.id is null then raise exception 'follow_up_not_found'; end if;

  update public.encounter_guest_follow_ups
     set completed_at = coalesce(completed_at, now()),
         completed_by_user_id = coalesce(completed_by_user_id, v_actor.user_id),
         updated_at = now()
   where id = p_id;

  select m.user_id, m.workspace_id into v_owner_id, v_owner_workspace
  from public.workspace_memberships m
  where m.workspace_id = v_row.encounter_workspace
  order by m.created_at asc
  limit 1;

  -- Returned so the caller can tell the author, who is the whole point: they are the
  -- one waiting on it and cannot see this row change.
  return jsonb_build_object(
    'id', v_row.id,
    'note', v_row.note,
    'encounterId', v_row.encounter_id,
    'ownerUserId', coalesce(v_row.created_by_user_id, v_owner_id),
    'ownerWorkspaceId', v_owner_workspace,
    'completedByName', coalesce(nullif(trim(v_actor.display_name), ''), split_part(v_email, '@', 1))
  );
end;
$$;

revoke all on function public.complete_follow_up_addressed_to_me(uuid) from public, anon;
grant execute on function public.complete_follow_up_addressed_to_me(uuid) to authenticated;

commit;
