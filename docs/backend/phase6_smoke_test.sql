do $$
declare
  uid uuid; g record; sid uuid; r json; report text := '';
  near_lat float8; far_lat float8;
begin
  select user_id into uid from gyms where is_active limit 1;
  if uid is null then raise exception 'No active gym found. Add one in the app first.'; end if;
  select id, latitude, longitude into g from gyms where user_id = uid and is_active limit 1;
  near_lat := g.latitude;            -- standing at the gym
  far_lat  := g.latitude + 0.009;    -- about 1 km away

  delete from showups where user_id = uid and local_date = (now() at time zone 'Asia/Kolkata')::date;   -- rolled back later
  delete from showup_sessions where user_id = uid;
  insert into cms (content_type, value) values
    ('config.showup_duration_seconds','900'), ('config.showup_check_interval_seconds','300'), ('config.showup_max_missed_checks','0');

  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- A: the real thing: 15 minutes, a check every 5, all passing
  r := start_showup(g.id, near_lat, g.longitude, 10);
  sid := (r->'session'->>'session_id')::uuid;
  report := report || 'A start (expect running, 4 location checks): ' || (r->'session'->>'status') || ', ' || (r->'session'->>'location_checks_total') || E'\n';
  report := report || 'A too early (expect not_due): ' || (check_showup(sid, near_lat, g.longitude, 10)->>'result') || E'\n';
  reset role; update showup_sessions set started_at = started_at - interval '300 seconds' where id = sid; set local role authenticated;
  report := report || 'A at 5 min (expect running): ' || (check_showup(sid, near_lat, g.longitude, 10)->>'result') || E'\n';
  reset role; update showup_sessions set started_at = started_at - interval '300 seconds' where id = sid; set local role authenticated;
  report := report || 'A at 10 min (expect running): ' || (check_showup(sid, near_lat, g.longitude, 10)->>'result') || E'\n';
  reset role; update showup_sessions set started_at = started_at - interval '300 seconds' where id = sid; set local role authenticated;
  r := check_showup(sid, near_lat, g.longitude, 10);
  report := report || 'A at 15 min (expect completed, recorded true): ' || (r->>'result') || ', ' || (r->>'recorded') || E'\n';
  report := report || 'A start again (expect already_done true): ' || (start_showup(g.id, near_lat, g.longitude, 10)->>'already_done') || E'\n';

  -- B: walked away before the 5 minute check
  reset role; delete from showups where user_id = uid; delete from showup_sessions where user_id = uid; set local role authenticated;
  sid := (start_showup(g.id, near_lat, g.longitude, 10)->'session'->>'session_id')::uuid;
  reset role; update showup_sessions set started_at = started_at - interval '300 seconds' where id = sid; set local role authenticated;
  report := report || 'B 1 km away at 5 min (expect left_early): ' || (check_showup(sid, far_lat, g.longitude, 10)->>'result') || E'\n';

  -- C: phone locked, mid checks missed, strict
  sid := (start_showup(g.id, near_lat, g.longitude, 10)->'session'->>'session_id')::uuid;
  reset role; update showup_sessions set started_at = started_at - interval '900 seconds' where id = sid; set local role authenticated;
  report := report || 'C only the last check, strict (expect missed_checks): ' || (check_showup(sid, near_lat, g.longitude, 10)->>'result') || E'\n';

  -- D: test mode: 10 second timer, location checked once
  reset role; delete from showups where user_id = uid; delete from showup_sessions where user_id = uid;
  insert into cms (content_type, value) values ('config.showup_duration_seconds','10'), ('config.showup_check_interval_seconds','0');
  set local role authenticated;
  r := start_showup(g.id, near_lat, g.longitude, 10); sid := (r->'session'->>'session_id')::uuid;
  report := report || 'D start (expect running, 1 location check, 1 checkpoint): ' || (r->'session'->>'status') || ', ' || (r->'session'->>'location_checks_total') || ', ' || json_array_length(r->'session'->'checkpoints') || E'\n';
  reset role; update showup_sessions set started_at = started_at - interval '10 seconds' where id = sid; set local role authenticated;
  r := check_showup(sid);
  report := report || 'D after 10 s, no coordinates needed (expect completed): ' || (r->>'result') || E'\n';

  -- E: a stranger tries to use your session
  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  begin perform check_showup(sid, near_lat, g.longitude, 10); report := report || E'E other user NOT blocked (bad)\n';
  exception when others then report := report || 'E other user (expect session_not_found): ' || sqlerrm || E'\n'; end;

  reset role;
  raise exception E'PHASE 6 TEST REPORT (nothing was saved)\n%', report;
end $$;