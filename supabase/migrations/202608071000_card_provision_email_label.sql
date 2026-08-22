begin;

-- Prefills the auto-provisioned card properly on first sign-in:
--   - also reads user_metadata.display_name (guest-provisioning sets this
--     key; the existing full_name/name checks cover normal OTP signups)
--   - seeds the card's email contact method from the account's own email,
--     so a fresh card isn't missing the one contact detail we already know
--   - labels the card "Primary Card" instead of leaving label blank, since
--     that's clearer than an empty string in the card list before the user
--     renames it themselves
create or replace function public.provision_personal_workspace()
returns table (user_id uuid, workspace_id uuid, onboarding_status text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_auth_user_id uuid := auth.uid();
  v_user_id uuid;
  v_workspace_id uuid;
  v_email text;
  v_metadata_name text;
  v_card_name text;
  v_card_slug text;
  v_card_id uuid;
  v_user_created boolean := false;
  v_workspace_created boolean := false;
begin
  if v_auth_user_id is null then raise exception 'authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_auth_user_id::text, 0));
  select coalesce(auth.jwt() ->> 'email', '') into v_email;
  select nullif(trim(coalesce(
    auth.jwt() -> 'user_metadata' ->> 'full_name',
    auth.jwt() -> 'user_metadata' ->> 'name',
    auth.jwt() -> 'user_metadata' ->> 'display_name',
    ''
  )), '') into v_metadata_name;

  insert into public.users(auth_user_id, primary_email, display_name)
  values (v_auth_user_id, v_email, v_metadata_name)
  on conflict (auth_user_id) do update set
    primary_email = excluded.primary_email,
    updated_at = now()
  returning id, (xmax = 0) into v_user_id, v_user_created;

  -- workspaces only has a partial unique index on owner_user_id where
  -- type = 'personal' (added by team_workspaces so a user can also own team
  -- workspaces) so the conflict target and insert must say so explicitly.
  insert into public.workspaces(name, owner_user_id, type)
  values ('My workspace', v_user_id, 'personal')
  on conflict (owner_user_id) where (type = 'personal') do update set updated_at = public.workspaces.updated_at
  returning id, (xmax = 0) into v_workspace_id, v_workspace_created;

  if v_workspace_id is null then
    select w.id into v_workspace_id
    from public.workspaces w
    where w.owner_user_id = v_user_id and w.type = 'personal';
  end if;

  insert into public.workspace_memberships(workspace_id, user_id, role, membership_kind)
  values (v_workspace_id, v_user_id, 'owner', 'personal')
  on conflict (workspace_id, user_id) do nothing;

  if v_workspace_created then
    v_card_name := coalesce(
      v_metadata_name,
      nullif(case when length(split_part(v_email, '@', 1)) >= 2 then split_part(v_email, '@', 1) else null end, ''),
      'My card'
    );
    v_card_slug := 'card-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
    insert into public.cards (workspace_id, slug, full_name, label, status)
    values (v_workspace_id, v_card_slug, v_card_name, 'Primary Card', 'draft')
    returning id into v_card_id;

    if v_email <> '' then
      insert into public.card_methods (card_id, method_type, value, sort_order)
      values (v_card_id, 'email', v_email, 0);
    end if;
  end if;

  if v_user_created then
    insert into public.domain_events(event_name, actor_type, actor_id, workspace_id, object_type, object_id, correlation_id)
    values ('UserSignedUp', 'User', v_user_id, v_workspace_id, 'User', v_user_id, v_user_id)
    on conflict do nothing;
  end if;
  if v_workspace_created then
    insert into public.domain_events(event_name, actor_type, actor_id, workspace_id, object_type, object_id, correlation_id)
    values ('PersonalWorkspaceProvisioned', 'System', v_user_id, v_workspace_id, 'Workspace', v_workspace_id, v_workspace_id)
    on conflict do nothing;
  end if;

  return query select v_user_id, v_workspace_id, u.onboarding_status from public.users u where u.id = v_user_id;
end;
$$;

commit;
