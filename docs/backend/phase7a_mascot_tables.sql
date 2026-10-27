-- Phase 7A: mascot images + mascot messages (CMS tables).
-- Safe to run twice. Adds two tables, one trigger function, one RPC and one config row.
-- Does not touch any existing table or function.

-- ---------------------------------------------------------------------------
-- 0. Storage bucket for the images (public read).
--    If this block prints a NOTICE instead of creating it, make the bucket by hand:
--    Supabase > Storage > New bucket > name: app-assets > Public bucket: ON.
-- ---------------------------------------------------------------------------
do $$
begin
  insert into storage.buckets (id, name, public) values ('app-assets', 'app-assets', true)
  on conflict (id) do update set public = true;
exception when others then
  raise notice 'Could not create the bucket from SQL (%). Create a PUBLIC bucket named app-assets in Storage instead.', sqlerrm;
end
$$;

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

-- One row per picture. To change a picture, change image_url. Nothing else.
create table if not exists public.mascot_images (
  key        text primary key,                       -- smile, wave, cheer, lift, focus, sleep, avatar, logo_white
  kind       text not null check (kind in ('expression', 'avatar', 'logo')),
  image_url  text not null default '',               -- empty = not uploaded yet, the app falls back
  alt_text   text,
  width      int,                                    -- pixels of the PNG; the app uses width:height as the shape
  height     int,
  is_active  boolean not null default true,
  updated_at timestamptz not null default now()      -- bumps automatically; the app uses it to refresh its cache
);

-- One row per thing the mascot can say.
-- The app works out which situations are true right now (the code knows what each key means),
-- then shows the active row with the LOWEST priority number among them.
create table if not exists public.mascot_messages (
  id          bigint generated always as identity primary key,
  key         text not null,                          -- the situation, e.g. one_to_go
  locale      text not null default 'en',
  priority    int  not null,                          -- lower number wins. Re-order by changing these.
  expression  text not null references public.mascot_images(key) on update cascade,
  message     text not null check (length(btrim(message)) > 0),
  scenario    text,                                   -- notes for editors only
  shown_when  text,                                   -- notes for editors only
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists mascot_messages_lookup
  on public.mascot_messages (locale, is_active, priority);

-- keep updated_at honest on every edit
create or replace function public.mascot_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists mascot_images_touch on public.mascot_images;
create trigger mascot_images_touch before update on public.mascot_images
  for each row execute function public.mascot_touch_updated_at();

drop trigger if exists mascot_messages_touch on public.mascot_messages;
create trigger mascot_messages_touch before update on public.mascot_messages
  for each row execute function public.mascot_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Security: anyone can read (the logo shows before sign-in), nobody can write from the app.
--    You edit these tables in the Supabase Table Editor or the SQL Editor.
-- ---------------------------------------------------------------------------
alter table public.mascot_images   enable row level security;
alter table public.mascot_messages enable row level security;

drop policy if exists "public read" on public.mascot_images;
drop policy if exists "public read" on public.mascot_messages;
create policy "public read" on public.mascot_images   for select to anon, authenticated using (true);
create policy "public read" on public.mascot_messages for select to anon, authenticated using (true);

revoke all on public.mascot_images, public.mascot_messages from anon, authenticated;
grant select on public.mascot_images, public.mascot_messages to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Starting content (only inserted if the table is empty, so re-running never overwrites your edits)
-- ---------------------------------------------------------------------------
insert into public.mascot_images (key, kind, alt_text, width, height)
select * from (values
  ('smile',      'expression', 'Showup mascot smiling',                    180, 250),
  ('wave',       'expression', 'Showup mascot waving',                     180, 250),
  ('cheer',      'expression', 'Showup mascot cheering with arms up',      180, 250),
  ('lift',       'expression', 'Showup mascot lifting a barbell',          180, 250),
  ('focus',      'expression', 'Showup mascot focused, listening to music',180, 250),
  ('sleep',      'expression', 'Showup mascot asleep',                     180, 250),
  ('avatar',     'avatar',     'Showup mascot avatar',                     160, 160),
  ('logo_white', 'logo',       'Showup',                                   100, 100)
) as v(key, kind, alt_text, width, height)
where not exists (select 1 from public.mascot_images);

-- Placeholders you can use in a message: {goal} {done} {next} {left} {remaining} {wk} {total}
insert into public.mascot_messages (key, priority, expression, message, scenario, shown_when)
select * from (values
  ('checking',        10,  'focus', 'Hang on, confirming where you are.',                                         'Verifying location',                    'Show up tapped, location check running'),
  ('running_almost',  20,  'cheer', 'Almost there. {left} min left.',                                             'At the gym, almost done',               'Timer running and little time left'),
  ('running',         30,  'focus', 'Stay put. {left} min to go.',                                                'At the gym, timer running',             'Timer running'),
  ('done_extra',      40,  'lift',  'Bonus visit. That’s {done} this week.',                                      'Visit complete, goal already met',      'Today''s visit is confirmed and days this week are above goal'),
  ('done_goal_hit',   50,  'cheer', 'Week goal hit! {wk} weeks in a row.',                                        'Visit complete, goal just met',         'Today''s visit is confirmed and days this week equal goal'),
  ('done_progress',   60,  'smile', 'Nice. {remaining} more to hit your week.',                                   'Visit complete, goal not yet met',      'Today''s visit is confirmed and days this week are below goal'),
  ('paused',          70,  'sleep', 'Taking a pause. See you when you’re back.',                                  'Pause pass active',                     'A pause pass covers the current week'),
  ('left_early',      80,  'wave',  'Left early? No stress. The timer reset, so try again when you’re back.',     'Left before the timer finished',        'Timer reset after leaving early'),
  ('missed_checks',   85,  'wave',  'We couldn’t confirm you stayed. Keep Showup open with the screen on, then try again.', 'Location checks missed',    'Timer reset because too many location checks were missed'),
  ('new_user',        90,  'wave',  'Let’s get your first week going. One visit is all it takes today.',          'First week ever',                       'No showups recorded yet'),
  ('goal_met',        100, 'lift',  'Weekly goal done. Extra visits still count.',                                'Goal met, today not yet done',          'Days this week at or above goal, no visit today'),
  ('back_after_miss', 110, 'wave',  'Welcome back. A missed week doesn’t erase your {total} showups.',            'Returning after missed weeks',          '0 weeks in a row and past showups exist'),
  ('one_to_go',       120, 'cheer', 'One more and your week is done. You’ve got this.',                           'One visit from goal',                   'Days this week equal goal minus 1'),
  ('high_goal',       130, 'lift',  '{done} of {goal} so far. Rest days are part of the plan too.',               'Goal of 5 or more days',                'Goal is 5+ and more than one visit to go'),
  ('week_start',      140, 'smile', 'New week, fresh start. Show up today and you’re at 1 of {goal}.',            'New week, no visits yet',               'Days this week is 0'),
  ('in_progress',     150, 'smile', 'Show up today and you’re at {next} of {goal}.',                              'Mid-week progress',                     'Default idle state')
) as v(key, priority, expression, message, scenario, shown_when)
where not exists (select 1 from public.mascot_messages);

-- how many seconds are left when the mascot switches to the "almost there" message
insert into public.cms (content_type, value)
select 'config.mascot_almost_seconds', '180'
where not exists (select 1 from public.cms where content_type = 'config.mascot_almost_seconds');

-- ---------------------------------------------------------------------------
-- 4. One call for the app: all active pictures and messages
--    - pictures with no URL yet are left out (the app falls back)
--    - messages in the requested locale win; any key missing there falls back to English
--    - "version" changes whenever you edit anything, so the app knows to refresh
-- ---------------------------------------------------------------------------
create or replace function public.get_mascot_content(p_locale text default 'en')
returns json
language sql
stable
set search_path = public
as $$
  select json_build_object(
    'version', coalesce((extract(epoch from greatest(
                 (select max(updated_at) from public.mascot_images),
                 (select max(updated_at) from public.mascot_messages))) * 1000)::bigint, 0),
    'images', coalesce((
      select json_object_agg(i.key, json_build_object(
               'kind', i.kind, 'url', i.image_url, 'alt', i.alt_text,
               'width', i.width, 'height', i.height,
               'v', (extract(epoch from i.updated_at) * 1000)::bigint))
      from public.mascot_images i
      where i.is_active and i.image_url <> ''), '{}'::json),
    'messages', coalesce((
      select json_agg(json_build_object(
               'id', m.id, 'key', m.key, 'locale', m.locale, 'priority', m.priority,
               'expression', m.expression, 'message', m.message)
             order by m.priority, m.id)
      from public.mascot_messages m
      where m.is_active
        and (m.locale = p_locale
             or (m.locale = 'en' and not exists (
                   select 1 from public.mascot_messages x
                   where x.is_active and x.key = m.key and x.locale = p_locale)))), '[]'::json)
  )
$$;

revoke all on function public.get_mascot_content(text) from public, anon, authenticated;
grant execute on function public.get_mascot_content(text) to anon, authenticated;