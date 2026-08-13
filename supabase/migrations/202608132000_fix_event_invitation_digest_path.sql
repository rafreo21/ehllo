begin;

-- pgcrypto is installed in Supabase's extensions schema. The claim function
-- deliberately restricts search_path, so digest must be schema-qualified.
create or replace function public.claim_event_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_user_email text;
  v_invitation public.event_invitations%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  select id, lower(primary_email) into v_user_id, v_user_email
  from public.users
  where auth_user_id = auth.uid() and status = 'active'
  limit 1;
  if v_user_id is null then raise exception 'application user not provisioned'; end if;

  select * into v_invitation
  from public.event_invitations
  where token_hash = encode(extensions.digest(trim(p_token), 'sha256'), 'hex')
    and status <> 'revoked'
    and (expires_at is null or expires_at > now())
  for update;
  if v_invitation.id is null then raise exception 'event invitation not found'; end if;
  if lower(v_invitation.invited_email) <> v_user_email then raise exception 'invitation email does not match'; end if;

  update public.event_invitations
  set claimed_by_user_id = v_user_id, claimed_at = now(), updated_at = now()
  where id = v_invitation.id;

  if v_invitation.status in ('going', 'not_going') then
    insert into public.event_attendance (event_id, user_id, status, updated_at)
    values (v_invitation.event_id, v_user_id, v_invitation.status, now())
    on conflict (event_id, user_id) do update set
      status = excluded.status,
      left_at = null,
      updated_at = now();
  end if;

  return v_invitation.event_id;
end;
$$;

revoke all on function public.claim_event_invitation(text) from public;
grant execute on function public.claim_event_invitation(text) to authenticated;

commit;
