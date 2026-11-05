-- UNDO Phase 12a: removes everything it added. DELETES every squad link and request.
drop function if exists public.get_squad();
drop function if exists public.remove_from_squad(text);
drop function if exists public.cancel_squad_request(text);
drop function if exists public.respond_squad_request(text, boolean);
drop function if exists public.send_squad_request(text);
drop function if exists public.search_people(text);
drop function if exists public.squad_weeks_in_a_row(uuid);
drop function if exists public.squad_size(uuid);
drop function if exists public.squad_link_between(uuid, uuid);
drop function if exists public.squad_clean_username(text);
drop table if exists public.squad_links;
delete from public.config where content_type in
  ('config.invite_url', 'config.squad_max_size', 'config.squad_request_cooldown_days', 'config.squad_search_max_results');
