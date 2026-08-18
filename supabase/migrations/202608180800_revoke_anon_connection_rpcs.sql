begin;

-- The four connection RPCs are SECURITY DEFINER and were executable by anon.
--
-- Not exploitable today: each one raises on `auth.uid() is null` before doing
-- anything, and the scan function regained that guard in 202608180500. But the
-- guard is the only thing standing between an unauthenticated caller and a
-- definer function that writes connections and notifications, and "the body
-- happens to check" is a weaker position than "the grant does not exist".
-- 202608180200 is the argument for that: it dropped exactly this guard while
-- rewriting the function, and nothing failed at deploy time.
--
-- Every caller holds a session - app/api/people/connections, auth/callback,
-- api/onboarding/visitor, auth/AuthForm and the mobile auth context all use
-- session-bearing clients, so they act as `authenticated`, never `anon`.
-- Checked each before revoking.

revoke all on function public.link_people_connection_from_scan(text, uuid, text, text, timestamptz) from anon, public;
revoke all on function public.link_people_connection_from_share_token(text) from anon, public;
revoke all on function public.link_people_connection_from_exchange(uuid) from anon, public;
revoke all on function public.link_people_connections_for_email() from anon, public;

grant execute on function public.link_people_connection_from_scan(text, uuid, text, text, timestamptz) to authenticated;
grant execute on function public.link_people_connection_from_share_token(text) to authenticated;
grant execute on function public.link_people_connection_from_exchange(uuid) to authenticated;
grant execute on function public.link_people_connections_for_email() to authenticated;

commit;
