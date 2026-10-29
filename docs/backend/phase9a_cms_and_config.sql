-- Phase 9a (v2): rename the old `cms` table to `config`, then create a NEW `cms` table that holds the
-- landing-page cards and the Quick Start slides. One row per card or slide, grouped by `category`.
-- Run the WHOLE file in one go. Safe to run twice.
-- Nothing is deleted: every row of the old table (config.* values, banner, terms ...) stays, in `config`.

-- ---------------------------------------------------------------------------
-- 1. Old table: cms -> config (only on the first run)
-- ---------------------------------------------------------------------------
do $$
declare
  seq text;
begin
  if to_regclass('public.config') is not null then
    return;   -- already renamed on an earlier run
  end if;
  if to_regclass('public.cms') is null then
    raise exception 'public.cms was not found, so there is nothing to rename.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'cms' and column_name = 'content_type') then
    raise exception 'public.cms does not look like the old config table (no content_type column). Stopping.';
  end if;

  alter table public.cms rename to config;

  -- tidy the names that still say "cms" (the new table will use them)
  if exists (select 1 from pg_constraint where conrelid = 'public.config'::regclass and conname = 'cms_pkey') then
    alter table public.config rename constraint cms_pkey to config_pkey;
  end if;
  seq := pg_get_serial_sequence('public.config', 'id');
  if seq = 'public.cms_id_seq' then
    alter sequence public.cms_id_seq rename to config_id_seq;
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'config' and policyname = 'cms read') then
    alter policy "cms read" on public.config rename to "config read";
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'config' and policyname = 'cms admin write') then
    alter policy "cms admin write" on public.config rename to "config admin write";
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. The two functions that read the old table now read `config`
-- ---------------------------------------------------------------------------
create or replace function public.cfg(k text, d text)
returns text
language sql
stable
set search_path = public
as $$
  select coalesce((select value from public.config where content_type = k
                   order by created_at desc, id desc limit 1), d)
$$;

create or replace function public.get_app_config()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(json_object_agg(substr(content_type, 8), value), '{}'::json)
  from (
    select distinct on (content_type) content_type, value
    from public.config
    where content_type like 'config.%'
    order by content_type, created_at desc, id desc
  ) latest
$$;

revoke all on function public.get_app_config() from public, anon, authenticated;
grant execute on function public.get_app_config() to authenticated;

-- stop here, loudly, if any OTHER function still reads the old name
do $$
declare
  names text;
begin
  select string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ')
    into names
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and p.prosrc ~* '\mcms\M'
     and p.proname not ilike '%cms%';
  if names is not null then
    raise exception 'These functions still mention "cms" and must be changed to "config" first: %', names;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. The new `cms` table: one row per card / slide, every one with an image, a heading and a subheading.
--    How many screens the app builds = how many ACTIVE rows the category has.
--    To show fewer, set is_active = false. To show more, add a row. Zero active rows = that carousel is off.
-- ---------------------------------------------------------------------------
create table if not exists public.cms (
  id          bigint generated always as identity primary key,
  category    text not null check (category in ('landing_carousel', 'quick_start')),
  position    int  not null,                    -- order within its category, lowest first (10, 20, 30 ...)
  slug        text,                             -- short stable name, e.g. biggest-step (also used in the image file name)
  heading     text not null check (length(btrim(heading)) > 0),
  subheading  text not null default '',
  image_url   text not null default '',         -- empty = the app shows a mascot picture instead
  image_alt   text,                             -- describes the image, for screen readers
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- if `cms` already existed in the OLD shape, the statement above did nothing: stop instead of carrying on
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'cms' and column_name = 'category') then
    raise exception 'public.cms is still the old table. The rename in step 1 did not happen.';
  end if;
end
$$;

create unique index if not exists cms_category_slug  on public.cms (category, slug);
create index        if not exists cms_category_order on public.cms (category, is_active, position);

-- keep updated_at honest
create or replace function public.cms_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists cms_touch on public.cms;
create trigger cms_touch before update on public.cms
  for each row execute function public.cms_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Security: anyone can read (the landing page shows before sign-in); nobody writes from the app.
--    You edit this table in the Supabase Table Editor or the SQL Editor.
-- ---------------------------------------------------------------------------
alter table public.cms enable row level security;

drop policy if exists "public read" on public.cms;
create policy "public read" on public.cms for select to anon, authenticated using (true);

revoke all on public.cms from anon, authenticated;
grant select on public.cms to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Starting content, copied from the design (only inserted when empty, so re-running never overwrites your edits)
-- ---------------------------------------------------------------------------
insert into public.cms (category, position, slug, heading, subheading, image_alt)
select * from (values
  ('landing_carousel', 10, 'biggest-step',
     'Getting to the gym is the biggest step.',
     'Everything good starts with turning up. Showup helps you take that step again and again.',
     'Showup mascot waving'),
  ('landing_carousel', 20, 'accountability',
     'Keep the promise you made to yourself.',
     'Every visit is confirmed, counted against your weekly goal and added to your calendar.',
     'Showup mascot cheering'),
  ('landing_carousel', 30, 'fifteen-minute-rule',
     'Fifteen minutes is enough to count.',
     'Stay for 15 minutes and your visit counts. A short session still beats staying home.',
     'Showup mascot focused on a workout'),
  ('landing_carousel', 40, 'rest-days',
     'Rest days are part of the plan.',
     'Set a goal that fits your week. Pause passes protect your weeks in a row when life gets in the way.',
     'Showup mascot resting'),
  ('quick_start', 10, 'add-gym',
     'Add your gym',
     'Search by gym name or area, pick yours and save. You can switch gyms later in Profile.',
     'Gym search with one gym selected'),
  ('quick_start', 20, 'set-goal',
     'Set your weekly goal',
     'Choose 1 to 7 days a week. Rest days are part of the plan, so pick a number you can keep.',
     'Weekly goal picker set to 3 days'),
  ('quick_start', 30, 'show-up',
     'Tap Show up, then stay 15 minutes',
     'Tap the blue button when you arrive. Your phone’s location confirms you’re really at your gym. Stay 15 minutes and the visit counts.',
     'Show up button, a timer ring and a note that location confirms you are at your gym'),
  ('quick_start', 40, 'watch-week',
     'Watch your week fill in',
     'Each visit fills your calendar. Hit your goal and the week turns green. Need a break? The Pause tab has you covered.',
     'Calendar with a week goal achieved')
) as v(category, position, slug, heading, subheading, image_alt)
where not exists (select 1 from public.cms);

-- the title above the landing carousel lives in `config` with the banner and the terms
insert into public.config (content_type, value)
select 'landing.carousel_heading', 'Why it works'
where not exists (select 1 from public.config where content_type = 'landing.carousel_heading');

-- ---------------------------------------------------------------------------
-- 6. One call for the app: the active items of each category, in order.
--    A category with no active items is simply missing from the result (= switched off).
--    "version" changes whenever you edit, add, hide or delete anything; "v" on an item is for the image cache.
-- ---------------------------------------------------------------------------
create or replace function public.get_cms_content()
returns json
language sql
stable
set search_path = public
as $$
  select json_build_object(
    'version', (select coalesce((extract(epoch from max(updated_at)) * 1000)::bigint, 0) || '-' || count(*)
                  from public.cms),
    'categories', coalesce((
      select json_object_agg(g.category, g.items)
      from (
        select c.category,
               json_agg(json_build_object(
                 'id', c.id, 'slug', c.slug, 'position', c.position,
                 'heading', c.heading, 'subheading', c.subheading,
                 'image_url', c.image_url, 'image_alt', c.image_alt,
                 'v', (extract(epoch from c.updated_at) * 1000)::bigint)
                 order by c.position, c.id) as items
        from public.cms c
        where c.is_active
        group by c.category) g), '{}'::json)
  )
$$;

revoke all on function public.get_cms_content() from public, anon, authenticated;
grant execute on function public.get_cms_content() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. "Has this person finished the Quick Start?"  A timestamp, empty until they finish.
--    Nobody is marked as done in advance: anyone with an empty timestamp sees the Quick Start.
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists quickstart_completed_at timestamptz;

create or replace function public.complete_quickstart()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  n int;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  update public.profiles
     set quickstart_completed_at = coalesce(quickstart_completed_at, now()), updated_at = now()
   where id = uid;
  get diagnostics n = row_count;
  return n > 0;
end
$$;

revoke all on function public.complete_quickstart() from public, anon, authenticated;
grant execute on function public.complete_quickstart() to authenticated;
