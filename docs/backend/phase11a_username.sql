-- Phase 11a: usernames (step 1 of the social features).
-- Adds profiles.username (unique, validated), a reserved-names list, a guard so only the server functions
-- can change it, and the functions the app calls. Safe to run twice.
--
-- NOTHING here sets a username for an existing user: every current profile keeps an empty username
-- until you set it yourself. The database still checks every name you set by hand
-- (format and uniqueness always apply).

-- ---------------------------------------------------------------------------
-- 1. Columns and rules on profiles
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists username text,
  add column if not exists username_changed_at timestamptz;

-- 3 to 20 characters, lowercase letters, digits and underscores, starting with a letter.
-- Only lowercase is allowed in the column, so the unique index below is automatically case-insensitive.
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.profiles'::regclass and conname = 'profiles_username_format') then
    alter table public.profiles
      add constraint profiles_username_format check (username ~ '^[a-z][a-z0-9_]{2,19}$');
  end if;
end
$$;

-- many people can have an empty username; two people can never share one
create unique index if not exists profiles_username_key on public.profiles (username);

comment on column public.profiles.username is 'Public handle. 3-20 chars, a-z 0-9 _, starts with a letter, unique. Change only through set_username().';
comment on column public.profiles.username_changed_at is 'When the person last changed their username with set_username(). Empty if it was set by hand.';

-- ---------------------------------------------------------------------------
-- 2. Names nobody can pick. Add your own rows any time (lowercase, 3-20 characters).
--    They are enforced in set_username(); you can still set one by hand in the SQL editor
--    (for example for an official account).
-- ---------------------------------------------------------------------------
create table if not exists public.reserved_usernames (
  name text primary key check (name = lower(btrim(name)) and length(name) >= 3),
  note text
);

alter table public.reserved_usernames enable row level security;
revoke all on public.reserved_usernames from anon, authenticated;

insert into public.reserved_usernames (name, note)
select v.name, 'seeded in Phase 11a'
from (values
  ('admin'), ('administrator'), ('root'), ('system'), ('support'), ('help'), ('helpdesk'), ('staff'), ('team'),
  ('official'), ('moderator'), ('mod'), ('mods'), ('owner'), ('ceo'), ('coach'), ('coaches'),
  ('showup'), ('showups'), ('showupapp'), ('squad'), ('squads'), ('friend'), ('friends'),
  ('feed'), ('explore'), ('search'), ('discover'), ('notifications'), ('settings'), ('profile'), ('profiles'),
  ('home'), ('login'), ('logout'), ('signin'), ('signup'), ('register'), ('join'), ('invite'),
  ('terms'), ('privacy'), ('about'), ('contact'), ('security'), ('billing'), ('payments'), ('legal'),
  ('press'), ('careers'), ('blog'), ('news'), ('status'), ('abuse'), ('report'),
  ('api'), ('app'), ('www'), ('mail'), ('email'), ('null'), ('undefined'), ('anonymous'),
  ('user'), ('users'), ('you'), ('everyone'), ('all'), ('gym'), ('gyms')
) as v(name)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Guard: the app can never write username directly, only through set_username()
-- ---------------------------------------------------------------------------
create or replace function public.profiles_guard_username()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- the app's own roles. set_username() runs as the function owner, so it is not affected.
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      if new.username is not null or new.username_changed_at is not null then
        raise exception 'username_locked: use set_username()';
      end if;
    elsif new.username is distinct from old.username
       or new.username_changed_at is distinct from old.username_changed_at then
      raise exception 'username_locked: use set_username()';
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists profiles_guard_username on public.profiles;
create trigger profiles_guard_username before insert or update on public.profiles
  for each row execute function public.profiles_guard_username();

-- ---------------------------------------------------------------------------
-- 4. Internal helpers (not callable from the app)
-- ---------------------------------------------------------------------------

-- null when the format is fine, otherwise empty | too_short | too_long | invalid_format
create or replace function public.username_problem(p_username text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_username is null or p_username = ''        then 'empty'
    when length(p_username) < 3                       then 'too_short'
    when length(p_username) > 20                      then 'too_long'
    when p_username !~ '^[a-z][a-z0-9_]*$'            then 'invalid_format'
  end
$$;

-- already used by someone, or on the reserved list (both look the same to the app: "taken")
create or replace function public.username_taken(p_username text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where username = p_username)
      or exists (select 1 from public.reserved_usernames where name = p_username)
$$;

-- a free alternative to offer when a name is taken (null if none of the tries is free)
create or replace function public.username_suggestion(p_username text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  suffix text;
  cand text;
begin
  foreach suffix in array array['22', '23', '24', '25', '26', '27', '28', '29', '99', '11', '10', '21'] loop
    cand := left(p_username, 20 - 1 - length(suffix)) || '_' || suffix;
    if public.username_problem(cand) is null and not public.username_taken(cand) then
      return cand;
    end if;
  end loop;
  return null;
end
$$;

-- ---------------------------------------------------------------------------
-- 5. is_username_available(): the live "is it free?" check while someone types
--    reason: null (free) | own | empty | too_short | too_long | invalid_format | taken
-- ---------------------------------------------------------------------------
create or replace function public.is_username_available(p_username text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v text := lower(btrim(coalesce(p_username, '')));
  prob text;
  own text;
begin
  if uid is null then raise exception 'not_signed_in'; end if;

  prob := public.username_problem(v);
  if prob is not null then
    return json_build_object('username', v, 'available', false, 'reason', prob, 'suggestion', null);
  end if;

  select username into own from public.profiles where id = uid;
  if own is not null and own = v then
    return json_build_object('username', v, 'available', true, 'reason', 'own', 'suggestion', null);
  end if;

  if public.username_taken(v) then
    return json_build_object('username', v, 'available', false, 'reason', 'taken',
                             'suggestion', public.username_suggestion(v));
  end if;

  return json_build_object('username', v, 'available', true, 'reason', null, 'suggestion', null);
end
$$;

-- ---------------------------------------------------------------------------
-- 6. set_username(): the only way the app sets or changes a username
--    errors: not_signed_in | profile_not_found | invalid_username: <reason> | username_taken
--            | username_cooldown: N day(s) left
-- ---------------------------------------------------------------------------
create or replace function public.set_username(p_username text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v text := lower(btrim(coalesce(p_username, '')));
  prob text;
  cur text;
  changed timestamptz;
  cool int;
  days_left int;
begin
  if uid is null then raise exception 'not_signed_in'; end if;

  prob := public.username_problem(v);
  if prob is not null then raise exception 'invalid_username: %', prob; end if;

  select username, username_changed_at into cur, changed
    from public.profiles where id = uid for update;
  if not found then raise exception 'profile_not_found'; end if;

  if cur = v then
    return json_build_object('username', v, 'changed', false);
  end if;

  -- later changes can be rate-limited (0 = no limit). The first time a username is set is never limited.
  cool := greatest(public.cfg_int('config.username_change_cooldown_days', 0), 0);
  if cur is not null and changed is not null and cool > 0
     and now() < changed + (cool * interval '1 day') then
    days_left := ceil(extract(epoch from (changed + (cool * interval '1 day') - now())) / 86400)::int;
    raise exception 'username_cooldown: % day(s) left', days_left;
  end if;

  if public.username_taken(v) then raise exception 'username_taken'; end if;

  begin
    update public.profiles
       set username = v, username_changed_at = now(), updated_at = now()
     where id = uid;
  exception when unique_violation then
    raise exception 'username_taken';   -- someone else grabbed it a moment ago
  end;

  return json_build_object('username', v, 'changed', true);
end
$$;

-- ---------------------------------------------------------------------------
-- 7. Setting: cooldown between username changes (works before or after the Phase 9 rename to `config`)
-- ---------------------------------------------------------------------------
do $$
declare
  tbl text := case when to_regclass('public.config') is not null then 'config' else 'cms' end;
begin
  execute format(
    'insert into public.%I (content_type, value)
     select ''config.username_change_cooldown_days'', ''0''
     where not exists (select 1 from public.%I where content_type = ''config.username_change_cooldown_days'')', tbl, tbl);

  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = tbl and column_name = 'remark') then
    execute format(
      'update public.%I set remark = %L
        where content_type = ''config.username_change_cooldown_days'' and (remark is null or btrim(remark) = '''')',
      tbl,
      'Days a person must wait before changing their username again. 0 = no limit (fine while testing). Suggested before launch: 30. The first time a username is set is never limited. Applies from the next change.');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 8. Who may call what
-- ---------------------------------------------------------------------------
revoke all on function public.profiles_guard_username() from public, anon, authenticated;
revoke all on function public.username_problem(text) from public, anon, authenticated;
revoke all on function public.username_taken(text) from public, anon, authenticated;
revoke all on function public.username_suggestion(text) from public, anon, authenticated;
revoke all on function public.is_username_available(text) from public, anon, authenticated;
revoke all on function public.set_username(text) from public, anon, authenticated;

grant execute on function public.is_username_available(text) to authenticated;
grant execute on function public.set_username(text) to authenticated;