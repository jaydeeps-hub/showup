-- Showup v2, step 4: let administrators choose between "fitness places only" and "any place"
-- when searching for a gym.
--
-- Rules enforced HERE, in the database (hiding a button in the app is not security):
--   * Every profile has a mode; new users start on 'fitness_only'.
--   * Regular users can read their mode but can never change it.
--   * Only a user whose profile has is_admin = true can change THEIR OWN mode, and only
--     through set_place_search_mode(), which checks is_admin itself.
--   * is_admin itself is still not writable by app users (unchanged from step 2).
--   * If a user's admin rights are removed, their mode is treated as 'fitness_only' again
--     by effective_place_search_mode(), whatever value was stored earlier.

-- ---------------------------------------------------------------------------
-- The setting
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column place_search_mode text not null default 'fitness_only',
  add constraint profiles_place_search_mode_valid
    check (place_search_mode in ('fitness_only', 'any_place'));

comment on column public.profiles.place_search_mode is
  'fitness_only (default) or any_place. Only administrators can set any_place, via set_place_search_mode().';

-- ---------------------------------------------------------------------------
-- Keep the new column read-only for app users.
-- profiles already has: GRANT SELECT (all columns) and GRANT UPDATE only on
-- (first_name, last_name, date_of_birth). The new column is therefore readable (so the app
-- can show it) but NOT updatable by anyone using the browser API. Nothing to grant.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- The only way to change the setting.
--   SECURITY DEFINER: runs with the owner's rights, because app users have no UPDATE right on
--   the column. It therefore must do its own checks, below, and must never trust the caller.
-- ---------------------------------------------------------------------------
create or replace function public.set_place_search_mode(new_mode text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_is_admin boolean;
begin
  if caller is null then
    raise exception 'You must be signed in.' using errcode = '28000';
  end if;

  if new_mode is null or new_mode not in ('fitness_only', 'any_place') then
    raise exception 'Invalid place search mode.' using errcode = '22023';
  end if;

  select is_admin into caller_is_admin from public.profiles where id = caller;

  -- Anyone may switch to the safe, restrictive mode. Only administrators may widen it.
  if new_mode = 'any_place' and coalesce(caller_is_admin, false) is not true then
    raise exception 'Only administrators can search any place.' using errcode = '42501';
  end if;

  update public.profiles set place_search_mode = new_mode where id = caller;
  return new_mode;
end;
$$;

-- Callable by signed-in users only (the function itself then checks is_admin). Not by visitors.
revoke all on function public.set_place_search_mode(text) from public, anon, authenticated;
grant execute on function public.set_place_search_mode(text) to authenticated;

-- ---------------------------------------------------------------------------
-- The mode that actually applies. A stored 'any_place' only counts while the user is still an
-- administrator, so removing someone's admin rights immediately restricts them again.
-- The app reads this instead of trusting the raw column.
-- ---------------------------------------------------------------------------
create or replace function public.effective_place_search_mode()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p.is_admin and p.place_search_mode = 'any_place' then 'any_place'
    else 'fitness_only'
  end
  from public.profiles p
  where p.id = auth.uid()
$$;

revoke all on function public.effective_place_search_mode() from public, anon, authenticated;
grant execute on function public.effective_place_search_mode() to authenticated;
