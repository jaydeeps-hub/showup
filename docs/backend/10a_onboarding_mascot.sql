-- Phase 10a (v2): mascot lines and captions for the GOAL screen of onboarding.
-- Adds two columns to mascot_messages (screen, label), updates get_mascot_content(), seeds the goal lines,
-- and adds two settings for "Gyms near me". Safe to run twice; never overwrites lines you have edited.
-- If an earlier version of this file added lines for the Add gym screen, this version removes them
-- (the Add gym screen has no mascot).
-- Needs Phase 7a (mascot tables) to be applied first.

-- ---------------------------------------------------------------------------
-- 1. Which screen a line belongs to, and an optional short caption
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.mascot_messages') is null then
    raise exception 'public.mascot_messages was not found. Run the Phase 7a mascot SQL first.';
  end if;
end
$$;

alter table public.mascot_messages
  add column if not exists screen text not null default 'home',
  add column if not exists label  text;

-- the Add gym screen has no mascot: remove its lines if an earlier version of this file added them
delete from public.mascot_messages where screen = 'gym';

alter table public.mascot_messages drop constraint if exists mascot_messages_screen_check;
alter table public.mascot_messages
  add constraint mascot_messages_screen_check check (screen in ('home', 'goal'));

comment on column public.mascot_messages.screen is 'Which screen shows the line: home, or goal (the onboarding goal step).';
comment on column public.mascot_messages.label  is 'Optional short caption. The goal screen shows it under the big number.';

create index if not exists mascot_messages_screen_lookup
  on public.mascot_messages (screen, locale, is_active, priority);

-- ---------------------------------------------------------------------------
-- 2. The app's one call now also returns screen and label for every line
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
               'id', m.id, 'key', m.key, 'screen', m.screen, 'locale', m.locale, 'priority', m.priority,
               'expression', m.expression, 'message', m.message, 'label', m.label)
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

-- ---------------------------------------------------------------------------
-- 3. Goal screen: one line per number of days (bubble text, face, and the caption under the big number)
--    The app shows the row whose key matches the number picked: goal_1 ... goal_7.
-- ---------------------------------------------------------------------------
insert into public.mascot_messages (key, screen, priority, expression, message, label, scenario, shown_when)
select v.key, 'goal', v.priority, v.expression, v.message, v.label, v.scenario, v.shown_when
from (values
  ('goal_1', 1, 'smile', 'Pick a number you can keep. Rest days are part of the plan.', 'A gentle start',    'Goal screen, 1 day',  'The number 1 is selected'),
  ('goal_2', 2, 'smile', 'Pick a number you can keep. Rest days are part of the plan.', 'Light and steady',  'Goal screen, 2 days', 'The number 2 is selected'),
  ('goal_3', 3, 'smile', 'Pick a number you can keep. Rest days are part of the plan.', 'Steady',            'Goal screen, 3 days', 'The number 3 is selected'),
  ('goal_4', 4, 'smile', 'Pick a number you can keep. Rest days are part of the plan.', 'Committed',         'Goal screen, 4 days', 'The number 4 is selected'),
  ('goal_5', 5, 'lift',  'Pick a number you can keep. Rest days are part of the plan.', 'A strong week',     'Goal screen, 5 days', 'The number 5 is selected'),
  ('goal_6', 6, 'lift',  'Pick a number you can keep. Rest days are part of the plan.', 'Nearly every day',  'Goal screen, 6 days', 'The number 6 is selected'),
  ('goal_7', 7, 'sleep', 'Pick a number you can keep. Rest days are part of the plan.', 'Are you sure? Rest days are important too.', 'Goal screen, 7 days', 'The number 7 is selected')
) as v(key, priority, expression, message, label, scenario, shown_when)
where not exists (select 1 from public.mascot_messages m where m.key = v.key and m.locale = 'en');

-- ---------------------------------------------------------------------------
-- 4. Settings for "Gyms near me" (work with the table either before or after the Phase 9 rename to `config`)
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.config') is not null then
    insert into public.config (content_type, value)
    select v.k, v.val
    from (values ('config.gym_search_radius_meters', '5000'), ('config.gym_search_max_results', '20')) as v(k, val)
    where not exists (select 1 from public.config c where c.content_type = v.k);
  else
    insert into public.cms (content_type, value)
    select v.k, v.val
    from (values ('config.gym_search_radius_meters', '5000'), ('config.gym_search_max_results', '20')) as v(k, val)
    where not exists (select 1 from public.cms c where c.content_type = v.k);
  end if;
end
$$;