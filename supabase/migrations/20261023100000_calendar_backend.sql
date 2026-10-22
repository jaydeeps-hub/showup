-- Showup: calendar backend (weekly goals, weeks in a row, pauses, server-side Show Up).
--
-- Design: raw events are the source of truth (showups, goal_history, week_pauses). Once a week
-- ends, its result is frozen in weekly_results, so changing a goal or a setting later never
-- rewrites history. See "Calendar backend design" for the reasoning.
--
-- ALREADY CREATED BY HAND (this migration does NOT create or change them, it only checks them):
--   profiles.timezone, showups.local_date + its BEFORE INSERT trigger, the unique index
--   showups_one_per_day (user_id, local_date), tables goal_history / week_pauses / weekly_results,
--   functions goal_for_week() and cfg(), the config.* rows in cms, and their row level security.
--
-- THIS MIGRATION ADDS (and nothing else): the functions below.
--   Client-callable (authenticated only, never take a user id, always use auth.uid()):
--     set_weekly_goal, use_pause, end_pause, record_showup, get_calendar, get_home_summary,
--     get_app_config
--   Internal helpers (NOT callable from the browser, so nobody can pass someone else's id):
--     close_weeks, week_summary, local_today, calendar_distance_meters
--
-- Showups can still be inserted directly by the app until you revoke INSERT on showups yourself.
-- Safe to run twice (create or replace).

-- ---------------------------------------------------------------------------
-- 0. Stop early, with a clear list, if something that should already exist does not.
-- ---------------------------------------------------------------------------
do $$
declare
  missing text[] := '{}';
begin
  if to_regclass('public.goal_history') is null then missing := missing || 'table goal_history'; end if;
  if to_regclass('public.week_pauses') is null then missing := missing || 'table week_pauses'; end if;
  if to_regclass('public.weekly_results') is null then missing := missing || 'table weekly_results'; end if;
  if to_regclass('public.cms') is null then missing := missing || 'table cms'; end if;
  if to_regclass('public.showups') is null then missing := missing || 'table showups'; end if;

  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'profiles' and column_name = 'timezone')
    then missing := missing || 'column profiles.timezone'; end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'showups' and column_name = 'local_date')
    then missing := missing || 'column showups.local_date'; end if;

  if to_regprocedure('public.goal_for_week(uuid,date)') is null then missing := missing || 'function goal_for_week(uuid, date)'; end if;
  if to_regprocedure('public.cfg(text,text)') is null then missing := missing || 'function cfg(text, text)'; end if;

  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'showups_one_per_day')
    then missing := missing || 'unique index showups_one_per_day'; end if;

  if array_length(missing, 1) is not null then
    raise exception 'Calendar migration cannot run: missing prerequisites: %', array_to_string(missing, '; ')
      using hint = 'Create these first (see "Calendar backend design"), then run this migration again.';
  end if;
end
$$;

-- PostGIS gives ST_DistanceSphere, used by record_showup. Supabase includes it; this just turns it on
-- if it is not already (it is skipped silently when PostGIS is already installed in any schema).
-- The distance helper below finds it through its search_path, wherever it lives.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'postgis') then
    create extension postgis with schema extensions;
  end if;
exception when others then
  raise exception 'Could not enable PostGIS: %. Enable it in Supabase under Database > Extensions, then run this migration again.', sqlerrm;
end
$$;

-- ---------------------------------------------------------------------------
-- 1. Small internal helpers
-- ---------------------------------------------------------------------------

-- Today's date in the user's own timezone (falls back to the default timezone if the profile has none).
create or replace function public.local_today(p_user uuid)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select (now() at time zone coalesce((select timezone from public.profiles where id = p_user), 'Asia/Kolkata'))::date
$$;

-- Monday of the week containing p_day.
create or replace function public.week_start_of(p_day date)
returns date
language sql
immutable
set search_path = public
as $$
  select (p_day - (extract(isodow from p_day)::int - 1))::date
$$;

-- The ONE place that calls PostGIS. Metres between two points on the Earth's surface.
create or replace function public.calendar_distance_meters(p_lat1 float8, p_lng1 float8, p_lat2 float8, p_lng2 float8)
returns float8
language sql
immutable
set search_path = public, extensions
as $$
  select ST_DistanceSphere(ST_MakePoint(p_lng1, p_lat1), ST_MakePoint(p_lng2, p_lat2))
$$;

-- A config value as a whole number, falling back to a safe default when missing or not a number.
create or replace function public.cfg_int(p_key text, p_default int)
returns int
language sql
stable
set search_path = public
as $$
  select case when v ~ '^\s*-?\d+\s*$' then btrim(v)::int else p_default end
  from (select public.cfg(p_key, p_default::text) as v) x
$$;

-- ---------------------------------------------------------------------------
-- 2. Weekly goal (client-callable)
-- ---------------------------------------------------------------------------

-- First goal takes effect this week. Later changes take effect NEXT Monday, so a user cannot lower
-- this week's goal after a bad week. Changing it twice before Monday overwrites the pending row.
create or replace function public.set_weekly_goal(p_days int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  this_week date;
  eff date;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if p_days is null or p_days < 1 or p_days > 7 then
    raise exception 'invalid_goal: days per week must be between 1 and 7';
  end if;

  this_week := public.week_start_of(public.local_today(uid));
  eff := case when exists (select 1 from public.goal_history where user_id = uid)
              then this_week + 7 else this_week end;

  insert into public.goal_history (user_id, days_per_week, effective_from)
  values (uid, p_days, eff)
  on conflict (user_id, effective_from)
  do update set days_per_week = excluded.days_per_week, created_at = now();
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Closing weeks (internal helper)
-- ---------------------------------------------------------------------------

-- Freezes every finished week that has not been frozen yet. Safe to call repeatedly and at the
-- same time: a per-user advisory lock makes concurrent callers take turns, and each week is written
-- with ON CONFLICT DO NOTHING, so a week is never written twice or changed.
create or replace function public.close_weeks(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cur_week date;
  w date;
  prev int;
  g int;
  n int;
  paused bool;
  st text;
begin
  if p_user is null then return; end if;

  -- One caller per user at a time. Released automatically when the transaction ends.
  perform pg_advisory_xact_lock(hashtextextended('close_weeks:' || p_user::text, 0));

  cur_week := public.week_start_of(public.local_today(p_user));

  select coalesce(
           (select max(week_start) + 7 from public.weekly_results where user_id = p_user),
           (select public.week_start_of(min(effective_from)) from public.goal_history where user_id = p_user)
         )
    into w;
  if w is null then return; end if; -- no goal has ever been set: nothing to close

  select coalesce(
           (select weeks_in_a_row from public.weekly_results where user_id = p_user order by week_start desc limit 1),
           0)
    into prev;

  while w < cur_week loop
    g := public.goal_for_week(p_user, w);
    if g is null then
      w := w + 7; -- before the first goal existed: nothing to score
      continue;
    end if;

    select count(*) into n from public.showups
      where user_id = p_user and local_date between w and w + 6;

    select exists (
      select 1 from public.week_pauses
      where user_id = p_user and week_start = w and ended_at is null
    ) into paused;

    st := case when n >= g then 'achieved' when paused then 'paused' else 'missed' end;
    prev := case st when 'achieved' then prev + 1 when 'paused' then prev else 0 end;

    insert into public.weekly_results (user_id, week_start, goal_days, showup_days, status, weeks_in_a_row, closed_at)
    values (p_user, w, g, n, st, prev, now())
    on conflict (user_id, week_start) do nothing;

    w := w + 7;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Week summaries (internal helper)
-- ---------------------------------------------------------------------------

-- Closed weeks come from the frozen snapshot; open and future weeks are worked out live.
create or replace function public.week_summary(p_user uuid, p_from date, p_to date)
returns table (week_start date, goal_days int, showup_days int, status text)
language sql
stable
security definer
set search_path = public
as $$
  select ws::date,
         coalesce(r.goal_days, public.goal_for_week(p_user, ws::date))::int,
         coalesce(r.showup_days, x.n)::int,
         coalesce(
           r.status,
           case
             when public.goal_for_week(p_user, ws::date) is not null and x.n >= public.goal_for_week(p_user, ws::date) then 'achieved'
             when x.paused then 'paused'
             when ws::date > public.local_today(p_user) then 'upcoming'
             else 'in_progress'
           end
         )
  from generate_series(public.week_start_of(p_from), p_to, interval '7 days') ws
  left join public.weekly_results r on r.user_id = p_user and r.week_start = ws::date
  cross join lateral (
    select (select count(*) from public.showups s
             where s.user_id = p_user and s.local_date between ws::date and ws::date + 6) as n,
           exists (select 1 from public.week_pauses p
             where p.user_id = p_user and p.week_start = ws::date and p.ended_at is null) as paused
  ) x
$$;

-- ---------------------------------------------------------------------------
-- 5. Pauses (client-callable)
-- ---------------------------------------------------------------------------

-- Passes the user has used in the month containing p_month (a local date). Ending a pause early
-- does NOT give the pass back.
create or replace function public.passes_used_in_month(p_user uuid, p_month date)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.week_pauses
  where user_id = p_user and used_month = date_trunc('month', p_month)::date
$$;

create or replace function public.use_pause(p_week_start date, p_reason text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  today date;
  this_week date;
  max_ahead int;
  max_passes int;
  month_start date;
  used int;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if p_week_start is null then raise exception 'invalid_week: a week is required'; end if;

  -- Same user, same moment: take turns, so two quick taps cannot both spend the last pass.
  perform pg_advisory_xact_lock(hashtextextended('use_pause:' || uid::text, 0));

  today := public.local_today(uid);
  this_week := public.week_start_of(today);
  max_ahead := public.cfg_int('config.pause_max_weeks_ahead', 1);
  max_passes := public.cfg_int('config.pause_passes_per_month', 3);
  month_start := date_trunc('month', today)::date;

  -- 1. Must be a Monday, from this week up to max_ahead weeks ahead.
  if extract(isodow from p_week_start) <> 1 then
    raise exception 'invalid_week: the week must start on a Monday';
  end if;
  if p_week_start < this_week then
    raise exception 'week_in_past: a pause cannot be used for a week that has already started';
  end if;
  if p_week_start > this_week + 7 * max_ahead then
    raise exception 'week_too_far_ahead: a pause can be used at most % week(s) ahead', max_ahead;
  end if;

  -- 2. Not already paused.
  if exists (select 1 from public.week_pauses where user_id = uid and week_start = p_week_start) then
    raise exception 'already_paused: this week already has a pause';
  end if;

  -- 3. A pass must be left this month.
  used := public.passes_used_in_month(uid, month_start);
  if used >= max_passes then
    raise exception 'no_passes_left: all % passes for this month are used', max_passes;
  end if;

  -- 4. The week must not already be achieved.
  if p_week_start <= this_week
     and (select count(*) from public.showups
           where user_id = uid and local_date between p_week_start and p_week_start + 6)
         >= coalesce(public.goal_for_week(uid, p_week_start), 2147483647) then
    raise exception 'already_achieved: this week is already achieved, so a pause is not needed';
  end if;

  insert into public.week_pauses (user_id, week_start, used_month, reason)
  values (uid, p_week_start, month_start, nullif(btrim(p_reason), ''));

  return json_build_object('passes_left', max_passes - used - 1);
end
$$;

-- Ends a pause early: the week is scored normally again. The pass is NOT refunded.
create or replace function public.end_pause(p_week_start date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  affected int;
begin
  if uid is null then raise exception 'not_signed_in'; end if;

  update public.week_pauses
     set ended_at = now()
   where user_id = uid and week_start = p_week_start and ended_at is null;
  get diagnostics affected = row_count;

  if affected = 0 then
    raise exception 'no_active_pause: there is no active pause for that week';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 6. Show Up (client-callable)
-- ---------------------------------------------------------------------------

-- Checks the distance ON THE SERVER, so a modified app cannot skip it. One Showup counts per local
-- calendar day. Returns true if a new Showup was recorded, false if today already had one.
-- verification_method and local_date are left to their column default and the existing trigger.
create or replace function public.record_showup(p_gym uuid, p_lat float8, p_lng float8, p_accuracy int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  g record;
  dist float8;
  limit_m int;
  inserted int;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid_position: latitude and longitude are required';
  end if;

  -- The gym must be the caller's own ACTIVE gym (same rule as the table's own insert policy).
  select id, latitude, longitude into g
    from public.gyms
   where id = p_gym and user_id = uid and is_active;
  if not found then raise exception 'gym_not_found: that is not your active gym'; end if;

  dist := public.calendar_distance_meters(p_lat, p_lng, g.latitude, g.longitude);
  limit_m := public.cfg_int('config.max_gym_distance_meters', 100);
  if dist > limit_m then raise exception 'too_far'; end if;

  insert into public.showups (user_id, gym_id, distance_meters, location_accuracy_meters)
  values (uid, g.id, round(dist)::int, greatest(coalesce(p_accuracy, 0), 0))
  on conflict (user_id, local_date) do nothing;
  get diagnostics inserted = row_count;

  return inserted > 0;
end
$$;

-- ---------------------------------------------------------------------------
-- 7. Calendar and home summary (client-callable)
-- ---------------------------------------------------------------------------

create or replace function public.get_calendar(p_month date)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  today date;
  cur_month date;
  start_month date;
  raw text;
  month_start date;
  grid_from date;
  grid_to date;
  dates json;
  weeks json;
begin
  if uid is null then raise exception 'not_signed_in'; end if;

  perform public.close_weeks(uid);

  today := public.local_today(uid);
  cur_month := date_trunc('month', today)::date;

  -- calendar_start_month is "YYYY-MM". Missing, malformed or in the future falls back to this month.
  raw := public.cfg('config.calendar_start_month', '');
  start_month := cur_month;
  if raw ~ '^\d{4}-(0[1-9]|1[0-2])$' then
    start_month := least(to_date(raw || '-01', 'YYYY-MM-DD'), cur_month);
  end if;

  month_start := date_trunc('month', coalesce(p_month, cur_month))::date;
  month_start := greatest(least(month_start, cur_month), start_month);

  -- The visible grid: whole weeks, Monday to Sunday, covering the month.
  grid_from := public.week_start_of(month_start);
  grid_to := public.week_start_of((month_start + interval '1 month - 1 day')::date) + 6;

  select coalesce(json_agg(local_date order by local_date), '[]'::json) into dates
    from public.showups
   where user_id = uid and local_date between grid_from and grid_to;

  select coalesce(json_agg(json_build_object(
           'week_start', s.week_start, 'goal_days', s.goal_days,
           'showup_days', s.showup_days, 'status', s.status) order by s.week_start), '[]'::json)
    into weeks
    from public.week_summary(uid, grid_from, grid_to) s;

  return json_build_object(
    'month', month_start,
    'earliest_month', start_month,
    'latest_month', cur_month,
    'grid_from', grid_from,
    'grid_to', grid_to,
    'showup_dates', dates,
    'weeks', weeks
  );
end
$$;

create or replace function public.get_home_summary()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  today date;
  this_week date;
  max_passes int;
  last_closed int;
  best_closed int;
  goal int;
  n int;
  current_run int;
  total int;
begin
  if uid is null then raise exception 'not_signed_in'; end if;

  perform public.close_weeks(uid);

  today := public.local_today(uid);
  this_week := public.week_start_of(today);
  max_passes := public.cfg_int('config.pause_passes_per_month', 3);

  select coalesce((select weeks_in_a_row from public.weekly_results where user_id = uid order by week_start desc limit 1), 0)
    into last_closed;
  select coalesce(max(weeks_in_a_row), 0) into best_closed from public.weekly_results where user_id = uid;

  goal := public.goal_for_week(uid, this_week);
  select count(*) into n from public.showups where user_id = uid and local_date between this_week and this_week + 6;
  select count(*) into total from public.showups where user_id = uid;

  -- The week in progress can still be achieved, so it never breaks the run; it only adds one once met.
  current_run := last_closed + case when goal is not null and n >= goal then 1 else 0 end;

  return json_build_object(
    'weeks_in_a_row', current_run,
    'best_weeks_in_a_row', greatest(best_closed, current_run),
    'goal_days', goal,
    'showup_days_this_week', n,
    'passes_left', greatest(max_passes - public.passes_used_in_month(uid, date_trunc('month', today)::date), 0),
    'total_showups', total
  );
end
$$;

-- ---------------------------------------------------------------------------
-- 8. App config (client-callable)
-- ---------------------------------------------------------------------------

-- Every config.* key as one JSON object, newest row per key, with the "config." prefix removed.
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
    from public.cms
    where content_type like 'config.%'
    order by content_type, created_at desc, id desc
  ) latest
$$;

-- ---------------------------------------------------------------------------
-- 9. Who may call what
-- ---------------------------------------------------------------------------

-- Everything starts closed...
revoke all on function public.local_today(uuid) from public, anon, authenticated;
revoke all on function public.week_start_of(date) from public, anon, authenticated;
revoke all on function public.calendar_distance_meters(float8, float8, float8, float8) from public, anon, authenticated;
revoke all on function public.cfg_int(text, int) from public, anon, authenticated;
revoke all on function public.passes_used_in_month(uuid, date) from public, anon, authenticated;
revoke all on function public.close_weeks(uuid) from public, anon, authenticated;
revoke all on function public.week_summary(uuid, date, date) from public, anon, authenticated;
revoke all on function public.set_weekly_goal(int) from public, anon, authenticated;
revoke all on function public.use_pause(date, text) from public, anon, authenticated;
revoke all on function public.end_pause(date) from public, anon, authenticated;
revoke all on function public.record_showup(uuid, float8, float8, int) from public, anon, authenticated;
revoke all on function public.get_calendar(date) from public, anon, authenticated;
revoke all on function public.get_home_summary() from public, anon, authenticated;
revoke all on function public.get_app_config() from public, anon, authenticated;

-- ...then only the app-facing functions are opened, and only to signed-in users.
grant execute on function public.set_weekly_goal(int) to authenticated;
grant execute on function public.use_pause(date, text) to authenticated;
grant execute on function public.end_pause(date) to authenticated;
grant execute on function public.record_showup(uuid, float8, float8, int) to authenticated;
grant execute on function public.get_calendar(date) to authenticated;
grant execute on function public.get_home_summary() to authenticated;
grant execute on function public.get_app_config() to authenticated;
