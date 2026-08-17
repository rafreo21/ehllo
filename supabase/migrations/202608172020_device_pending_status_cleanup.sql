begin;

revoke all on public.device_pending_status from anon;
grant select, insert, update, delete on public.device_pending_status to authenticated;

drop policy if exists "Users manage their own device pending status"
  on public.device_pending_status;

create policy "Users manage their own device pending status"
  on public.device_pending_status
  for all
  to authenticated
  using (
    user_id in (
      select id from public.users where auth_user_id = (select auth.uid())
    )
  )
  with check (
    user_id in (
      select id from public.users where auth_user_id = (select auth.uid())
    )
  );

-- Status pings are ephemeral. Remove zero-count and abandoned install rows;
-- active devices publish their current count again whenever they are opened.
delete from public.device_pending_status
where pending_count <= 0
   or updated_at < now() - interval '1 hour';

commit;
