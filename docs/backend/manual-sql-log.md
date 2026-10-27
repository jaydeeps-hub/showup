# Manual SQL log

Everything below was created **by hand in the Supabase SQL Editor** and is **not** in `supabase/migrations/`. All of it is marked **applied manually, not in migrations**. Do not add these to the migrations folder.

How this was reconstructed: from [live-schema-snapshot.sql](live-schema-snapshot.sql) (which shows what exists now) and from the header of `supabase/migrations/20261023100000_calendar_backend.sql` (which lists what the project owner created first). The snapshot has no dates and no `CREATE TABLE` text, so:

- The **order** is the order the calendar-backend design required (each step depends on the previous ones) and is **unverified** as the true order of execution.
- **Dates** are unverified.
- The exact original SQL is not in the repo. Where the snapshot shows the definition, it is quoted by name only; read the snapshot for the text.
- Table constraints, foreign keys and table grants for the hand-made tables are **unverified** (the snapshot does not include them).

Log format for new entries: date, what was run, why, which snapshot line proves it.

## Log

| # | Object | Status | What the snapshot shows |
|---|---|---|---|
| 1 | Column `profiles.timezone` | applied manually, not in migrations | `text`, not null, default `'Asia/Kolkata'` |
| 2 | Column `showups.local_date` | applied manually, not in migrations | `date`, nullable (filled by the trigger below) |
| 3 | Function `set_showup_local_date()` and trigger `showups_set_local_date` | applied manually, not in migrations | BEFORE INSERT on `showups`; sets `local_date` from `occurred_at` in the user's `profiles.timezone` (default `Asia/Kolkata`). Function has no `search_path` set and is executable by `anon` and `authenticated` |
| 4 | Unique index `showups_one_per_day` on `showups (user_id, local_date)` | applied manually, not in migrations | Unique index present. Makes `record_showup`'s `on conflict (user_id, local_date)` work |
| 5 | Table `goal_history` | applied manually, not in migrations | Columns `id`, `user_id`, `days_per_week` smallint, `effective_from` date, `created_at`. Unique `(user_id, effective_from)` |
| 6 | Table `week_pauses` | applied manually, not in migrations | Columns `id`, `user_id`, `week_start`, `used_month`, `reason`, `created_at`, `ended_at`. Unique `(user_id, week_start)` |
| 7 | Table `weekly_results` | applied manually, not in migrations | Columns `user_id`, `week_start`, `goal_days`, `showup_days`, `status`, `weeks_in_a_row`, `closed_at`. Primary key `(user_id, week_start)` |
| 8 | Function `goal_for_week(p_user uuid, p_week date)` | applied manually, not in migrations | SQL, stable, `search_path public`. Executable by `anon` and `authenticated` |
| 9 | Function `cfg(k text, d text)` | applied manually, not in migrations | SQL, stable, `search_path public`. Reads the newest `cms.value` for `content_type = k`. Executable by `anon` and `authenticated` |
| 10 | Five `config.*` rows in `cms` | applied manually, not in migrations | **The rows themselves are not in the snapshot** (it contains no data). Keys known from the code and functions: `config.max_gym_distance_meters`, `config.calendar_start_month`, `config.min_stay_minutes`, `config.pause_passes_per_month`, `config.pause_max_weeks_ahead`. Current values: unverified. App defaults are 100, `2026-06`, 15, 3, 1 |
| 11 | Row level security policies on the hand-made tables | applied manually, not in migrations | `goal_history`, `week_pauses`, `weekly_results`: policy `own rows`, SELECT, `user_id = auth.uid()`, role `public`. Whether RLS is enabled on each table, and the table grants, are unverified |
| 12 | `cms` policies `Enable read access for all users`, `cms read`, `cms admin write` | applied manually, not in migrations | See the snapshot's policy list. The migration `20261022100000_cms_public_read.sql` adds only `cms: public can read landing page content` |
| 13 | Table `public.cms` itself | applied manually (created in the Supabase dashboard) | Stated in the comment of migration `20261022100000`; columns `id`, `created_at`, `content_type`, `value` |
| 14 | Function `get_goal_state()` | applied manually, not in migrations | Returns `{has_goal, current_goal, pending_goal, pending_from}`; `authenticated` only |
| 15 | Function `get_pause_state()` | applied manually, not in migrations | Returns `{today, this_week, max_weeks_ahead, passes_total, passes_left, next_refill, active_pauses}`; `authenticated` only |
| 16 | Function `set_my_timezone(p_tz text)` | applied manually, not in migrations | Validates against `pg_timezone_names`, raises `invalid_timezone`; `authenticated` only |

## Phase 6 (timed Show Up), 2026-10-26

Applied manually from `docs/backend/phase6_showup_sessions.sql`. I compared its function bodies with the live snapshot: all seven are identical, apart from the formatting of `showup_grace_seconds` (`select 1800` in both). A smoke test is in `docs/backend/phase6_smoke_test.sql`. All **applied manually, not in migrations**.

| # | Object | Notes |
|---|---|---|
| 17 | Table `showup_sessions` | One row per timed visit. The timing rules (`duration_seconds`, `interval_seconds`, `max_missed_checks`) are copied from config at start. Unique index `showup_sessions_one_running` allows one `running` session per user. Status is one of `running`, `completed`, `left_early`, `missed_checks`, `expired`, `cancelled`. RLS on; policy `own rows` (SELECT); the app can only SELECT |
| 18 | Table `showup_checks` | One row per location check (`checkpoint_no` 0 is the tap on Show up). Unique `(session_id, due_at_seconds)`. RLS on; policy `own rows` (SELECT) |
| 19 | Functions `get_showup_state`, `start_showup`, `check_showup`, `cancel_showup` | `SECURITY DEFINER`, `authenticated` only |
| 20 | Internal `showup_grace_seconds()` (1800), `showup_checkpoints(int, int)`, `showup_session_json(uuid)` | Not executable by `anon` or `authenticated` (absent from the snapshot's permission list) |
| 21 | `cms` rows `config.showup_duration_seconds` (900), `config.showup_check_interval_seconds` (300), `config.showup_max_missed_checks` (0), `config.max_location_accuracy_meters` (0, meaning off) | The SQL inserts each only if the key had never been set. **Current values: unverified** (the snapshot has no data) |

`showup_sessions.gym_id` references `gyms(id)` with `on delete cascade`, and `showup_sessions.showup_id` references `showups(id)` with `on delete set null`.

## Phase 7a (mascot), 2026-10-27

Applied manually from `docs/backend/phase7a_mascot_tables.sql`. I compared its two functions with the live snapshot: both bodies are identical. All **applied manually, not in migrations**.

| # | Object | Notes |
|---|---|---|
| 22 | Storage bucket `app-assets` (public) | The SQL tries to create it and only prints a notice if it cannot; if so, create a PUBLIC bucket named `app-assets` in Supabase Storage by hand. **Whether it exists: unverified** |
| 23 | Table `mascot_images` | Primary key `key` (`smile`, `wave`, `cheer`, `lift`, `focus`, `sleep`, `avatar`, `logo_white`); `kind` is `expression`, `avatar` or `logo`; `image_url` (empty means not uploaded yet), `alt_text`, `width`, `height`, `is_active`, `updated_at`. The starting rows have **no image addresses**, so until pictures are uploaded and their URLs set, nothing is returned for them |
| 24 | Table `mascot_messages` | `id`, `key` (the situation), `locale`, `priority` (lower wins), `expression` (a foreign key to `mascot_images.key`), `message`, `scenario` and `shown_when` (notes for editors), `is_active`, `created_at`, `updated_at`. Index `mascot_messages_lookup` on `(locale, is_active, priority)`. Sixteen starting messages (one per situation) are inserted only if the table is empty |
| 25 | Function `mascot_touch_updated_at()` and triggers `mascot_images_touch`, `mascot_messages_touch` | Keep `updated_at` current on every edit; `get_mascot_content` uses it as the content `version` |
| 26 | RLS on both tables; policy `public read` (SELECT, `anon` and `authenticated`, `using true`); app roles have `SELECT` only | Nobody can write from the app; edit the tables in the Supabase Table Editor |
| 27 | Function `get_mascot_content(p_locale text default 'en')` | `STABLE`, **not** `SECURITY DEFINER`; executable by `anon` and `authenticated`, so it works before sign-in. See [overview.md](overview.md) |
| 28 | `cms` row `config.mascot_almost_seconds` = `180` | Inserted only if the key had never been set. Seconds left at which the mascot switches to "almost there". **Current value: unverified** (the snapshot has no data) |

## Also in the live database but in no migration (origin unverified)

- Function `rls_auto_enable()` (an event trigger function that turns on row level security for new tables in `public`). It appears in the snapshot with `EXECUTE` for `anon` and `authenticated`. It may be a Supabase default or may have been added by hand; this cannot be told from the repo.

## Things the migration checks but does not create

`supabase/migrations/20261023100000_calendar_backend.sql` stops with a list of missing prerequisites if items 1, 2, 4, 5, 6, 7, 8 and 9 above (and `cms` and `showups`) are missing. So a **new** Supabase project cannot be rebuilt from the migrations folder alone; the manual items must be created first. Because the snapshot has no table definitions, the exact `CREATE TABLE` statements would have to be recovered from the live project (for example by dumping the schema), which has not been done.

## Entries since this log was created

_None yet. Add one row here (date, SQL, reason) for every manual change._
