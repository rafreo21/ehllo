begin;

-- pair_key arrived in 202608180700 and is only written by record_connection, so
-- rows that predate it stay null until their two people happen to interact
-- again. Shared history keys off pair_key, so those connections show the meeting
-- and nothing else, indefinitely, for no better reason than when they were
-- written.
--
-- The counterpart workspace is recoverable for both row shapes:
--   card-backed  the card names its own workspace
--   card-less    the person's address names their account, which names theirs
--
-- Rows whose counterpart is not an ehllo account stay null, correctly: there is
-- no second side to pair with, which is exactly what null means here.

update public.people_connections pc
set pair_key = least(pc.workspace_id::text, c.workspace_id::text)
            || ':' || greatest(pc.workspace_id::text, c.workspace_id::text)
from public.cards c
where pc.pair_key is null
  and pc.card_id = c.id
  and c.workspace_id <> pc.workspace_id;

-- Matched on the account email rather than the card, for connections recorded
-- before the other person had published anything. Under DEC-007 a user has one
-- workspace, so the join cannot pick the wrong one; revisit alongside that
-- decision if a user can ever hold several.
update public.people_connections pc
set pair_key = least(pc.workspace_id::text, w.id::text)
            || ':' || greatest(pc.workspace_id::text, w.id::text)
from public.users u
join public.workspace_memberships m on m.user_id = u.id and m.status = 'active'
join public.workspaces w on w.id = m.workspace_id and w.status = 'active'
where pc.pair_key is null
  and pc.card_id is null
  and trim(pc.person_email) <> ''
  and u.status = 'active'
  and lower(trim(u.primary_email)) = lower(trim(pc.person_email))
  and w.id <> pc.workspace_id;

commit;
