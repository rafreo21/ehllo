begin;

-- Follow-ups somebody else recorded against your address, returned to you.
--
-- GET /api/follow-ups reads encounters in the caller's own workspace, so a
-- commitment made to you during somebody else's capture existed, was visible to
-- them, and never reached you. You could see it sitting in the shared history and
-- do nothing with it, which is the wrong way round: history is a record of what
-- happened, a follow-up is work.
--
-- Scoped by address, exactly like the thread: a follow-up reaches the person it
-- names and nobody else. No workspace fallback, because that would hand someone a
-- commitment that was never theirs.
--
-- Deliberately narrow on content. The note is the commitment itself, which the
-- other party is the subject of and needs to read. Everything else about the
-- encounter stays with its author: no transcript, no private notes, and the
-- summary only once that meeting has actually been shared - the same line
-- get_connection_thread draws, and DEC-028's distinction between reviewing and
-- approving.

create or replace function public.get_follow_ups_addressed_to_me()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor record;
  v_email text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  select * into v_actor from public.connection_actor();
  if v_actor.workspace_id is null then raise exception 'workspace not found'; end if;

  v_email := lower(coalesce(trim(v_actor.primary_email), ''));
  if v_email = '' then return '[]'::jsonb; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', guest.id,
      'encounterId', encounter.id,
      'note', guest.note,
      'channel', guest.channel,
      'dueAt', guest.due_at,
      'committedAt', guest.committed_at,
      'createdAt', guest.created_at,
      -- Who owes it to you, so the row can say whose commitment this is.
      'fromName', coalesce(nullif(trim(owner.display_name), ''), split_part(coalesce(owner.primary_email,''), '@', 1)),
      'fromEmail', coalesce(owner.primary_email, ''),
      'meetingTitle', encounter.title,
      'meetingAt', encounter.started_at,
      'eventTitle', coalesce(event.title, ''),
      -- Only once shared. Before that the other party has approved nothing.
      'summary', case when encounter.status = 'shared' then encounter.shared_summary else '' end
    ) order by coalesce(guest.due_at, guest.created_at) asc)
    from public.encounter_guest_follow_ups guest
    join public.encounters encounter on encounter.id = guest.encounter_id
    left join public.events event on event.id = encounter.event_id
    left join public.users owner on owner.id = encounter.created_by_user_id
    where lower(trim(guest.guest_email)) = v_email
      and encounter.status <> 'archived'
      -- Their capture, not yours. Your own are already returned by the ordinary
      -- follow-ups query, and returning them twice would double the list.
      and encounter.workspace_id <> v_actor.workspace_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_follow_ups_addressed_to_me() from public, anon;
grant execute on function public.get_follow_ups_addressed_to_me() to authenticated;

commit;
