-- FUNCTIONS

CREATE OR REPLACE FUNCTION public.calendar_distance_meters(p_lat1 double precision, p_lng1 double precision, p_lat2 double precision, p_lng2 double precision)
 RETURNS double precision
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  select ST_DistanceSphere(ST_MakePoint(p_lng1, p_lat1), ST_MakePoint(p_lng2, p_lat2))
$function$
;

CREATE OR REPLACE FUNCTION public.cancel_showup(p_session uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  affected int;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  update public.showup_sessions
     set status = 'cancelled', ended_at = now()
   where id = p_session and user_id = uid and status = 'running';
  get diagnostics affected = row_count;
  return affected > 0;
end
$function$
;

CREATE OR REPLACE FUNCTION public.cfg(k text, d text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce((select value from public.config where content_type = k
                   order by created_at desc, id desc limit 1), d)
$function$
;

CREATE OR REPLACE FUNCTION public.cfg_int(p_key text, p_default integer)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select case when v ~ '^\s*-?\d+\s*$' then btrim(v)::int else p_default end
  from (select public.cfg(p_key, p_default::text) as v) x
$function$
;

CREATE OR REPLACE FUNCTION public.check_showup(p_session uuid, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_accuracy integer DEFAULT NULL::integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  s public.showup_sessions%rowtype;
  tol constant numeric := 2;            -- seconds of slack for clock and network
  el numeric;
  cps int[];
  due int;
  nxt int;
  is_final boolean;
  needs_loc boolean;
  gym_lat float8;
  gym_lng float8;
  dist float8;
  limit_m int;
  acc_limit int;
  ok boolean := true;
  bad int;
  end_status text;
  new_showup uuid;
begin
  if uid is null then raise exception 'not_signed_in'; end if;

  select * into s from public.showup_sessions where id = p_session and user_id = uid for update;
  if not found then raise exception 'session_not_found'; end if;

  if s.status <> 'running' then
    return json_build_object('result', s.status, 'session', public.showup_session_json(s.id));
  end if;

  el := extract(epoch from (now() - s.started_at));
  if el > s.duration_seconds + public.showup_grace_seconds() then
    update public.showup_sessions set status = 'expired', ended_at = now() where id = s.id;
    return json_build_object('result', 'expired', 'session', public.showup_session_json(s.id));
  end if;

  cps := public.showup_checkpoints(s.duration_seconds, s.interval_seconds);

  -- the latest scheduled check that is due now
  select max(c) into due from unnest(cps) c where c <= el + tol;
  if due is null then
    return json_build_object('result', 'not_due', 'next_check_in_seconds', ceil(cps[1] - el)::int,
                             'session', public.showup_session_json(s.id));
  end if;

  -- that check already has a passing reading
  if exists (select 1 from public.showup_checks where session_id = s.id and due_at_seconds = due and passed) then
    select min(c) into nxt from unnest(cps) c where c > due;
    return json_build_object('result', 'not_due', 'next_check_in_seconds', greatest(ceil(coalesce(nxt, due) - el), 0)::int,
                             'session', public.showup_session_json(s.id));
  end if;

  is_final  := (due = s.duration_seconds);
  needs_loc := s.interval_seconds > 0;

  if needs_loc then
    if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
      raise exception 'invalid_position: latitude and longitude are required';
    end if;

    acc_limit := greatest(public.cfg_int('config.max_location_accuracy_meters', 0), 0);
    if acc_limit > 0 and coalesce(p_accuracy, 0) > acc_limit then
      -- not the user's fault and not evidence either way: ask the app to try again
      return json_build_object('result', 'poor_accuracy', 'session', public.showup_session_json(s.id));
    end if;

    select latitude, longitude into gym_lat, gym_lng from public.gyms where id = s.gym_id;
    dist := public.calendar_distance_meters(p_lat, p_lng, gym_lat, gym_lng);
    limit_m := public.cfg_int('config.max_gym_distance_meters', 100);
    ok := dist <= limit_m;

    insert into public.showup_checks (session_id, user_id, checkpoint_no, due_at_seconds, elapsed_seconds, distance_meters, accuracy_meters, passed)
    values (s.id, uid, array_position(cps, due), due, floor(el)::int, round(dist)::int, p_accuracy, ok)
    on conflict (session_id, due_at_seconds) do update
      set checked_at = now(), elapsed_seconds = excluded.elapsed_seconds, distance_meters = excluded.distance_meters,
          accuracy_meters = excluded.accuracy_meters, passed = excluded.passed;
  end if;

  -- scheduled checks so far (not counting the last one) that still have no passing reading
  select count(*) into bad
    from unnest(cps) c
   where c <= due and c <> s.duration_seconds
     and not exists (select 1 from public.showup_checks k
                      where k.session_id = s.id and k.due_at_seconds = c and k.passed);

  if not ok and is_final then
    end_status := 'left_early';
  elsif bad > s.max_missed_checks then
    end_status := case when ok then 'missed_checks' else 'left_early' end;
  end if;

  if end_status is not null then
    update public.showup_sessions set status = end_status, ended_at = now() where id = s.id;
    return json_build_object('result', end_status, 'session', public.showup_session_json(s.id));
  end if;

  if is_final then
    -- counted on the day the visit started, even if the timer finishes after midnight
    insert into public.showups (user_id, gym_id, occurred_at, distance_meters, location_accuracy_meters)
    values (uid, s.gym_id, s.started_at, s.start_distance_meters, s.start_accuracy_meters)
    on conflict (user_id, local_date) do nothing
    returning id into new_showup;

    update public.showup_sessions
       set status = 'completed', ended_at = now(), showup_id = new_showup
     where id = s.id;

    return json_build_object('result', 'completed', 'recorded', new_showup is not null,
                             'session', public.showup_session_json(s.id));
  end if;

  select min(c) into nxt from unnest(cps) c where c > due;
  return json_build_object('result', 'running', 'check_passed', ok,
                           'next_check_in_seconds', greatest(ceil(nxt - el), 0)::int,
                           'session', public.showup_session_json(s.id));
end
$function$
;

CREATE OR REPLACE FUNCTION public.close_weeks(p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.cms_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at := now();
  return new;
end
$function$
;

CREATE OR REPLACE FUNCTION public.complete_quickstart()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.effective_place_search_mode()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case
    when p.is_admin and p.place_search_mode = 'any_place' then 'any_place'
    else 'fitness_only'
  end
  from public.profiles p
  where p.id = auth.uid()
$function$
;

CREATE OR REPLACE FUNCTION public.end_pause(p_week_start date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_app_config()
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(json_object_agg(substr(content_type, 8), value), '{}'::json)
  from (
    select distinct on (content_type) content_type, value
    from public.config
    where content_type like 'config.%'
    order by content_type, created_at desc, id desc
  ) latest
$function$
;

CREATE OR REPLACE FUNCTION public.get_calendar(p_month date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_cms_content()
 RETURNS json
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_goal_state()
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  this_week date;
  pend_days smallint;
  pend_from date;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  this_week := public.week_start_of(public.local_today(uid));

  select days_per_week, effective_from into pend_days, pend_from
    from public.goal_history
   where user_id = uid and effective_from > this_week
   order by effective_from limit 1;

  return json_build_object(
    'has_goal', exists (select 1 from public.goal_history where user_id = uid),
    'current_goal', public.goal_for_week(uid, this_week),
    'pending_goal', pend_days,
    'pending_from', pend_from
  );
end
$function$
;

CREATE OR REPLACE FUNCTION public.get_home_summary()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_mascot_content(p_locale text DEFAULT 'en'::text)
 RETURNS json
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_pause_state()
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  today date;
  this_week date;
  max_passes int;
  used int;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  today := public.local_today(uid);
  this_week := public.week_start_of(today);
  max_passes := public.cfg_int('config.pause_passes_per_month', 3);
  used := public.passes_used_in_month(uid, date_trunc('month', today)::date);

  return json_build_object(
    'today', today,
    'this_week', this_week,
    'max_weeks_ahead', public.cfg_int('config.pause_max_weeks_ahead', 1),
    'passes_total', max_passes,
    'passes_left', greatest(max_passes - used, 0),
    'next_refill', (date_trunc('month', today) + interval '1 month')::date,
    'active_pauses', coalesce((
        select json_agg(week_start order by week_start) from public.week_pauses
         where user_id = uid and ended_at is null and week_start >= this_week
      ), '[]'::json)
  );
end
$function$
;

CREATE OR REPLACE FUNCTION public.get_showup_state()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  today date;
  sid uuid;
begin
  if uid is null then raise exception 'not_signed_in'; end if;

  update public.showup_sessions
     set status = 'expired', ended_at = now()
   where user_id = uid and status = 'running'
     and now() > started_at + ((duration_seconds + public.showup_grace_seconds()) * interval '1 second');

  today := public.local_today(uid);
  select id into sid from public.showup_sessions where user_id = uid and status = 'running';

  return json_build_object(
    'today', today,
    'showed_up_today', exists (select 1 from public.showups where user_id = uid and local_date = today),
    'session', case when sid is null then null else public.showup_session_json(sid) end
  );
end
$function$
;

CREATE OR REPLACE FUNCTION public.goal_for_week(p_user uuid, p_week date)
 RETURNS smallint
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select days_per_week from goal_history
  where user_id = p_user and effective_from <= p_week
  order by effective_from desc limit 1 $function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.local_today(p_user uuid)
 RETURNS date
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select (now() at time zone coalesce((select timezone from public.profiles where id = p_user), 'Asia/Kolkata'))::date
$function$
;

CREATE OR REPLACE FUNCTION public.mascot_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at := now();
  return new;
end
$function$
;

CREATE OR REPLACE FUNCTION public.passes_used_in_month(p_user uuid, p_month date)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select count(*)::int from public.week_pauses
  where user_id = p_user and used_month = date_trunc('month', p_month)::date
$function$
;

CREATE OR REPLACE FUNCTION public.record_showup(p_gym uuid, p_lat double precision, p_lng double precision, p_accuracy integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
  tbl name;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        SELECT c.relname INTO tbl FROM pg_catalog.pg_class c WHERE c.oid = cmd.objid;
        EXECUTE format('alter table if exists %I.%I enable row level security', cmd.schema_name, tbl);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_my_timezone(p_tz text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if p_tz is null or not exists (select 1 from pg_timezone_names where name = p_tz) then
    raise exception 'invalid_timezone';
  end if;
  update public.profiles
     set timezone = p_tz, updated_at = now()
   where id = uid and timezone is distinct from p_tz;
end
$function$
;

CREATE OR REPLACE FUNCTION public.set_place_search_mode(new_mode text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.set_showup_local_date()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare tz text;
begin
  select timezone into tz from profiles where id = new.user_id;
  new.local_date := (new.occurred_at at time zone coalesce(tz,'Asia/Kolkata'))::date;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_weekly_goal(p_days integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.showup_checkpoints(p_duration integer, p_interval integer)
 RETURNS integer[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case
    when p_interval <= 0 then array[p_duration]
    else coalesce((select array_agg(c order by c) from generate_series(p_interval, p_duration - 1, p_interval) c),
                  '{}'::int[]) || array[p_duration]
  end
$function$
;

CREATE OR REPLACE FUNCTION public.showup_grace_seconds()
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$ select 1800 $function$
;

CREATE OR REPLACE FUNCTION public.showup_session_json(p_session uuid)
 RETURNS json
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select json_build_object(
    'session_id', s.id,
    'status', s.status,
    'started_at', s.started_at,
    'server_now', now(),
    'elapsed_seconds', floor(extract(epoch from (now() - s.started_at)))::int,
    'duration_seconds', s.duration_seconds,
    'interval_seconds', s.interval_seconds,
    'max_missed_checks', s.max_missed_checks,
    'checkpoints', (
      select coalesce(json_agg(json_build_object(
               'at_seconds', c,
               'needs_location', s.interval_seconds > 0,
               'done', exists (select 1 from public.showup_checks k
                                where k.session_id = s.id and k.due_at_seconds = c and k.passed)
             ) order by c), '[]'::json)
      from unnest(public.showup_checkpoints(s.duration_seconds, s.interval_seconds)) c),
    'location_checks_done', (select count(*) from public.showup_checks k where k.session_id = s.id and k.passed),
    'location_checks_total', case when s.interval_seconds > 0
        then 1 + cardinality(public.showup_checkpoints(s.duration_seconds, s.interval_seconds)) else 1 end
  )
  from public.showup_sessions s
  where s.id = p_session
$function$
;

CREATE OR REPLACE FUNCTION public.start_showup(p_gym uuid, p_lat double precision, p_lng double precision, p_accuracy integer DEFAULT NULL::integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  g record;
  dist float8;
  limit_m int;
  acc_limit int;
  today date;
  sid uuid;
  dur int;
  itv int;
  maxm int;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid_position: latitude and longitude are required';
  end if;

  -- two quick taps (or two devices) take turns
  perform pg_advisory_xact_lock(hashtextextended('start_showup:' || uid::text, 0));

  update public.showup_sessions
     set status = 'expired', ended_at = now()
   where user_id = uid and status = 'running'
     and now() > started_at + ((duration_seconds + public.showup_grace_seconds()) * interval '1 second');

  -- a timer is already running: hand it back so a refresh or a second device resumes it
  select id into sid from public.showup_sessions where user_id = uid and status = 'running';
  if sid is not null then
    return json_build_object('already_done', false, 'session', public.showup_session_json(sid));
  end if;

  -- one Showup per local day
  today := public.local_today(uid);
  if exists (select 1 from public.showups where user_id = uid and local_date = today) then
    return json_build_object('already_done', true, 'session', null);
  end if;

  select id, latitude, longitude into g
    from public.gyms where id = p_gym and user_id = uid and is_active;
  if not found then raise exception 'gym_not_found: that is not your active gym'; end if;

  acc_limit := greatest(public.cfg_int('config.max_location_accuracy_meters', 0), 0);
  if acc_limit > 0 and coalesce(p_accuracy, 0) > acc_limit then
    raise exception 'poor_accuracy: the location signal is too weak';
  end if;

  dist := public.calendar_distance_meters(p_lat, p_lng, g.latitude, g.longitude);
  limit_m := public.cfg_int('config.max_gym_distance_meters', 100);
  if dist > limit_m then raise exception 'too_far'; end if;

  dur  := least(greatest(public.cfg_int('config.showup_duration_seconds', 900), 1), 10800);
  itv  := greatest(public.cfg_int('config.showup_check_interval_seconds', 300), 0);
  maxm := greatest(public.cfg_int('config.showup_max_missed_checks', 0), 0);

  insert into public.showup_sessions
    (user_id, gym_id, duration_seconds, interval_seconds, max_missed_checks, start_distance_meters, start_accuracy_meters)
  values (uid, g.id, dur, itv, maxm, round(dist)::int, greatest(coalesce(p_accuracy, 0), 0))
  returning id into sid;

  insert into public.showup_checks (session_id, user_id, checkpoint_no, due_at_seconds, elapsed_seconds, distance_meters, accuracy_meters, passed)
  values (sid, uid, 0, 0, 0, round(dist)::int, p_accuracy, true);

  return json_build_object('already_done', false, 'session', public.showup_session_json(sid));
end
$function$
;

CREATE OR REPLACE FUNCTION public.use_pause(p_week_start date, p_reason text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.week_start_of(p_day date)
 RETURNS date
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select (p_day - (extract(isodow from p_day)::int - 1))::date
$function$
;

CREATE OR REPLACE FUNCTION public.week_summary(p_user uuid, p_from date, p_to date)
 RETURNS TABLE(week_start date, goal_days integer, showup_days integer, status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

-- FUNCTION PERMISSIONS (anon / authenticated)

cancel_showup  authenticated  EXECUTE
cfg  anon  EXECUTE
cfg  authenticated  EXECUTE
check_showup  authenticated  EXECUTE
cms_touch_updated_at  anon  EXECUTE
cms_touch_updated_at  authenticated  EXECUTE
complete_quickstart  authenticated  EXECUTE
effective_place_search_mode  authenticated  EXECUTE
end_pause  authenticated  EXECUTE
get_app_config  authenticated  EXECUTE
get_calendar  authenticated  EXECUTE
get_cms_content  anon  EXECUTE
get_cms_content  authenticated  EXECUTE
get_goal_state  authenticated  EXECUTE
get_home_summary  authenticated  EXECUTE
get_mascot_content  anon  EXECUTE
get_mascot_content  authenticated  EXECUTE
get_pause_state  authenticated  EXECUTE
get_showup_state  authenticated  EXECUTE
goal_for_week  anon  EXECUTE
goal_for_week  authenticated  EXECUTE
mascot_touch_updated_at  anon  EXECUTE
mascot_touch_updated_at  authenticated  EXECUTE
record_showup  authenticated  EXECUTE
rls_auto_enable  anon  EXECUTE
rls_auto_enable  authenticated  EXECUTE
set_my_timezone  authenticated  EXECUTE
set_place_search_mode  authenticated  EXECUTE
set_showup_local_date  anon  EXECUTE
set_showup_local_date  authenticated  EXECUTE
set_updated_at  anon  EXECUTE
set_updated_at  authenticated  EXECUTE
set_weekly_goal  authenticated  EXECUTE
start_showup  authenticated  EXECUTE
use_pause  authenticated  EXECUTE

-- TRIGGERS

CREATE TRIGGER cms_touch BEFORE UPDATE ON public.cms FOR EACH ROW EXECUTE FUNCTION cms_touch_updated_at();
CREATE TRIGGER gyms_set_updated_at BEFORE UPDATE ON public.gyms FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER mascot_images_touch BEFORE UPDATE ON public.mascot_images FOR EACH ROW EXECUTE FUNCTION mascot_touch_updated_at();
CREATE TRIGGER mascot_messages_touch BEFORE UPDATE ON public.mascot_messages FOR EACH ROW EXECUTE FUNCTION mascot_touch_updated_at();
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER showups_set_local_date BEFORE INSERT ON public.showups FOR EACH ROW EXECUTE FUNCTION set_showup_local_date();

-- ROW LEVEL SECURITY POLICIES

cms  "public read"  SELECT  roles={anon,authenticated}  using=true  check=-
config  "Enable read access for all users"  SELECT  roles={public}  using=true  check=-
config  "cms: public can read landing page content"  SELECT  roles={anon,authenticated}  using=(content_type = ANY (ARRAY['lpage_banner'::text, 'tnc'::text]))  check=-
config  "config admin write"  ALL  roles={public}  using=(EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin)))  check=(EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin)))
config  "config read"  SELECT  roles={public}  using=true  check=-
goal_history  "own rows"  SELECT  roles={public}  using=(user_id = auth.uid())  check=-
gyms  "gyms: insert own"  INSERT  roles={authenticated}  using=-  check=(user_id = ( SELECT auth.uid() AS uid))
gyms  "gyms: read own"  SELECT  roles={authenticated}  using=(user_id = ( SELECT auth.uid() AS uid))  check=-
gyms  "gyms: update own"  UPDATE  roles={authenticated}  using=(user_id = ( SELECT auth.uid() AS uid))  check=(user_id = ( SELECT auth.uid() AS uid))
mascot_images  "public read"  SELECT  roles={anon,authenticated}  using=true  check=-
mascot_messages  "public read"  SELECT  roles={anon,authenticated}  using=true  check=-
profiles  "profiles: read own"  SELECT  roles={authenticated}  using=(id = ( SELECT auth.uid() AS uid))  check=-
profiles  "profiles: update own"  UPDATE  roles={authenticated}  using=(id = ( SELECT auth.uid() AS uid))  check=(id = ( SELECT auth.uid() AS uid))
showup_checks  "own rows"  SELECT  roles={public}  using=(user_id = ( SELECT auth.uid() AS uid))  check=-
showup_sessions  "own rows"  SELECT  roles={public}  using=(user_id = ( SELECT auth.uid() AS uid))  check=-
showups  "showups: insert own at own active gym"  INSERT  roles={authenticated}  using=-  check=((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM gyms
  WHERE ((gyms.id = showups.gym_id) AND (gyms.user_id = ( SELECT auth.uid() AS uid)) AND gyms.is_active))))
showups  "showups: read own"  SELECT  roles={authenticated}  using=(user_id = ( SELECT auth.uid() AS uid))  check=-
week_pauses  "own rows"  SELECT  roles={public}  using=(user_id = auth.uid())  check=-
weekly_results  "own rows"  SELECT  roles={public}  using=(user_id = auth.uid())  check=-

-- INDEXES

CREATE INDEX cms_category_order ON public.cms USING btree (category, is_active, "position");
CREATE UNIQUE INDEX cms_category_slug ON public.cms USING btree (category, slug);
CREATE UNIQUE INDEX cms_pkey ON public.cms USING btree (id);
CREATE UNIQUE INDEX config_pkey ON public.config USING btree (id);
CREATE UNIQUE INDEX goal_history_pkey ON public.goal_history USING btree (id);
CREATE UNIQUE INDEX goal_history_user_id_effective_from_key ON public.goal_history USING btree (user_id, effective_from);
CREATE UNIQUE INDEX gyms_id_user_id_key ON public.gyms USING btree (id, user_id);
CREATE UNIQUE INDEX gyms_one_active_per_user_idx ON public.gyms USING btree (user_id) WHERE is_active;
CREATE UNIQUE INDEX gyms_pkey ON public.gyms USING btree (id);
CREATE INDEX gyms_user_id_created_at_idx ON public.gyms USING btree (user_id, created_at DESC);
CREATE UNIQUE INDEX mascot_images_pkey ON public.mascot_images USING btree (key);
CREATE INDEX mascot_messages_lookup ON public.mascot_messages USING btree (locale, is_active, priority);
CREATE UNIQUE INDEX mascot_messages_pkey ON public.mascot_messages USING btree (id);
CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id);
CREATE UNIQUE INDEX showup_checks_pkey ON public.showup_checks USING btree (id);
CREATE UNIQUE INDEX showup_checks_session_id_due_at_seconds_key ON public.showup_checks USING btree (session_id, due_at_seconds);
CREATE UNIQUE INDEX showup_sessions_one_running ON public.showup_sessions USING btree (user_id) WHERE (status = 'running'::text);
CREATE UNIQUE INDEX showup_sessions_pkey ON public.showup_sessions USING btree (id);
CREATE INDEX showups_gym_id_user_id_idx ON public.showups USING btree (gym_id, user_id);
CREATE INDEX showups_occurred_at_idx ON public.showups USING btree (occurred_at);
CREATE UNIQUE INDEX showups_one_per_day ON public.showups USING btree (user_id, local_date);
CREATE UNIQUE INDEX showups_pkey ON public.showups USING btree (id);
CREATE INDEX showups_user_id_occurred_at_idx ON public.showups USING btree (user_id, occurred_at DESC);
CREATE UNIQUE INDEX week_pauses_pkey ON public.week_pauses USING btree (id);
CREATE UNIQUE INDEX week_pauses_user_id_week_start_key ON public.week_pauses USING btree (user_id, week_start);
CREATE UNIQUE INDEX weekly_results_pkey ON public.weekly_results USING btree (user_id, week_start);

-- COLUMNS

cms.id  bigint  null=NO  default=-
cms.category  text  null=NO  default=-
cms.position  integer  null=NO  default=-
cms.slug  text  null=YES  default=-
cms.heading  text  null=NO  default=-
cms.subheading  text  null=NO  default=''::text
cms.image_url  text  null=NO  default=''::text
cms.image_alt  text  null=YES  default=-
cms.is_active  boolean  null=NO  default=true
cms.created_at  timestamp with time zone  null=NO  default=now()
cms.updated_at  timestamp with time zone  null=NO  default=now()
config.id  bigint  null=NO  default=-
config.created_at  timestamp with time zone  null=NO  default=now()
config.content_type  text  null=YES  default=-
config.value  text  null=YES  default=-
config.remark  text  null=YES  default=-
goal_history.id  uuid  null=NO  default=gen_random_uuid()
goal_history.user_id  uuid  null=NO  default=-
goal_history.days_per_week  smallint  null=NO  default=-
goal_history.effective_from  date  null=NO  default=-
goal_history.created_at  timestamp with time zone  null=NO  default=now()
gyms.id  uuid  null=NO  default=gen_random_uuid()
gyms.user_id  uuid  null=NO  default=auth.uid()
gyms.name  text  null=NO  default=-
gyms.google_place_id  text  null=YES  default=-
gyms.address  text  null=YES  default=-
gyms.latitude  double precision  null=NO  default=-
gyms.longitude  double precision  null=NO  default=-
gyms.is_active  boolean  null=NO  default=true
gyms.created_at  timestamp with time zone  null=NO  default=now()
gyms.updated_at  timestamp with time zone  null=NO  default=now()
mascot_images.key  text  null=NO  default=-
mascot_images.kind  text  null=NO  default=-
mascot_images.image_url  text  null=NO  default=''::text
mascot_images.alt_text  text  null=YES  default=-
mascot_images.width  integer  null=YES  default=-
mascot_images.height  integer  null=YES  default=-
mascot_images.is_active  boolean  null=NO  default=true
mascot_images.updated_at  timestamp with time zone  null=NO  default=now()
mascot_messages.id  bigint  null=NO  default=-
mascot_messages.key  text  null=NO  default=-
mascot_messages.locale  text  null=NO  default='en'::text
mascot_messages.priority  integer  null=NO  default=-
mascot_messages.expression  text  null=NO  default=-
mascot_messages.message  text  null=NO  default=-
mascot_messages.scenario  text  null=YES  default=-
mascot_messages.shown_when  text  null=YES  default=-
mascot_messages.is_active  boolean  null=NO  default=true
mascot_messages.created_at  timestamp with time zone  null=NO  default=now()
mascot_messages.updated_at  timestamp with time zone  null=NO  default=now()
profiles.id  uuid  null=NO  default=-
profiles.first_name  text  null=YES  default=-
profiles.last_name  text  null=YES  default=-
profiles.date_of_birth  date  null=YES  default=-
profiles.is_admin  boolean  null=NO  default=false
profiles.created_at  timestamp with time zone  null=NO  default=now()
profiles.updated_at  timestamp with time zone  null=NO  default=now()
profiles.place_search_mode  text  null=NO  default='fitness_only'::text
profiles.timezone  text  null=NO  default='Asia/Kolkata'::text
profiles.quickstart_completed_at  timestamp with time zone  null=YES  default=-
showup_checks.id  uuid  null=NO  default=gen_random_uuid()
showup_checks.session_id  uuid  null=NO  default=-
showup_checks.user_id  uuid  null=NO  default=-
showup_checks.checkpoint_no  integer  null=NO  default=-
showup_checks.due_at_seconds  integer  null=NO  default=-
showup_checks.elapsed_seconds  integer  null=NO  default=-
showup_checks.checked_at  timestamp with time zone  null=NO  default=now()
showup_checks.distance_meters  integer  null=YES  default=-
showup_checks.accuracy_meters  integer  null=YES  default=-
showup_checks.passed  boolean  null=NO  default=-
showup_sessions.id  uuid  null=NO  default=gen_random_uuid()
showup_sessions.user_id  uuid  null=NO  default=-
showup_sessions.gym_id  uuid  null=NO  default=-
showup_sessions.started_at  timestamp with time zone  null=NO  default=now()
showup_sessions.duration_seconds  integer  null=NO  default=-
showup_sessions.interval_seconds  integer  null=NO  default=-
showup_sessions.max_missed_checks  integer  null=NO  default=-
showup_sessions.start_distance_meters  integer  null=YES  default=-
showup_sessions.start_accuracy_meters  integer  null=YES  default=-
showup_sessions.status  text  null=NO  default='running'::text
showup_sessions.ended_at  timestamp with time zone  null=YES  default=-
showup_sessions.showup_id  uuid  null=YES  default=-
showups.id  uuid  null=NO  default=gen_random_uuid()
showups.user_id  uuid  null=NO  default=auth.uid()
showups.gym_id  uuid  null=NO  default=-
showups.occurred_at  timestamp with time zone  null=NO  default=now()
showups.distance_meters  integer  null=YES  default=-
showups.location_accuracy_meters  integer  null=YES  default=-
showups.verification_method  text  null=NO  default='gps'::text
showups.created_at  timestamp with time zone  null=NO  default=now()
showups.local_date  date  null=YES  default=-
week_pauses.id  uuid  null=NO  default=gen_random_uuid()
week_pauses.user_id  uuid  null=NO  default=-
week_pauses.week_start  date  null=NO  default=-
week_pauses.used_month  date  null=NO  default=-
week_pauses.reason  text  null=YES  default=-
week_pauses.created_at  timestamp with time zone  null=NO  default=now()
week_pauses.ended_at  timestamp with time zone  null=YES  default=-
weekly_results.user_id  uuid  null=NO  default=-
weekly_results.week_start  date  null=NO  default=-
weekly_results.goal_days  smallint  null=NO  default=-
weekly_results.showup_days  smallint  null=NO  default=-
weekly_results.status  text  null=NO  default=-
weekly_results.weeks_in_a_row  smallint  null=NO  default=-
weekly_results.closed_at  timestamp with time zone  null=NO  default=now()