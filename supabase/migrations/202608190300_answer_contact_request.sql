begin;

-- Answering a contact request.
--
-- Requests could be made, recorded and notified, and then nothing: the person asked
-- had no way to say yes or no. The row sat 'pending' forever and the requester was
-- left unable to tell "they haven't seen it" from "they'd rather not".
--
-- The row lives in the *requester's* workspace, so the person being asked cannot
-- write it under row-level security. This is security definer for that reason and
-- matches on their own verified address, so it can only ever answer a request
-- actually addressed to them.
alter table public.contact_field_requests
  add column if not exists answered_at timestamptz,
  add column if not exists shared_value text;

comment on column public.contact_field_requests.shared_value is
  'What they chose to share. Null when declined - a decline must not leak the value anyway.';

create or replace function public.answer_contact_request(
  p_id uuid,
  p_share boolean,
  p_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor record;
  v_email text;
  v_row record;
  v_value text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  select * into v_actor from public.connection_actor();
  if v_actor.workspace_id is null then raise exception 'workspace not found'; end if;

  v_email := lower(coalesce(trim(v_actor.primary_email), ''));
  if v_email = '' then raise exception 'no address on this account'; end if;

  select * into v_row
  from public.contact_field_requests
  where id = p_id
    and lower(trim(target_email)) = v_email
    and status = 'pending'
  limit 1;

  -- The same answer whether it is missing, already answered, or somebody else's:
  -- a caller must not be able to probe for requests that are not theirs.
  if v_row.id is null then raise exception 'request_not_found'; end if;

  v_value := nullif(trim(coalesce(p_value, '')), '');
  if p_share and v_value is null then raise exception 'value_required'; end if;

  update public.contact_field_requests
     set status = case when p_share then 'shared' else 'declined' end,
         shared_value = case when p_share then v_value else null end,
         answered_at = now()
   where id = p_id;

  -- Returned so the caller can tell the requester. They are the one waiting, and
  -- nothing they can see changed.
  return jsonb_build_object(
    'id', v_row.id,
    'shared', p_share,
    'value', case when p_share then v_value else null end,
    'fieldType', v_row.field_type,
    'requesterUserId', v_row.requester_user_id,
    'requesterWorkspaceId', v_row.workspace_id,
    'answeredByName', coalesce(nullif(trim(v_actor.display_name), ''), split_part(v_email, '@', 1))
  );
end;
$$;

revoke all on function public.answer_contact_request(uuid, boolean, text) from public, anon;
grant execute on function public.answer_contact_request(uuid, boolean, text) to authenticated;

commit;
