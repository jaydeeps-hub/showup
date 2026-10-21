-- Showup: let signed-out visitors read the two CMS entries the landing page needs.
--
-- The `public.cms` table already exists (created in the Supabase dashboard). It holds content the
-- landing page shows BEFORE anyone signs in:
--   * lpage_banner : the mascot image URL
--   * tnc          : the Terms and Conditions, as Markdown
--
-- Row Level Security is on for cms, but no policy lets a signed-out visitor read it, so the page
-- sees an empty table. This adds READ-ONLY access to those two content types and nothing else.
--
--   * SELECT only: no insert, update or delete for anyone using the browser API.
--   * Only rows whose content_type is lpage_banner or tnc are visible. Any other CMS content
--     stays private until a later migration deliberately opens it.
--   * It is safe to run twice.

-- The table is created in the Supabase dashboard, not by these migrations, and its schema is left
-- exactly as it is. If it does not exist (for example a brand-new project), this migration does
-- nothing instead of failing; run it again after the table has been created.
do $$
begin
  if to_regclass('public.cms') is null then
    raise notice 'public.cms does not exist yet: skipping the landing page read policy.';
    return;
  end if;

  execute 'alter table public.cms enable row level security';

  -- The API roles need the SELECT privilege as well as a policy. Grant only that.
  execute 'grant select on public.cms to anon, authenticated';

  execute 'drop policy if exists "cms: public can read landing page content" on public.cms';

  execute $policy$
    create policy "cms: public can read landing page content"
      on public.cms for select
      to anon, authenticated
      using (content_type in ('lpage_banner', 'tnc'))
  $policy$;
end
$$;
