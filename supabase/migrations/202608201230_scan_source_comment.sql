begin;

-- Corrects what this column promises.
--
-- It said "first touch wins", which was read as "only ever written when the connection
-- is created". That is how the API enforced it, and the result was that a row which was
-- null could never stop being null: the only rows still null are ones created before this
-- column existed, or by an app build that sent no source, and every one of them is a
-- connection that already exists - so the single path that could have filled them in was
-- the path being skipped. Two rows sat null and unfillable.
--
-- The rule now is the narrower and actually useful one: a value is never overwritten, but
-- a null can still be filled by a later scan. Which means a filled-in value should be
-- read as the earliest surface we have observed, not as proof of the first touch.
comment on column public.people_connections.scan_source is
  'Which surface the connection was made through - camera, link, nfc, web. Written at creation for new connections. Never overwritten once set, so it keeps answering "where did we meet" rather than "where did I last scan them" - but a null can still be filled by a later scan, because otherwise rows predating this column stay blank forever. A value filled that way means "the earliest surface we have observed". Null where no path reported one.';

commit;
