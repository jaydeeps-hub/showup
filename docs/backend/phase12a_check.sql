-- PHASE 12a CHECK. Rollback only: it ends with an error on purpose, so NOTHING is saved
-- (the three test people below disappear too). Read the error panel: every line should match its "expect".
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  r json; t text; report text := '';
begin
  -- three throwaway people
  insert into auth.users (id, email) values
    (a, 'zzsq-a@example.invalid'), (b, 'zzsq-b@example.invalid'), (c, 'zzsq-c@example.invalid');
  insert into profiles (id) values (a), (b), (c) on conflict (id) do nothing;
  update profiles set username = 'zzsq_amy', first_name = 'Amy',   last_name = 'Tester' where id = a;
  update profiles set username = 'zzsq_ben', first_name = 'Benito', last_name = null    where id = b;
  update profiles set username = 'zzsq_cat', first_name = 'Cat',   last_name = 'Zzqlast' where id = c;
  insert into config (content_type, value) values ('config.squad_max_size', '50'), ('config.squad_request_cooldown_days', '7');

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  set local role authenticated;

  -- search
  r := search_people('zzsq');
  report := report || '1 search "zzsq" as amy (expect zzsq_ben, zzsq_cat; never amy): '
    || (select string_agg(x->>'username', ', ') from json_array_elements(r->'results') x) || E'\n';
  report := report || '2 result fields (expect first_name,last_name,relation,username; no stats): '
    || (select string_agg(k, ',' order by k) from json_object_keys(r->'results'->0) k) || E'\n';
  report := report || '3 search "@ZZSQ_BEN" (expect zzsq_ben first): ' || (search_people('@ZZSQ_BEN')->'results'->0->>'username') || E'\n';
  report := report || '4 search by last name "zzqlast" (expect zzsq_cat): ' || (select string_agg(x->>'username', ', ') from json_array_elements(search_people('zzqlast')->'results') x) || E'\n';
  report := report || '5 search 1 letter "z" (expect 0 results): ' || json_array_length(search_people('z')->'results') || E'\n';
  report := report || '6 search "zzsq%" (expect 0: % is not a wildcard): ' || json_array_length(search_people('zzsq%')->'results') || E'\n';

  -- request, duplicate, self, unknown
  report := report || '7 amy asks ben (expect requested): ' || (send_squad_request('zzsq_ben')->>'status') || E'\n';
  begin perform send_squad_request('zzsq_ben'); report := report || E'8 second ask NOT rejected (bad)\n';
  exception when others then report := report || '8 second ask (expect already_requested): ' || sqlerrm || E'\n'; end;
  begin perform send_squad_request('zzsq_amy'); report := report || E'9 self NOT rejected (bad)\n';
  exception when others then report := report || '9 ask yourself (expect cannot_add_self): ' || sqlerrm || E'\n'; end;
  begin perform send_squad_request('zzsq_nobody_here'); report := report || E'10 unknown NOT rejected (bad)\n';
  exception when others then report := report || '10 unknown name (expect user_not_found): ' || sqlerrm || E'\n'; end;
  report := report || '11 ben in amy''s search (expect requested): '
    || (select x->>'relation' from json_array_elements(search_people('zzsq_ben')->'results') x where x->>'username' = 'zzsq_ben') || E'\n';

  -- ben's side: sees the request, asks back = accepted
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  r := get_squad();
  report := report || '12 ben incoming (expect 1, zzsq_amy): ' || (r->>'incoming_count') || ', ' || (r->'incoming'->0->>'username') || E'\n';
  report := report || '13 amy in ben''s search (expect incoming): '
    || (select x->>'relation' from json_array_elements(search_people('zzsq_amy')->'results') x where x->>'username' = 'zzsq_amy') || E'\n';
  report := report || '14 ben asks amy back (expect squad): ' || (send_squad_request('zzsq_amy')->>'status') || E'\n';

  -- amy's squad shows ben with stats
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  r := get_squad();
  report := report || '15 amy squad (expect 1, zzsq_ben, stats 0 and 0): ' || (r->>'squad_count') || ', '
    || (r->'squad'->0->>'username') || ', ' || (r->'squad'->0->>'total_showups') || ' and ' || (r->'squad'->0->>'weeks_in_a_row') || E'\n';

  -- cat declines; amy must wait; cat may still ask amy
  report := report || '16 amy asks cat (expect requested): ' || (send_squad_request('zzsq_cat')->>'status') || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', c::text, true);
  report := report || '17 cat declines (expect declined): ' || (respond_squad_request('zzsq_amy', false)->>'status') || E'\n';
  begin perform respond_squad_request('zzsq_amy', true); report := report || E'18 accept after decline NOT rejected (bad)\n';
  exception when others then report := report || '18 accept a declined request (expect no_request): ' || sqlerrm || E'\n'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  report := report || '19 amy sees cat as (expect none): '
    || (select x->>'relation' from json_array_elements(search_people('zzsq_cat')->'results') x where x->>'username' = 'zzsq_cat') || E'\n';
  begin perform send_squad_request('zzsq_cat'); report := report || E'20 re-ask NOT rejected (bad)\n';
  exception when others then report := report || '20 amy asks cat again (expect request_cooldown: 7 day(s) left): ' || sqlerrm || E'\n'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', c::text, true);
  report := report || '21 cat asks amy (expect requested): ' || (send_squad_request('zzsq_amy')->>'status') || E'\n';
  report := report || '22 cat cancels it (expect true): ' || cancel_squad_request('zzsq_amy')::text || E'\n';
  report := report || '23 cat cancels again (expect false): ' || cancel_squad_request('zzsq_amy')::text || E'\n';

  -- squad limit
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  reset role; insert into config (content_type, value) values ('config.squad_max_size', '1'); set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', c::text, true);
  report := report || '24 cat asks amy, whose squad is full at 1 (expect requested: only accepting is blocked): '
    || (send_squad_request('zzsq_amy')->>'status') || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  begin perform respond_squad_request('zzsq_cat', true); report := report || E'25 accept into full squad NOT rejected (bad)\n';
  exception when others then report := report || '25 amy accepts cat with a full squad (expect squad_full): ' || sqlerrm || E'\n'; end;
  reset role; insert into config (content_type, value) values ('config.squad_max_size', '50'); set local role authenticated;

  -- remove
  report := report || '26 amy removes ben (expect true): ' || remove_from_squad('zzsq_ben')::text || E'\n';
  report := report || '27 amy squad count (expect 0): ' || (get_squad()->>'squad_count') || E'\n';

  -- privacy: no direct table access, no access before sign-in
  begin perform 1 from squad_links limit 1; report := report || E'28 table readable directly (bad)\n';
  exception when others then report := report || '28 read squad_links directly (expect permission denied): ' || sqlerrm || E'\n'; end;
  reset role; set local role anon;
  begin perform search_people('zzsq'); report := report || E'29 signed-out search allowed (bad)\n';
  exception when others then report := report || '29 search when signed out (expect permission denied): ' || sqlerrm || E'\n'; end;
  reset role;

  raise exception E'PHASE 12a TEST REPORT (nothing was saved)\n%', report;
end $$;
