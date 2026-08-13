begin;

-- Mobile's "How will you use ehllo?" step only offers a personal workspace
-- today (team leads to the business web app, not built yet), so it has no
-- display name to collect. complete_user_onboarding() requires one; this is
-- a minimal counterpart for that flow.
create or replace function public.complete_use_case_selection()
returns table (user_id uuid, workspace_id uuid, onboarding_status text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id uuid;
  v_workspace_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));

  update public.users
  set onboarding_status = 'completed', updated_at = now()
  where auth_user_id = auth.uid()
  returning id into v_user_id;

  if v_user_id is null then raise exception 'application user not provisioned'; end if;

  select w.id into v_workspace_id
  from public.workspaces w
  join public.workspace_memberships m on m.workspace_id = w.id
  where m.user_id = v_user_id and m.status = 'active';

  insert into public.domain_events(event_name, actor_type, actor_id, workspace_id, object_type, object_id, correlation_id)
  values ('UserOnboardingCompleted', 'User', v_user_id, v_workspace_id, 'User', v_user_id, v_user_id)
  on conflict do nothing;

  return query select v_user_id, v_workspace_id, 'completed'::text;
end;
$$;

revoke all on function public.complete_use_case_selection() from public, anon;
grant execute on function public.complete_use_case_selection() to authenticated;

commit;
