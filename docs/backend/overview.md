# Backend overview

Source of truth for this page: [live-schema-snapshot.sql](live-schema-snapshot.sql) (file dated 2026-10-22 20:20, functions, triggers, policies, indexes and columns of the live project) and [supabase/migrations/20261023100000_calendar_backend.sql](../../supabase/migrations/20261023100000_calendar_backend.sql). I compared the 14 functions in that migration with the snapshot: the bodies are identical.

The snapshot was refreshed on 2026-10-26 and now also contains the Phase 6 tables and functions (timed Show Up).

**Not in the snapshot, so unverified here:** table constraints and foreign keys of the hand-made tables, table-level `GRANT`s, the contents of `config` (renamed from `cms` in Phase 9), the event trigger that calls `rls_auto_enable`, and triggers on `auth.users`.

## Tables

### `profiles` (one row per auth user)
| Column | Purpose |
|---|---|
| `id` uuid | Same as `auth.users.id` |
| `first_name`, `last_name`, `date_of_birth` | Editable by the user (column grants from migration 3; later changes unverified) |
| `is_admin` bool, default false | Never writable by app users. Enables the admin-only "any place" gym search and `config` writes |
| `place_search_mode` text, default `fitness_only` | `fitness_only` or `any_place`; changed only through `set_place_search_mode` |
| `timezone` text, default `Asia/Kolkata` | The user's timezone. Drives `local_today`, `showups.local_date` and every week boundary. Set by `set_my_timezone`. **Applied manually** |

### `gyms`
`id`, `user_id` (default `auth.uid()`), `name`, `google_place_id`, `address`, `latitude`, `longitude` (used by `record_showup` for distance), `is_active` (at most one active gym per user, enforced by the partial unique index `gyms_one_active_per_user_idx`), `created_at`, `updated_at`. Changing gym deactivates the old row and inserts a new one.

### `showups` (one row per counted visit)
| Column | Purpose |
|---|---|
| `user_id`, `gym_id` | Owner and gym |
| `occurred_at` timestamptz, default `now()` | When the visit was recorded |
| `local_date` date | The visit's calendar day in the user's timezone. Filled by trigger `showups_set_local_date` from `occurred_at` and `profiles.timezone`. Unique with `user_id` (`showups_one_per_day`). **Applied manually** |
| `distance_meters`, `location_accuracy_meters` | Measured by `record_showup` / sent by the device |
| `verification_method` text, default `gps` | Always the default today |

### `config` (content and settings, edited by hand; now config (renamed in Phase 9))
This is the old `cms` table, renamed with all its rows. A **different, new table is now called `cms`**: see below.
`id` bigint, `created_at`, `content_type` text, `value` text. Rows used by the app: `lpage_banner` (image URL), `tnc` (Markdown), `landing.carousel_heading` (text, default "Why it works"), and the `config.*` settings (see [rules-and-decisions.md](rules-and-decisions.md#config-keys)). Insert a new row to change a value; the newest row per `content_type` wins. The landing page reads its three keys with one request (`services/landingContent.ts`), before sign-in.

### `cms` (the new table: landing cards and Quick Start slides, Phase 9) — applied manually
One row per card or slide: `category` (`landing_carousel` or `quick_start`), `position`, `slug`, `heading`, `subheading`, `image_url` (empty means the app shows a mascot picture), `image_alt`, `is_active`, `created_at`, `updated_at`. Eight starting rows (4 carousel cards, 4 Quick Start slides). Readable by everyone, writable by nobody from the app. Read through `get_cms_content()` (callable before sign-in). **The app does not read this table or that function yet** (a later step). Source: `docs/backend/phase9a_cms_and_config.sql`.

### `goal_history` (weekly goal, append-only by RPC) — applied manually
`user_id`, `days_per_week` smallint, `effective_from` date (a Monday), `created_at`. Unique `(user_id, effective_from)`. The goal for a week is the row with the latest `effective_from <= that Monday` (`goal_for_week`).

### `week_pauses` — applied manually
`user_id`, `week_start` (Monday), `used_month` (first day of the month in which the pass was spent), `reason` (optional text), `created_at`, `ended_at` (null = active). Unique `(user_id, week_start)`. Ending a pause sets `ended_at`; the row (and the spent pass) stays.

### `weekly_results` (frozen history of finished weeks) — applied manually
Primary key `(user_id, week_start)`; `goal_days`, `showup_days`, `status` (`achieved`, `paused` or `missed`, as written by `close_weeks`), `weeks_in_a_row` (the running streak after that week), `closed_at`. Read-only for users; written only by `close_weeks`.

### `showup_sessions` (one row per timed visit, Phase 6) — applied manually
`id`, `user_id`, `gym_id`, `started_at` (server time), `duration_seconds`, `interval_seconds`, `max_missed_checks` (all three copied from config when the session starts), `start_distance_meters`, `start_accuracy_meters`, `status` (`running`, `completed`, `left_early`, `missed_checks`, `expired`, `cancelled`), `ended_at`, `showup_id` (the `showups` row it produced, if any). A unique index (`showup_sessions_one_running`) allows only one `running` session per user. Users can only read their own rows.

### `showup_checks` (one row per location check, Phase 6) — applied manually
`session_id`, `user_id`, `checkpoint_no` (0 is the tap on Show up), `due_at_seconds` (scheduled, seconds after the start), `elapsed_seconds` (when it really happened, server clock), `checked_at`, `distance_meters`, `accuracy_meters`, `passed`. Unique `(session_id, due_at_seconds)`. Users can only read their own rows.

### `mascot_images` (the mascot's pictures, Phase 7) — applied manually
Primary key `key`. `kind` (`expression`, `avatar`, `logo`), `image_url` (empty until a picture is uploaded), `alt_text`, `width`, `height` (the picture's shape in pixels), `is_active`, `updated_at` (kept current by a trigger). Readable by everyone, writable by nobody from the app.

### `mascot_messages` (what the mascot says, Phase 7) — applied manually
`id`, `key` (a situation the app knows, for example `one_to_go`), `locale`, `priority` (**lower wins**), `expression` (must name a `mascot_images.key`), `message` (may contain `{goal} {done} {next} {left} {remaining} {wk} {total}`), `scenario` and `shown_when` (notes for editors only), `is_active`, `created_at`, `updated_at`. The app decides which situations are true right now; this table decides which true one wins and what it says. Readable by everyone, writable by nobody from the app.

### Triggers (public schema)
`gyms_set_updated_at`, `profiles_set_updated_at` (both `set_updated_at`), `showups_set_local_date` (BEFORE INSERT on `showups`).

## Client-callable RPCs

Every RPC below is `SECURITY DEFINER`, takes the user from `auth.uid()` (never from an argument) and is executable by `authenticated` only (snapshot grants). `anon` cannot call any of them. Errors are raised with a plain code at the start of the message, e.g. `no_passes_left: all 3 passes for this month are used`; the default SQLSTATE is `P0001`. Dates in JSON are `YYYY-MM-DD` strings. Every RPC also raises `not_signed_in` when there is no signed-in user.

### `set_weekly_goal(p_days int)` → void
Inserts into `goal_history`. First goal ever: effective this week's Monday. Any later goal: effective next Monday, overwriting a pending row for that Monday. Errors: `invalid_goal` (null, below 1 or above 7).

### `get_goal_state()` → json
`{ has_goal: bool, current_goal: int|null, pending_goal: int|null, pending_from: date|null }`. `current_goal` is the goal for this week; `pending_*` is the goal starting after this week, if any. Source: the snapshot only (not in the migration; **applied manually**).

### `use_pause(p_week_start date, p_reason text default null)` → json
Spends one pass and pauses a week. Returns `{ passes_left: int }`. Checks in order: `invalid_week` (null, or not a Monday), `week_in_past` (before this week), `week_too_far_ahead` (beyond `config.pause_max_weeks_ahead`), `already_paused` (any pause row exists for that week, even an ended one), `no_passes_left` (passes used this calendar month >= `config.pause_passes_per_month`), `already_achieved` (this week's showups already meet the goal). A per-user advisory lock stops two quick taps spending the last pass.

### `end_pause(p_week_start date)` → void
Sets `ended_at` on the active pause for that week. The pass is **not** refunded. Error: `no_active_pause`.

### `record_showup(p_gym uuid, p_lat float8, p_lng float8, p_accuracy int)` → boolean
**No longer called by the app (since Phase 6c).** It still works and is still granted to `authenticated`; it is superseded by the timed Show Up RPCs below and is a candidate for the phase 8 lockdown.

Measures the distance server-side (`calendar_distance_meters`) between the position and the caller's own **active** gym, and inserts into `showups`. Returns `true` if a new showup was saved, `false` if that local day already had one (`on conflict (user_id, local_date) do nothing`). Errors: `invalid_position` (null or out-of-range coordinates), `gym_not_found` (gym is not the caller's active gym), `too_far` (distance > `config.max_gym_distance_meters`, default 100). `p_accuracy` is stored, not checked.

### `get_calendar(p_month date)` → json
Closes finished weeks first (`close_weeks`), then returns:
```
{ month, earliest_month, latest_month, grid_from, grid_to,
  showup_dates: [date, ...],
  weeks: [ { week_start, goal_days: int|null, showup_days, status }, ... ] }
```
`p_month` may be null; it is clamped between `earliest_month` (`config.calendar_start_month`, default: current month) and `latest_month` (current month). The grid is whole Monday-to-Sunday weeks. `status` is one of `achieved`, `paused`, `missed` (frozen weeks), or `in_progress`, `upcoming` (live weeks). `goal_days` is null before the user's first goal.

### `get_home_summary()` → json
Closes finished weeks first, then returns
`{ weeks_in_a_row, best_weeks_in_a_row, goal_days: int|null, showup_days_this_week, passes_left, total_showups }`.
`weeks_in_a_row` = the last frozen streak, plus 1 if this week's goal is already met.

### `get_pause_state()` → json
`{ today, this_week, max_weeks_ahead, passes_total, passes_left, next_refill, active_pauses: [date, ...] }`. `active_pauses` lists Mondays of active (not ended) pauses from this week onward. `next_refill` is the first day of next month. Source: the snapshot only (**applied manually**).

### `get_app_config()` → json
One object of every `config.*` setting, newest row per key, with the `config.` prefix removed and values as **text**: `{ "max_gym_distance_meters": "100", ... }`. `{}` if there are none.

### `set_my_timezone(p_tz text)` → void
Updates `profiles.timezone` if it changed. Errors: `invalid_timezone` (null, or not a name in `pg_timezone_names`). **Applied manually**; not in the migration.

## Timed Show Up RPCs (Phase 6)

Source: `docs/backend/phase6_showup_sessions.sql`, identical to the live snapshot. All four are `SECURITY DEFINER`, use `auth.uid()`, never take a user id, and are executable by `authenticated` only. Every one raises `not_signed_in` with no signed-in user. All of them return the same **session JSON**:

```
session = { session_id, status, started_at, server_now, elapsed_seconds,
            duration_seconds, interval_seconds, max_missed_checks,
            checkpoints: [ { at_seconds, needs_location, done }, ... ],
            location_checks_done, location_checks_total }
```
`started_at` and `server_now` are server timestamps; `elapsed_seconds` is `server_now - started_at`. `needs_location` is true when `interval_seconds > 0`. `location_checks_total` is 1 (the tap) plus one per checkpoint when `interval_seconds > 0`, otherwise 1.

Used by the app since Phase 6c: see [../frontend/screens-and-rpcs.md](../frontend/screens-and-rpcs.md#timed-show-up-engine-phase-6b-and-6c-in-use-on-home).

### `get_showup_state()` → json
`{ today: date, showed_up_today: bool, session: session | null }`. First marks any running session older than `duration + 1800 s` as `expired`. `session` is the running session, if any. Use it on app load and when the page becomes visible again.

### `start_showup(p_gym uuid, p_lat float8, p_lng float8, p_accuracy int default null)` → json
`{ already_done: bool, session: session | null }`. This is location check number 1. In order: validates the position; expires an old running session; **if a session is running, returns it** (resume); if today already has a Showup, returns `already_done: true` with no session; checks the gym is the caller's active gym; rejects a reading worse than `config.max_location_accuracy_meters` (when above 0); rejects a distance over `config.max_gym_distance_meters`; then creates the session from the config. Errors: `invalid_position`, `gym_not_found`, `poor_accuracy`, `too_far`.

### `check_showup(p_session uuid, p_lat float8 default null, p_lng float8 default null, p_accuracy int default null)` → json
`{ result, check_passed?, next_check_in_seconds?, recorded?, session }`. `result` is one of:
- `running`: the check was judged (`check_passed` says whether it passed); the session goes on.
- `not_due`: nothing to do yet, or the due check already passed; `next_check_in_seconds` says when to come back.
- `poor_accuracy`: the reading was too imprecise to judge; send another. Not counted against the user.
- `completed`: the last check passed; `recorded` is true if a new `showups` row was written, false if the day already had one.
- `left_early`, `missed_checks`, `expired`, `cancelled`: the session is over (also returned if it had already ended).
A reading is credited to the **latest checkpoint due** (2 s tolerance). Position is required when `needs_location` is true. Errors: `session_not_found` (not the caller's), `invalid_position`.

### `cancel_showup(p_session uuid)` → boolean
Sets a running session to `cancelled`. True if one was cancelled, false if there was nothing running (already ended, or not the caller's).

The helpers `showup_grace_seconds()` (1800), `showup_checkpoints(int, int)` and `showup_session_json(uuid)` are internal and not granted to `anon` or `authenticated`.

## Mascot RPC (Phase 7)

Source: `docs/backend/phase7a_mascot_tables.sql`, identical to the live snapshot.

### `get_mascot_content(p_locale text default 'en')` → json
**Callable before sign-in** (`anon` and `authenticated`); `STABLE`, not `SECURITY DEFINER` (the tables allow public reads). Returns
```
{ version: bigint,
  images:   { <key>: { kind, url, alt, width, height, v } },
  messages: [ { id, key, locale, priority, expression, message } ] }
```
- `version` is the newest `updated_at` across both tables, in milliseconds (0 if both are empty). It changes whenever anything is edited.
- `images` holds only **active** pictures with a **non-empty** address, keyed by `mascot_images.key`. `v` is that picture's own `updated_at` in milliseconds (used to bust the browser cache).
- `messages` holds the active rows ordered by `priority`, then `id`. A row is included if its `locale` is the requested one, or if it is English and that key has no active row in the requested locale (so a missing translation falls back to English per message).
- No error codes: it only reads. An empty database gives `{ version: 0, images: {}, messages: [] }`.

The app side is in [../frontend/screens-and-rpcs.md](../frontend/screens-and-rpcs.md#the-mascot-phase-7c-logic-only-not-yet-on-a-screen).

## Internal helpers

Not granted to `anon` or `authenticated` in the snapshot, except where noted, so the browser cannot call them with someone else's id.

| Function | Returns | Purpose |
|---|---|---|
| `close_weeks(p_user uuid)` | void | Freezes every finished, not-yet-frozen week into `weekly_results` (see rules). Per-user advisory lock; `on conflict do nothing`. Called by `get_calendar` and `get_home_summary` |
| `week_summary(p_user, p_from, p_to)` | table `(week_start, goal_days, showup_days, status)` | One row per week: frozen values if a `weekly_results` row exists, otherwise computed live |
| `local_today(p_user uuid)` | date | Today in the user's timezone (default `Asia/Kolkata`) |
| `week_start_of(p_day date)` | date | The Monday of that day's week |
| `calendar_distance_meters(lat1, lng1, lat2, lng2)` | float8 | Metres between two points; the only place PostGIS (`ST_DistanceSphere`) is used |
| `cfg_int(p_key text, p_default int)` | int | A config value as a whole number, or the default if missing or not a number |
| `passes_used_in_month(p_user, p_month)` | int | Count of `week_pauses` whose `used_month` is that month (ended pauses included) |
| `goal_for_week(p_user uuid, p_week date)` | smallint | The goal in force that week, or null. **Applied manually. Executable by `anon` and `authenticated`**; it is not `SECURITY DEFINER`, so it only sees rows the caller's row level security allows (their own `goal_history`) |
| `cfg(k text, d text)` | text | Newest `config.value` for `content_type = k`, else `d`. **Applied manually. Executable by `anon` and `authenticated`**; not `SECURITY DEFINER`, and `config` is readable by everyone per the snapshot (see rules, Security) |

## Other functions in the snapshot
| Function | Notes |
|---|---|
| `set_place_search_mode(new_mode text)` → text | `authenticated`. Anyone may choose `fitness_only`; only admins may choose `any_place`. SQLSTATEs `28000` (not signed in), `22023` (invalid mode), `42501` (not an admin). In migration `20261018100000` |
| `effective_place_search_mode()` → text | `authenticated`. `any_place` only if the caller is an admin and chose it |
| `handle_new_user()` → trigger | Creates the profile on sign-up. No API grant |
| `set_updated_at()`, `set_showup_local_date()` → trigger | Trigger functions. The snapshot shows both executable by `anon` and `authenticated` |
| `rls_auto_enable()` → event trigger | Turns on row level security for new tables in `public`. Executable by `anon` and `authenticated` in the snapshot. Not in any migration; origin unverified |

## Row level security (from the snapshot)
| Table | Policies |
|---|---|
| `profiles` | read own; update own |
| `gyms` | read own; insert own; update own |
| `showups` | read own; insert own at own active gym (**still open**, see roadmap phase 8) |
| `showup_sessions`, `showup_checks` | read own rows (`user_id = auth.uid()`); no write policy and no write grant, so only the functions write |
| `mascot_images`, `mascot_messages` | `public read` (SELECT for `anon` and `authenticated`, `using true`); no write policy or grant, so nobody writes from the app |
| `goal_history`, `week_pauses`, `weekly_results` | read own rows (`user_id = auth.uid()`); no write policy, so only the SQL functions write |
| `config` (was `cms`) | `Enable read access for all users` and `config read` (renamed from `cms read`; both select, `using true`, role `public`); `cms: public can read landing page content` (select, `anon`/`authenticated`, only `lpage_banner` and `tnc`); `config admin write` (renamed from `cms admin write`; all, admins only). Based on the pre-rename snapshot; the policy names after the rename are from `phase9a_cms_and_config.sql`, and the live policy list has not been re-read |
| `cms` (new) | `public read` (select, `anon` and `authenticated`, `using true`); no write grant |
