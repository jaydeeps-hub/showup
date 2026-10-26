# Rules and decisions

Short, factual. Function names refer to [overview.md](overview.md).

## Time
- Weeks run **Monday to Sunday in the user's own timezone**: `profiles.timezone`, default `Asia/Kolkata`. The app sends the device timezone on launch (`set_my_timezone`, once per launch, errors ignored and only logged).
- "Today" is `local_today(user)`. The date of a showup is `showups.local_date`, set by trigger from `occurred_at` and the timezone **at insert time**. Changing the timezone later does not rewrite old dates.
- A device's first requests can run before the timezone is saved, so the very first Home load may use the old timezone until the next refresh.

## Showups
- **One showup counts per local calendar day** (unique `(user_id, local_date)`). A second press returns `false` from `record_showup`; the app shows "already recorded".
- The distance is measured **on the server** against the user's own active gym. The limit is `config.max_gym_distance_meters` (default 100 m). The device-reported position itself cannot be proven real.

## Timed Show Up (Phase 6)
- A Show Up is now a **session**. Tapping Show up calls `start_showup` (location check number 1), then the app calls `check_showup` at each scheduled checkpoint, ending with the last one at `duration_seconds`. Only the final passing check writes the `showups` row, dated to the day the visit **started**, even if the timer ends after midnight.
- **The server is the clock.** Every answer carries `server_now`; the app measures its offset from the device clock and works from `started_at` plus each checkpoint's `at_seconds`. A reading is credited to the **latest checkpoint that is due** (2 s tolerance), so a missed checkpoint cannot be made up afterwards.
- A **bad check** is a scheduled check, before the last one, with no passing reading (missed, or reading too far). More than `max_missed_checks` bad checks ends the session: `left_early` if the latest reading was too far, otherwise `missed_checks`. A too-far reading at the final check is `left_early`.
- `poor_accuracy` (a reading worse than `config.max_location_accuracy_meters`, when that is above 0) is **not** a bad check: the server asks the app to try again.
- One `running` session per user (a database index). Starting again while one runs returns the running session, so a refresh or a second device resumes it. A session not finished within `duration + 1800 s` is `expired`.
- If today already has a Showup, `start_showup` returns `already_done: true` and no session.
- The app no longer calls `record_showup` (removed in 6c). `record_showup` and the direct `INSERT` on `showups` still exist in the database (the lockdown is phase 8), so the timed flow can still be bypassed by a modified app until then.

## Weekly goal
- The **first goal takes effect this week**. Every **later change takes effect next Monday**.
- Changing it twice before Monday **overwrites the pending row** (same `effective_from`).
- The goal for a week is the latest `goal_history` row with `effective_from <= that week's Monday`.

## Closing weeks (lazy)
- A week is **frozen into `weekly_results` only after it ends**, and **only when someone calls `get_calendar` or `get_home_summary`** (lazy closing by `close_weeks`). No scheduled job exists in the repo.
- The **current week is always computed live**, so it has no `weekly_results` row yet. `close_weeks` is safe to repeat and to run concurrently (advisory lock, `on conflict do nothing`); a frozen week is never rewritten.
- Closing starts at the first week after the last frozen one, or at the week of the user's first goal.

## Status and streak
- Status of a finished week: **`achieved`** if showups >= goal, else **`paused`** if an active pause covers the week, else **`missed`**. A paused week that was still achieved counts as **achieved**. A pause that was ended early (`ended_at` set) does not count as paused.
- **`weeks_in_a_row`**: achieved +1, paused unchanged, missed resets to 0. `get_home_summary` adds 1 for the current week once its goal is met; the unfinished week never breaks the streak.
- **Passes are per calendar month** (`week_pauses.used_month`) and are **not refunded** when a pause is ended early. `already_paused` also applies to a week whose pause was ended.
- `use_pause` refuses a week that is already achieved (`already_achieved`) and weeks outside this week .. `pause_max_weeks_ahead` weeks ahead.

## Weeks before the first goal
- `week_summary` returns `goal_days = null` and status `in_progress` for weeks before a user's first goal (the live branch has no goal to compare with). **The client must show no marker for them.** The app does this: the calendar draws a goal-column marker only when `goalDays !== null`.

## Config keys
- Stored as `cms` rows with `content_type` `config.max_gym_distance_meters`, `config.calendar_start_month`, `config.pause_passes_per_month`, `config.pause_max_weeks_ahead`, plus the Phase 6 keys below. (`config.min_stay_minutes` was in the original plan; it is no longer used anywhere.)
- **Newest row per key wins** (by `created_at`, then `id`). **To change a value, insert a new row**; do not edit the old one.
- Server defaults when a key is missing or not a number: distance 100, passes 3, weeks ahead 1; `calendar_start_month` falls back to the current month.
- The app reads them with `get_app_config()`, **caches them for about an hour**, and has hard-coded defaults (100, `2026-06`, 3, 1) if the call fails. Nothing in the app currently reads those values (the server applies them). Note the app's default start month (`2026-06`) differs from the server's fallback (current month); the server decides what the calendar actually allows.
- `min_stay_minutes` was removed from the app in 6c. A `config.min_stay_minutes` row, if one exists in `cms`, is ignored by everything; the timed Show Up uses `config.showup_duration_seconds` (default 900).
- Timed Show Up keys (Phase 6): `config.showup_duration_seconds` (1 to 10800, default 900), `config.showup_check_interval_seconds` (default 300; 0 means no checks after the first), `config.showup_max_missed_checks` (default 0) and `config.max_location_accuracy_meters` (default 0, meaning off). They are copied into the session when it starts, so changing them never alters a running session.

## Erratum in the calendar backend design
`docs/calendar-backend-design.md` is said to claim that an 11:30 pm Sunday workout in Mumbai is already Monday in UTC. That is **backwards**: Mumbai (IST, UTC+5:30) is **ahead** of UTC. The real edge case is **Monday 00:30 IST, which is still Sunday 19:00 in UTC**, so a UTC-based week would put that workout in the wrong week. This is why weeks use the user's local date.

**That file is not in this repository**, so the note could not be added at its top. When the file is added, put a note at the top pointing here instead of rewriting it.

## Security
- All writes to application data go through **`SECURITY DEFINER` RPCs** that use `auth.uid()`. **Client-callable RPCs never take a user id**, so one user cannot act for another.
- Internal helpers that take a user id (`close_weeks`, `week_summary`, `local_today`, `passes_used_in_month`) have `EXECUTE` revoked from `anon` and `authenticated` by the migration and are absent from the snapshot's permission list. **Exceptions in the live database:** `goal_for_week` and `cfg` (made by hand) are executable by `anon` and `authenticated`. They are not `SECURITY DEFINER`, so when called directly they run with the caller's rights: if row level security is enabled on `goal_history` (the policy `own rows` exists, but whether RLS is switched on is **unverified**), `goal_for_week` returns nothing for another user's id. The earlier plan assumed all helpers were closed; that is not true for these two.
- **`cms` is readable by everyone.** The live policies `Enable read access for all users` and `cms read` allow `SELECT` for role `public` with `using true`. The migration only intended `lpage_banner` and `tnc` to be public. So the `config.*` values (and any other row) can be read by anyone with the project's public key, and `cfg()` reads them for anon too. Nothing secret should ever be put in `cms`. Whether the broader policies are intended: **unverified**.
- **Direct `INSERT` on `showups` is still allowed** (policy `showups: insert own at own active gym`) until the planned lockdown (roadmap phase 8). Until then the one-per-day index still limits it to one row per day, but a modified app could insert a showup with any `distance_meters`, bypassing the server distance check. The app itself only uses `record_showup`.
- Row level security: every table allows users to read only their own rows; see the table in [overview.md](overview.md#row-level-security-from-the-snapshot).
- `is_admin` is not writable by app users; administrators are made in the SQL Editor.
- The frontend uses only the Supabase publishable key; the secret / service-role key is never used in the app.
