begin;

-- Two overloads of link_people_connection_from_scan exist: a one-argument
-- version from before event context was added, and the five-argument version
-- every caller actually uses. PostgREST cannot resolve a call that passes only
-- p_slug, because both match once defaults are considered - it answers
-- PGRST203 rather than picking one.
--
-- Nothing calls the one-argument form; the API route has always sent all five.
-- Removing it means a future caller that omits the event fields gets the
-- function instead of an overload-resolution error.
drop function if exists public.link_people_connection_from_scan(text);

commit;
