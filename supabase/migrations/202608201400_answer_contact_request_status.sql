begin;

-- Answering a contact request never once worked.
--
-- Both answer functions set status to 'shared' or 'declined'. The table has allowed
-- 'pending', 'fulfilled' or 'dismissed' since it was created in July, so every single
-- answer failed on the check constraint and came back as "We couldn't answer this
-- request" - on the phone and on the web, from the day the feature shipped. The activity
-- log recorded it as working. It never was.
--
-- The wrong words were borrowed from `encounters`, which really does use 'shared', and
-- nothing here ever ran to contradict them.
--
-- Corrected to the vocabulary this table already has, rather than widening the constraint
-- to accept synonyms: 'fulfilled' and 'shared' would mean exactly the same thing, and the
-- business contacts page already writes 'dismissed'. Two vocabularies for one state is
-- how they drift.
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

  if v_row.id is null then raise exception 'request_not_found'; end if;

  v_value := nullif(trim(coalesce(p_value, '')), '');
  if p_share and v_value is null then raise exception 'value_required'; end if;

  update public.contact_field_requests
     set status = case when p_share then 'fulfilled' else 'dismissed' end,
         shared_value = case when p_share then v_value else null end,
         answered_at = now()
   where id = p_id;

  return jsonb_build_object(
    'id', v_row.id,
    'answered', 1,
    'shared', p_share,
    'value', case when p_share then v_value else null end,
    'fieldType', v_row.field_type,
    'requesterUserId', v_row.requester_user_id,
    'requesterWorkspaceId', v_row.workspace_id,
    'answeredByName', coalesce(nullif(trim(v_actor.display_name), ''), split_part(v_email, '@', 1))
  );
end;
$$;

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

  select * into v_row
  from public.contact_field_requests
  where id = any(p_ids)
    and lower(trim(target_email)) = v_email
    and status = 'pending'
  order by created_at desc
  limit 1;

  if v_row.id is null then raise exception 'request_not_found'; end if;

  v_value := nullif(trim(coalesce(p_value, '')), '');
  if p_share and v_value is null then raise exception 'value_required'; end if;

  update public.contact_field_requests
     set status = case when p_share then 'fulfilled' else 'dismissed' end,
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

commit;
