-- Showup v2, step 2: core tables.
--
-- Creates the three application tables:
--   public.profiles  one row per signed-in user (extra details about the auth user)
--   public.gyms      the places a user has chosen as their gym (history is kept)
--   public.showups   one row per verified gym visit
--
-- Security (Row Level Security, privileges) is added in a later migration so each file
-- stays small. NOTHING here is safe to expose until that migration has also run.

-- ---------------------------------------------------------------------------
-- Helper: keep updated_at current on every UPDATE
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  -- Same ID as the Supabase Auth user. Deleting the auth user deletes the profile.
  id uuid primary key references auth.users (id) on delete cascade,
  -- Nullable for now: onboarding (a later step) will ask the user to fill these in.
  first_name text,
  last_name text,
  date_of_birth date,
  -- Only ever changed by an administrator using the SQL Editor / service role.
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_first_name_valid
    check (first_name is null or (btrim(first_name) <> '' and char_length(first_name) <= 100)),
  constraint profiles_last_name_valid
    check (last_name is null or (btrim(last_name) <> '' and char_length(last_name) <= 100)),
  -- A lower bound only: "not in the future" cannot be a CHECK because current_date changes.
  constraint profiles_date_of_birth_valid
    check (date_of_birth is null or date_of_birth >= date '1900-01-01')
);

comment on table public.profiles is 'One row per Auth user. Created automatically by the handle_new_user trigger.';
comment on column public.profiles.is_admin is 'Never writable by app users. Set only via the SQL Editor or service role.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- gyms
-- ---------------------------------------------------------------------------
create table public.gyms (
  id uuid primary key default gen_random_uuid(),
  -- Defaults to the signed-in user, so the app does not have to send it.
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  -- Nullable so a manually entered place (no Google ID) can be supported later.
  google_place_id text,
  address text,
  latitude double precision not null,
  longitude double precision not null,
  -- Changing gym means: set the old one to is_active = false, insert a new one.
  -- Old rows stay, because past Showups point at them.
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint gyms_name_not_blank check (btrim(name) <> ''),
  constraint gyms_latitude_range check (latitude between -90 and 90),
  constraint gyms_longitude_range check (longitude between -180 and 180),
  -- Lets showups reference (gym, owner) together, so a Showup can never point at someone
  -- else's gym, whichever role writes it.
  constraint gyms_id_user_id_key unique (id, user_id)
);

comment on table public.gyms is 'A user''s gyms. At most one per user is active. Rows are never deleted by app users.';

-- A user can have many gyms over time, but only one active at once.
create unique index gyms_one_active_per_user_idx on public.gyms (user_id) where is_active;
create index gyms_user_id_created_at_idx on public.gyms (user_id, created_at desc);

create trigger gyms_set_updated_at
  before update on public.gyms
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- showups
-- ---------------------------------------------------------------------------
create table public.showups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  gym_id uuid not null,
  occurred_at timestamptz not null default now(),
  distance_meters integer,
  location_accuracy_meters integer,
  verification_method text not null default 'gps',
  created_at timestamptz not null default now(),

  constraint showups_distance_meters_valid check (distance_meters is null or distance_meters >= 0),
  constraint showups_accuracy_meters_valid
    check (location_accuracy_meters is null or location_accuracy_meters >= 0),
  constraint showups_verification_method_not_blank check (btrim(verification_method) <> ''),

  -- The gym must exist AND belong to the same user. There is deliberately no ON DELETE
  -- CASCADE: a gym with Showups cannot be removed, so attendance history is never lost.
  -- DEFERRABLE INITIALLY DEFERRED lets deleting a whole user (which removes their gyms and
  -- Showups together) succeed regardless of the order Postgres processes them in.
  constraint showups_gym_belongs_to_user
    foreign key (gym_id, user_id) references public.gyms (id, user_id)
    deferrable initially deferred
);

comment on table public.showups is 'Verified gym visits. Append-only for app users: no UPDATE or DELETE.';

-- "My Showups, newest first" and "my Showups between two dates".
create index showups_user_id_occurred_at_idx on public.showups (user_id, occurred_at desc);
-- Reporting across all users by date (admin reports, later).
create index showups_occurred_at_idx on public.showups (occurred_at);
-- Supports the foreign key and "all Showups at this gym".
create index showups_gym_id_user_id_idx on public.showups (gym_id, user_id);
