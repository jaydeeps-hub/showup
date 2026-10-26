-- Phase 6: the timed Show Up flow (start, location checks, finish).
-- Safe to run twice. Does not touch existing tables, record_showup or any app data.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
create table if not exists public.showup_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gym_id uuid not null references public.gyms(id) on delete cascade,
  started_at timestamptz not null default now(),
  -- the timing rules are copied from config when the session starts, so changing
  -- config while someone is mid-timer never changes their running session
  duration_seconds int not null,
  interval_seconds int not null,
  max_missed_checks int not null,
  start_distance_meters int,
  start_accuracy_meters int,
  status text not null default 'running'
    check (status in ('running','completed','left_early','missed_checks','expired','cancelled')),
  ended_at timestamptz,
  showup_id uuid references public.showups(id) on delete set null
);

-- at most ONE running session per user, enforced by the database itself
create unique index if not exists showup_sessions_one_running
  on public.showup_sessions (user_id) where status = 'running';

create table if not exists public.showup_checks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.showup_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  checkpoint_no int not null,          -- 0 = the tap on Show Up, then 1, 2, 3 ...
  due_at_seconds int not null,         -- when it was scheduled, in seconds after the start
  elapsed_seconds int not null,        -- when it actually happened (server clock)
  checked_at timestamptz not null default now(),
  distance_meters int,
  accuracy_meters int,
  passed boolean not null,
  unique (session_id, due_at_seconds)
);

alter table public.showup_sessions enable row level security;
alter table public.showup_checks   enable row level security;

drop policy if exists "own rows" on public.showup_sessions;
drop policy if exists "own rows" on public.showup_checks;
create policy "own rows" on public.showup_sessions for select using (user_id = (select auth.uid()));
create policy "own rows" on public.showup_checks   for select using (user_id = (select auth.uid()));

-- the app can read its own rows, and can never write directly
revoke all on public.showup_sessions, public.showup_checks from anon, authenticated;
grant select on public.showup_sessions, public.showup_checks to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Internal helpers (not callable from the app)
-- ---------------------------------------------------------------------------

-- How long after the timer ends the user may still finish before the session expires.
create or replace function public.showup_grace_seconds()
returns int
language sql
immutable
set search_path = public
as $$ select 1800 $$;

-- When the checks happen, in seconds after the start.
--   interval > 0: every `interval` seconds, plus one at the very end.  (900, 300) -> {300,600,900}
--   interval = 0: no location checks after the first; just the end.    (900, 0)   -> {900}
create or replace function public.showup_checkpoints(p_duration int, p_interval int)
returns int[]
language sql
immutable
set search_path = public
as $$
  select case
    when p_interval <= 0 then array[p_duration]
    else coalesce((select array_agg(c order by c) from generate_series(p_interval, p_duration - 1, p_interval) c),
                  '{}'::int[]) || array[p_duration]
  end
$$;

-- The one JSON shape the app gets for a session.
create or replace function public.showup_session_json(p_session uuid)
returns json
language sql
security definer
set search_path = public
as $$
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
$$;

-- ---------------------------------------------------------------------------
-- 3. get_showup_state(): what Home needs on load (also resumes a running timer)
-- ---------------------------------------------------------------------------
create or replace function public.get_showup_state()
returns json
language plpgsql
security definer
set search_path = public
as $$
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
$$;

-- ---------------------------------------------------------------------------
-- 4. start_showup(): the tap on SHOW UP (this is location check number 1)
-- ---------------------------------------------------------------------------
create or replace function public.start_showup(p_gym uuid, p_lat float8, p_lng float8, p_accuracy int default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
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
$$;

-- ---------------------------------------------------------------------------
-- 5. check_showup(): called at every scheduled check, including the last one
-- ---------------------------------------------------------------------------
-- Result values: running, not_due, poor_accuracy, completed, left_early, missed_checks, expired, cancelled.
-- A "bad" check is a scheduled check (before the last) that has no passing reading: it was either
-- missed (no reading arrived) or failed (reading too far). Up to max_missed_checks are forgiven.
create or replace function public.check_showup(p_session uuid, p_lat float8 default null, p_lng float8 default null, p_accuracy int default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
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
$$;

-- ---------------------------------------------------------------------------
-- 6. cancel_showup(): the user stops the timer
-- ---------------------------------------------------------------------------
create or replace function public.cancel_showup(p_session uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
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
$$;

-- ---------------------------------------------------------------------------
-- 7. Config defaults (only inserted if the key has never been set)
-- ---------------------------------------------------------------------------
insert into public.cms (content_type, value)
select v.k, v.val
from (values
  ('config.showup_duration_seconds',      '900'),
  ('config.showup_check_interval_seconds','300'),
  ('config.showup_max_missed_checks',     '0'),
  ('config.max_location_accuracy_meters', '0')
) as v(k, val)
where not exists (select 1 from public.cms c where c.content_type = v.k);

-- ---------------------------------------------------------------------------
-- 8. Who may call what
-- ---------------------------------------------------------------------------
revoke all on function public.showup_grace_seconds() from public, anon, authenticated;
revoke all on function public.showup_checkpoints(int, int) from public, anon, authenticated;
revoke all on function public.showup_session_json(uuid) from public, anon, authenticated;
revoke all on function public.get_showup_state() from public, anon, authenticated;
revoke all on function public.start_showup(uuid, float8, float8, int) from public, anon, authenticated;
revoke all on function public.check_showup(uuid, float8, float8, int) from public, anon, authenticated;
revoke all on function public.cancel_showup(uuid) from public, anon, authenticated;

grant execute on function public.get_showup_state() to authenticated;
grant execute on function public.start_showup(uuid, float8, float8, int) to authenticated;
grant execute on function public.check_showup(uuid, float8, float8, int) to authenticated;
grant execute on function public.cancel_showup(uuid) to authenticated;