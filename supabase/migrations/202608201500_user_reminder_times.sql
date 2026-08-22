begin;

-- The reminder times you pick, on the account rather than only on the device.
--
-- They have always lived in AsyncStorage on the phone, which is the right place for the
-- notifications the phone schedules for itself and the wrong place for the one digest the
-- server sends: the server had no idea what you had chosen, so it sent at a fixed hour to
-- everybody and you could be reminded at an hour you had explicitly not picked.
--
-- A column rather than a key inside notification_preferences, because the settings route
-- rewrites that blob wholesale from the known notification types - anything else stored in
-- there would be quietly wiped on the next toggle.
--
-- Null means "not chosen", which is deliberately different from an empty array: null takes
-- the default and keeps the digest arriving for accounts that predate this, where an empty
-- array would read as a choice to be reminded at no time at all.
alter table public.users
  add column if not exists reminder_times text[];

comment on column public.users.reminder_times is
  'Chosen daily reminder times as HH:MM strings, validated against the offered set by the API. Null means not chosen - the default applies. Read together with time_zone to decide whether the digest is due in the user''s own day rather than the server''s.';

commit;
