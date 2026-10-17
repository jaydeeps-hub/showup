-- Showup v2, step 2: create a profile automatically for every Auth user.
--
-- When Supabase Auth inserts a row into auth.users (the first time someone signs in with
-- Google), this trigger inserts the matching row into public.profiles in the same
-- transaction, so a signed-in user always has a profile.
--
-- Deliberately minimal:
--   * It only INSERTs one row into our own table. No network calls, so sign-in can never
--     depend on an outside service.
--   * It copies only the first and last name that Google supplies (given_name and
--     family_name). They are trimmed and cut to the column's 100-character limit so the
--     insert cannot violate a constraint and block sign-in.
--   * It NEVER reads is_admin (or role, or anything else) from user metadata. Metadata is
--     user-influenced input. is_admin always takes the column default, false.
--   * ON CONFLICT DO NOTHING makes it harmless if a profile already exists.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer          -- runs with the owner's rights, because the new user has no INSERT right
set search_path = ''      -- stops a malicious schema from shadowing the names used below
as $$
begin
  insert into public.profiles (id, first_name, last_name)
  values (
    new.id,
    left(nullif(btrim(new.raw_user_meta_data ->> 'given_name'), ''), 100),
    left(nullif(btrim(new.raw_user_meta_data ->> 'family_name'), ''), 100)
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- This function is only meant to be run by the trigger, never called from the app.
revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Give a profile to anyone who signed in BEFORE this migration existed.
insert into public.profiles (id, first_name, last_name)
select
  id,
  left(nullif(btrim(raw_user_meta_data ->> 'given_name'), ''), 100),
  left(nullif(btrim(raw_user_meta_data ->> 'family_name'), ''), 100)
from auth.users
on conflict (id) do nothing;
