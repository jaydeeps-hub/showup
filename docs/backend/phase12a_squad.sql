-- Phase 12a: Squad (find people, squad requests, the squad list). Safe to run twice.
-- Adds ONE table (squad_links), internal helpers, six functions the app calls, and four config rows.
-- Changes no existing table, function or row.
--
-- How it works
--   * One row per PAIR of people, whichever of them asked first. status: pending -> accepted, or declined.
--   * The app never reads the table directly (it needs other people's names, which profiles' row level
--     security hides). Everything goes through the functions below, which use auth.uid() and take a
--     USERNAME for the other person, never a user id.
--   * Asking someone who already asked you makes you squad-mates at once.
--   * Declined: the request disappears for both. The person who asked can ask again after
--     config.squad_request_cooldown_days (they get request_cooldown before that).

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------
create table if not exists public.squad_links (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),   -- when the (latest) request was sent
  responded_at timestamptz,                         -- when it was accepted or declined
  check (requester_id <> addressee_id)
);

-- one row per pair, in either direction
create unique index if not exists squad_links_one_per_pair
  on public.squad_links (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists squad_links_addressee on public.squad_links (addressee_id, status);
create index if not exists squad_links_requester on public.squad_links (requester_id, status);

alter table public.squad_links enable row level security;
revoke all on public.squad_links from anon, authenticated;   -- only the functions read and write it

-- ---------------------------------------------------------------------------
-- 2. Settings (inserted only if the key has never been set; newest row wins)
-- ---------------------------------------------------------------------------
insert into public.config (content_type, value)
select v.k, v.val
from (values
  ('config.invite_url',                   'https://showup-pied.vercel.app'),
  ('config.squad_max_size',               '50'),
  ('config.squad_request_cooldown_days',  '7'),
  ('config.squad_search_max_results',     '20')
) as v(k, val)
where not exists (select 1 from public.config c where c.content_type = v.k);

-- ---------------------------------------------------------------------------
-- 3. Internal helpers (not callable from the app)
-- ---------------------------------------------------------------------------

-- '@Jay ' -> 'jay'
create or replace function public.squad_clean_username(p text)
returns text language sql immutable set search_path = public as $$
  select lower(btrim(regexp_replace(coalesce(p, ''), '^\s*@+', '')))
$$;

-- The link between two people, whichever direction it was made in.
create or replace function public.squad_link_between(a uuid, b uuid)
returns public.squad_links language sql stable security definer set search_path = public as $$
  select * from public.squad_links
  where least(requester_id, addressee_id) = least(a, b)
    and greatest(requester_id, addressee_id) = greatest(a, b)
$$;

-- How many squad-mates someone has.
create or replace function public.squad_size(p_user uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.squad_links
  where status = 'accepted' and (requester_id = p_user or addressee_id = p_user)
$$;

-- Weeks in a row right now, the same rule as get_home_summary: the last frozen week's value,
-- plus 1 once this week's goal is met. Closes finished weeks first (like get_home_summary does).
create or replace function public.squad_weeks_in_a_row(p_user uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  this_week date;
  last_closed int;
  goal int;
  n int;
begin
  perform public.close_weeks(p_user);
  this_week := public.week_start_of(public.local_today(p_user));
  select coalesce((select weeks_in_a_row from public.weekly_results
                    where user_id = p_user order by week_start desc limit 1), 0) into last_closed;
  goal := public.goal_for_week(p_user, this_week);
  select count(*) into n from public.showups
   where user_id = p_user and local_date between this_week and this_week + 6;
  return last_closed + case when goal is not null and n >= goal then 1 else 0 end;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Find people (client-callable)
-- ---------------------------------------------------------------------------
-- Searches usernames and first / last names. Fewer than 2 characters returns no results.
-- Never returns the caller, or anyone without a username. Shows NO stats for strangers.
-- relation: none | requested (you asked them) | incoming (they asked you) | squad
create or replace function public.search_people(p_query text)
returns json language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v text;
  pat text;
  lim int;
  res json;
begin
  if uid is null then raise exception 'not_signed_in'; end if;

  v := left(regexp_replace(lower(btrim(regexp_replace(coalesce(p_query, ''), '^\s*@+', ''))), '\s+', ' ', 'g'), 50);
  if char_length(v) < 2 then
    return json_build_object('query', v, 'results', '[]'::json);
  end if;

  -- % and _ are wildcards in LIKE; _ is common in usernames, so match them literally
  pat := '%' || replace(replace(replace(v, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  lim := least(greatest(public.cfg_int('config.squad_search_max_results', 20), 1), 50);

  select coalesce(json_agg(json_build_object(
           'username', x.username, 'first_name', x.first_name, 'last_name', x.last_name,
           'relation', x.relation) order by x.rank, x.username), '[]'::json)
    into res
  from (
    select p.username, p.first_name, p.last_name,
           case when p.username = v then 0
                when p.username like (substr(pat, 2)) escape '\' then 1   -- starts with
                when p.username like pat escape '\' then 2                 -- contains
                else 3 end as rank,                                        -- name match
           case when l.status = 'accepted' then 'squad'
                when l.status = 'pending' and l.requester_id = uid then 'requested'
                when l.status = 'pending' then 'incoming'
                else 'none' end as relation
    from public.profiles p
    left join lateral (select * from public.squad_link_between(uid, p.id)) l on true
    where p.id <> uid
      and p.username is not null
      and (p.username like pat escape '\'
           or lower(coalesce(p.first_name, '')) like pat escape '\'
           or lower(coalesce(p.last_name, '')) like pat escape '\'
           or lower(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))) like pat escape '\')
    order by rank, p.username
    limit lim
  ) x;

  return json_build_object('query', v, 'results', res);
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Requests (client-callable). The other person is always given by USERNAME.
-- ---------------------------------------------------------------------------

-- Returns { status: 'requested' } or { status: 'squad' } (they had already asked you).
create or replace function public.send_squad_request(p_username text)
returns json language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  them uuid;
  link public.squad_links;
  maxn int := greatest(public.cfg_int('config.squad_max_size', 50), 1);
  cool int := greatest(public.cfg_int('config.squad_request_cooldown_days', 7), 0);
  days_left int;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if (select username from public.profiles where id = uid) is null then
    raise exception 'username_required: set a username first';
  end if;

  select id into them from public.profiles where username = public.squad_clean_username(p_username);
  if them is null then raise exception 'user_not_found'; end if;
  if them = uid then raise exception 'cannot_add_self'; end if;

  -- two people tapping at the same moment take turns
  perform pg_advisory_xact_lock(hashtextextended('squad:' || least(uid, them)::text || greatest(uid, them)::text, 0));
  link := public.squad_link_between(uid, them);

  if link.id is not null then
    if link.status = 'accepted' then raise exception 'already_in_squad'; end if;
    if link.status = 'pending' and link.requester_id = uid then raise exception 'already_requested'; end if;

    if link.status = 'pending' then
      -- they asked first: asking back accepts
      if public.squad_size(uid) >= maxn then raise exception 'squad_full'; end if;
      if public.squad_size(them) >= maxn then raise exception 'their_squad_full'; end if;
      update public.squad_links set status = 'accepted', responded_at = now() where id = link.id;
      return json_build_object('status', 'squad');
    end if;

    -- declined earlier: the person who asked must wait; the person who declined may ask any time
    if link.requester_id = uid and link.responded_at > now() - cool * interval '1 day' then
      days_left := greatest(ceil(extract(epoch from (link.responded_at + cool * interval '1 day' - now())) / 86400)::int, 1);
      raise exception 'request_cooldown: % day(s) left', days_left;
    end if;
  end if;

  if public.squad_size(uid) >= maxn then raise exception 'squad_full'; end if;
  if (select count(*) from public.squad_links where requester_id = uid and status = 'pending') >= maxn then
    raise exception 'too_many_requests';
  end if;

  if link.id is not null then
    update public.squad_links
       set requester_id = uid, addressee_id = them, status = 'pending', created_at = now(), responded_at = null
     where id = link.id;
  else
    insert into public.squad_links (requester_id, addressee_id) values (uid, them);
  end if;
  return json_build_object('status', 'requested');
end
$$;

-- Accept (true) or decline (false) a request someone sent you. Returns { status: 'squad' | 'declined' }.
create or replace function public.respond_squad_request(p_username text, p_accept boolean)
returns json language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  them uuid;
  link public.squad_links;
  maxn int := greatest(public.cfg_int('config.squad_max_size', 50), 1);
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if p_accept is null then raise exception 'invalid_answer'; end if;
  select id into them from public.profiles where username = public.squad_clean_username(p_username);
  if them is null then raise exception 'no_request'; end if;

  perform pg_advisory_xact_lock(hashtextextended('squad:' || least(uid, them)::text || greatest(uid, them)::text, 0));
  link := public.squad_link_between(uid, them);
  if link.id is null or link.status <> 'pending' or link.addressee_id <> uid then
    raise exception 'no_request';
  end if;

  if p_accept then
    if public.squad_size(uid) >= maxn then raise exception 'squad_full'; end if;
    if public.squad_size(them) >= maxn then raise exception 'their_squad_full'; end if;
    update public.squad_links set status = 'accepted', responded_at = now() where id = link.id;
    return json_build_object('status', 'squad');
  end if;

  update public.squad_links set status = 'declined', responded_at = now() where id = link.id;
  return json_build_object('status', 'declined');
end
$$;

-- Take back a request you sent. True if one was cancelled, false if there was none.
create or replace function public.cancel_squad_request(p_username text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  n int;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  delete from public.squad_links l
   using public.profiles p
   where p.username = public.squad_clean_username(p_username)
     and l.requester_id = uid and l.addressee_id = p.id and l.status = 'pending';
  get diagnostics n = row_count;
  return n > 0;
end
$$;

-- Leave someone's squad (both stop seeing each other). True if removed, false if you were not squad-mates.
create or replace function public.remove_from_squad(p_username text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  them uuid;
  n int;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select id into them from public.profiles where username = public.squad_clean_username(p_username);
  if them is null then return false; end if;
  delete from public.squad_links
   where status = 'accepted'
     and least(requester_id, addressee_id) = least(uid, them)
     and greatest(requester_id, addressee_id) = greatest(uid, them);
  get diagnostics n = row_count;
  return n > 0;
end
$$;

-- ---------------------------------------------------------------------------
-- 6. The Squad page (client-callable)
-- ---------------------------------------------------------------------------
-- { squad_count, max_size, incoming_count,
--   squad:    [ { username, first_name, last_name, since, total_showups, weeks_in_a_row } ],
--   incoming: [ { username, first_name, last_name, requested_at } ],   -- they asked you
--   outgoing: [ { username, first_name, last_name, requested_at } ] }  -- you asked them
-- Stats are shown ONLY for squad-mates.
create or replace function public.get_squad()
returns json language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  sq json; inc json; outg json;
begin
  if uid is null then raise exception 'not_signed_in'; end if;

  select coalesce(json_agg(json_build_object(
           'username', s.username, 'first_name', s.first_name, 'last_name', s.last_name,
           'since', s.since, 'total_showups', s.total, 'weeks_in_a_row', s.wk)
           order by s.wk desc, s.total desc, s.username), '[]'::json)
    into sq
  from (
    select p.username, p.first_name, p.last_name, l.responded_at as since,
           (select count(*) from public.showups sh where sh.user_id = p.id)::int as total,
           public.squad_weeks_in_a_row(p.id) as wk
    from public.squad_links l
    join public.profiles p
      on p.id = case when l.requester_id = uid then l.addressee_id else l.requester_id end
    where l.status = 'accepted' and (l.requester_id = uid or l.addressee_id = uid)
  ) s;

  select coalesce(json_agg(json_build_object(
           'username', p.username, 'first_name', p.first_name, 'last_name', p.last_name,
           'requested_at', l.created_at) order by l.created_at desc), '[]'::json)
    into inc
  from public.squad_links l join public.profiles p on p.id = l.requester_id
  where l.addressee_id = uid and l.status = 'pending';

  select coalesce(json_agg(json_build_object(
           'username', p.username, 'first_name', p.first_name, 'last_name', p.last_name,
           'requested_at', l.created_at) order by l.created_at desc), '[]'::json)
    into outg
  from public.squad_links l join public.profiles p on p.id = l.addressee_id
  where l.requester_id = uid and l.status = 'pending';

  return json_build_object(
    'squad_count', json_array_length(sq),
    'max_size', greatest(public.cfg_int('config.squad_max_size', 50), 1),
    'incoming_count', json_array_length(inc),
    'squad', sq, 'incoming', inc, 'outgoing', outg);
end
$$;

-- ---------------------------------------------------------------------------
-- 7. Who may call what
-- ---------------------------------------------------------------------------
revoke all on function public.squad_clean_username(text) from public, anon, authenticated;
revoke all on function public.squad_link_between(uuid, uuid) from public, anon, authenticated;
revoke all on function public.squad_size(uuid) from public, anon, authenticated;
revoke all on function public.squad_weeks_in_a_row(uuid) from public, anon, authenticated;
revoke all on function public.search_people(text) from public, anon, authenticated;
revoke all on function public.send_squad_request(text) from public, anon, authenticated;
revoke all on function public.respond_squad_request(text, boolean) from public, anon, authenticated;
revoke all on function public.cancel_squad_request(text) from public, anon, authenticated;
revoke all on function public.remove_from_squad(text) from public, anon, authenticated;
revoke all on function public.get_squad() from public, anon, authenticated;

grant execute on function public.search_people(text) to authenticated;
grant execute on function public.send_squad_request(text) to authenticated;
grant execute on function public.respond_squad_request(text, boolean) to authenticated;
grant execute on function public.cancel_squad_request(text) to authenticated;
grant execute on function public.remove_from_squad(text) to authenticated;
grant execute on function public.get_squad() to authenticated;
