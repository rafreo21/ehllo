begin;

-- Lets a participant open a shared meeting in the app, using the same pipeline
-- the emailed link already uses.
--
-- The guest web view is driven by a share token: get_shared_encounter builds the
-- payload, and share/[token]/recording streams the audio while enforcing both
-- status = 'shared' and the three day cloud retention window. All of that is
-- correct and already written.
--
-- What was missing is only the way in. A participant with an ehllo account had no
-- token, so a meeting they were part of appeared in their history as a row that
-- did nothing. Rather than build a second payload, a second recording route and a
-- second expiry check - three chances to disagree with the first set - this hands
-- an entitled participant the token they are already allowed to use.
--
-- Entitlement is the same rule the thread draws: your address is on the meeting,
-- either as the person it is with or as a participant. Nothing else changes -
-- an unshared meeting yields no token, and once the recording passes its
-- retention window the existing route refuses it exactly as it does for a guest.
--
-- Returns null rather than raising when there is no entitlement, so a caller can
-- ask without treating "not shared with me" as an error.

create or replace function public.get_share_token_for_participant(p_encounter_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor record;
  v_email text;
  v_token text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  select * into v_actor from public.connection_actor();
  if v_actor.workspace_id is null then raise exception 'workspace not found'; end if;

  v_email := lower(coalesce(trim(v_actor.primary_email), ''));
  if v_email = '' then return null; end if;

  select encounter.share_token
  into v_token
  from public.encounters encounter
  where encounter.id = p_encounter_id
    and encounter.status = 'shared'
    and (
      lower(trim(encounter.person_email)) = v_email
      or exists (
        select 1 from public.encounter_participants participant
        where participant.encounter_id = encounter.id
          and lower(trim(participant.email)) = v_email
      )
    )
  limit 1;

  return v_token;
end;
$$;

revoke all on function public.get_share_token_for_participant(uuid) from public, anon;
grant execute on function public.get_share_token_for_participant(uuid) to authenticated;

commit;
