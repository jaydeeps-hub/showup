-- Showup v2, step 2: lock the tables down.
--
-- Two layers protect the data, and BOTH are needed:
--
--   1. Privileges (GRANT / REVOKE) decide which tables and COLUMNS a role may touch at all.
--      This is what stops a user changing profiles.is_admin: row level security decides
--      which ROWS you may change, but it cannot restrict which COLUMNS.
--   2. Row Level Security (RLS) decides which ROWS each signed-in user may see or change.
--
-- The browser always connects as `anon` (signed out) or `authenticated` (signed in).
-- `service_role` and the SQL Editor bypass RLS and are never used from the frontend.

-- ---------------------------------------------------------------------------
-- Turn on RLS. With RLS on and no matching policy, access is denied.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.gyms enable row level security;
alter table public.showups enable row level security;

-- ---------------------------------------------------------------------------
-- Start from zero. Supabase grants broad default privileges on new tables in the public
-- schema; remove them, then grant back only what the app needs.
-- ---------------------------------------------------------------------------
revoke all on table public.profiles, public.gyms, public.showups from anon, authenticated;

-- Signed-out visitors get nothing: no grants and no policies.

-- ---------------------------------------------------------------------------
-- profiles
--   read:   own row (including is_admin, which the app will need to show admin features)
--   update: ONLY first_name, last_name, date_of_birth
--   insert: nobody. The trigger creates profiles.
--   delete: nobody. A profile is removed only when its Auth user is deleted.
-- ---------------------------------------------------------------------------
grant select on public.profiles to authenticated;
grant update (first_name, last_name, date_of_birth) on public.profiles to authenticated;
-- is_admin, id, created_at and updated_at are not in the list above, so an UPDATE that
-- names any of them fails with "permission denied", regardless of RLS.

create policy "profiles: read own"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));

create policy "profiles: update own"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- gyms
--   read:   own gyms
--   insert: own gyms only; name, place ID, address and coordinates
--   update: ONLY is_active (to retire a gym). Name and coordinates are fixed once saved,
--           because past Showups were measured against them. To change gym: deactivate
--           the old one and insert a new one.
--   delete: nobody, so history is kept.
-- ---------------------------------------------------------------------------
grant select on public.gyms to authenticated;
grant insert (user_id, name, google_place_id, address, latitude, longitude) on public.gyms to authenticated;
grant update (is_active) on public.gyms to authenticated;

create policy "gyms: read own"
  on public.gyms for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "gyms: insert own"
  on public.gyms for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "gyms: update own"
  on public.gyms for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- showups
--   read:   own Showups
--   insert: own, at one of their own ACTIVE gyms; the app may supply only the gym, the
--           distance and the accuracy. occurred_at, created_at and verification_method
--           always take their defaults, so a Showup cannot be backdated or relabelled.
--   update / delete: nobody. History is append-only.
--
-- LIMITATION: distance and accuracy come from the user's browser, so a determined user can
-- send false values (or fake their GPS). This policy proves WHO and WHICH GYM, not WHERE
-- the person really was. Real verification needs a server-side check (a later step).
-- ---------------------------------------------------------------------------
grant select on public.showups to authenticated;
grant insert (user_id, gym_id, distance_meters, location_accuracy_meters) on public.showups to authenticated;

create policy "showups: read own"
  on public.showups for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "showups: insert own at own active gym"
  on public.showups for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.gyms
      where gyms.id = showups.gym_id
        and gyms.user_id = (select auth.uid())
        and gyms.is_active
    )
  );
