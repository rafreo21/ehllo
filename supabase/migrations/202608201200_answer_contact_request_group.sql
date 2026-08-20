begin;

-- Answering every ask from one person for one detail, in one statement.
--
-- answer_contact_request answers exactly one row, which was right when the list showed
-- one row per request. Grouped by person, a single answer now has to close every ask in
-- the group - somebody who asks for your Instagram after every meeting can easily have
-- fifteen pending, and the API loaded up to five hundred. Looping the singular function
-- meant one round trip per ask, so the pathological case was five hundred sequential
-- calls inside one request: slow at fifteen, a timeout at five hundred.
--
-- Same guarantees as the singular version, and for the same reason: the rows live in the
-- *requester's* workspace, so the person being asked cannot write them under row-level
-- security. Security definer, matching on their own verified address, so it can only
-- ever answer requests actually addressed to them - passing somebody else's ids updates
-- nothing rather than raising, because the match is part of the where clause.
create or replace function public.answer_contact_requests(
  p_ids uuid[],
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
  v_answered integer;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_ids is null or array_length(p_ids, 1) is null then raise exception 'request_not_found'; end if;

  select * into v_actor from public.connection_actor();
  if v_actor.workspace_id is null then raise exception 'workspace not found'; end if;

  v_email := lower(coalesce(trim(v_actor.primary_email), ''));
  if v_email = '' then raise exception 'no address on this account'; end if;

  -- The newest of the caller's own pending asks among these ids. It supplies the field
  -- type and the requester for the notification the API sends, which is deliberately
  -- one notification: telling somebody fifteen times that you shared your Instagram is
  -- not fifteen answers, it is spam.
  select * into v_row
  from public.contact_field_requests
  where id = any(p_ids)
    and lower(trim(target_email)) = v_email
    and status = 'pending'
  order by created_at desc
  limit 1;

  -- The same answer whether they are missing, already answered, or somebody else's:
  -- a caller must not be able to probe for requests that are not theirs.
  if v_row.id is null then raise exception 'request_not_found'; end if;

  v_value := nullif(trim(coalesce(p_value, '')), '');
  if p_share and v_value is null then raise exception 'value_required'; end if;

  -- Every ask in the group, and only ones addressed to the caller. Restricted to the
  -- same requester and field type as the row above so a caller cannot bundle unrelated
  -- requests into one answer and hand a phone number to somebody who asked for an email.
  update public.contact_field_requests
     set status = case when p_share then 'shared' else 'declined' end,
         shared_value = case when p_share then v_value else null end,
         answered_at = now()
   where id = any(p_ids)
     and lower(trim(target_email)) = v_email
     and status = 'pending'
     and field_type = v_row.field_type
     and requester_user_id is not distinct from v_row.requester_user_id;

  get diagnostics v_answered = row_count;

  return jsonb_build_object(
    'id', v_row.id,
    'answered', v_answered,
    'shared', p_share,
    'value', case when p_share then v_value else null end,
    'fieldType', v_row.field_type,
    'requesterUserId', v_row.requester_user_id,
    'requesterWorkspaceId', v_row.workspace_id,
    'answeredByName', coalesce(nullif(trim(v_actor.display_name), ''), split_part(v_email, '@', 1))
  );
end;
$$;

revoke all on function public.answer_contact_requests(uuid[], boolean, text) from public, anon;
grant execute on function public.answer_contact_requests(uuid[], boolean, text) to authenticated;

commit;
