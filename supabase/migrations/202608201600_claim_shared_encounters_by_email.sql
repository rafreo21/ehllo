begin;

-- Sharing a meeting with somebody who already has an account never reached them.
--
-- A shared meeting is attached to its guest by an encounter_participants row carrying their
-- email, and that row is only tied to an actual account by claim_guest_encounter_participants
-- - which is called in exactly one place: visitor onboarding, the path a brand new account
-- takes when it signs up from a share link.
--
-- So an existing account was never claimed. The row sat with claimed_by_user_id null forever,
-- the meeting was invisible to the person it was shared with, and the app truthfully reported
-- "this meeting is not available" - which reads as a bug in sharing rather than as a link
-- that was never completed. Every share between two people who both already use ehllo failed
-- this way, which is the only case that matters once testing moves past one account.
--
-- This claims by verified address instead of by share token, so it can run on sign-in when
-- there is no token to hand. Same alignment rule as the token version: the caller's own
-- primary_email, matched case-insensitively, and only rows nobody has claimed.
create or replace function public.claim_my_encounter_participants()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_user_email text;
  v_claimed integer := 0;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  select u.id, lower(trim(u.primary_email)) into v_user_id, v_user_email
  from public.users u
  where u.auth_user_id = auth.uid() and u.status = 'active'
  limit 1;

  -- Not an error. This runs on every sign-in, including the one during provisioning where
  -- the application user does not exist yet, and a raise there would surface as a failed
  -- sign-in for something that is nobody's problem.
  if v_user_id is null or coalesce(v_user_email, '') = '' then return 0; end if;

  update public.encounter_participants p
  set claimed_by_user_id = v_user_id,
      claimed_at = now(),
      source = 'guest_claim'
  from public.encounters e
  where e.id = p.encounter_id
    and p.claimed_by_user_id is null
    and lower(trim(p.email)) = v_user_email
    -- Only meetings actually shared. A draft naming your address is not yours to see, and
    -- claiming one would expose a record before its owner chose to send it.
    and e.status = 'shared'
    -- Never your own workspace's meetings: you can already see those, and claiming yourself
    -- as a guest on your own record would put it in your list twice.
    and e.workspace_id <> (
      select m.workspace_id from public.workspace_memberships m
      where m.user_id = v_user_id and m.status = 'active'
      limit 1
    );

  get diagnostics v_claimed = row_count;
  return v_claimed;
end;
$$;

revoke all on function public.claim_my_encounter_participants() from public, anon;
grant execute on function public.claim_my_encounter_participants() to authenticated;

commit;
