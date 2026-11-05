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
| `quickstart_completed_at` timestamptz, null | When the person finished the Quick Start; **null until they do**. Nobody is marked as done in advance. Set once by `complete_quickstart()` (never overwritten). Read with the rest of the profile (table-level `select` grant, so no extra grant is needed). **Applied manually** (Phase 9a) |
| `timezone` text, default `Asia/Kolkata` | The user's timezone. Drives `local_today`, `showups.local_date` and every week boundary. Set by `set_my_timezone`. **Applied manually** |
| `username` text, null | The person's public handle. **Null for everyone who existed before Phase 11a** (the SQL sets nobody's), and null is a normal state. Check `profiles_username_format`: `^[a-z][a-z0-9_]{2,19}$` (3 to 20 characters, lowercase letters, digits and underscores, starting with a letter). Unique index `profiles_username_key` (many nulls are allowed; two people can never share a name; since only lowercase is allowed, it is case-insensitive). **The app never writes it**: the trigger `profiles_guard_username` refuses any change from `anon` or `authenticated`, so it changes only through `set_username()`. Read with the rest of the profile. **Applied manually** (Phase 11a) |
| `username_changed_at` timestamptz, null | When the person last changed their username through `set_username()`. Empty for a name set by hand in the SQL editor. Used for the cooldown between changes. Guarded the same way. **Applied manually** (Phase 11a) |

### `reserved_usernames` (names nobody can pick, Phase 11a) — applied manually
`name` text, primary key, with a check that it is already lowercase and trimmed and at least 3 characters; `note` text. Seeded with 70 names (`admin`, `support`, `showup`, `squad`, `profile`, `settings`, `login`, `api`, `null`, `gym` and so on, each with the note "seeded in Phase 11a"); add rows any time. RLS is on and `anon` and `authenticated` have **no** rights on it at all, so the app cannot read the list: `set_username()` and `is_username_available()` consult it and report a reserved name exactly like a taken one ("taken"). A reserved name can still be set by hand in the SQL editor (for an official account), because the list is only enforced inside `set_username()`. Source: `docs/backend/phase11a_username.sql`.

### `squad_links` (one row per pair of people, Phase 12a) — applied manually
`id` uuid, `requester_id` and `addressee_id` (both `auth.users(id)`, `on delete cascade`; a check that they differ), `status` (`pending`, `accepted` or `declined`; default `pending`), `created_at` (when the latest request was sent), `responded_at` (when it was accepted or declined). **One row per pair, whichever of them asked first**: the unique index `squad_links_one_per_pair` is on `(least(requester_id, addressee_id), greatest(requester_id, addressee_id))`. Indexes `squad_links_addressee (addressee_id, status)` and `squad_links_requester (requester_id, status)`. RLS is on and **every right is revoked from `anon` and `authenticated`**: the app never reads it directly (it needs other people's names, which `profiles`' row level security hides). Everything goes through the functions below. Source: `docs/backend/phase12a_squad.sql`.

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
One row per card or slide: `category` (`landing_carousel` or `quick_start`), `position` (order within the category, lowest first), `slug` (unique with `category`), `heading` (required), `subheading`, `image_url` (empty means the app shows a mascot picture), `image_alt`, `is_active`, `created_at`, `updated_at` (kept current by the trigger `cms_touch`). Eight starting rows (4 carousel cards, 4 Quick Start slides); their pictures have since been uploaded to the public `app-assets` bucket (measured 2026-10-29: every item had an address). Readable by everyone, writable by nobody from the app. **How many screens a carousel has is simply how many ACTIVE rows its category has**: hide a row with `is_active = false`, add a row to show more, and a category with no active rows is switched off. Read through `get_cms_content()` below. Source: `docs/backend/phase9a_cms_and_config.sql`.

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
`id`, `key` (a situation the app knows, for example `one_to_go`), `locale`, `priority` (**lower wins**), `expression` (must name a `mascot_images.key`), `message` (may contain `{goal} {done} {next} {left} {remaining} {wk} {total}`), `screen` (**Phase 10a**: `home` or `goal`, default `home`; which screen shows the line, check constraint `mascot_messages_screen_check`), `label` (**Phase 10a**: an optional short caption; the goal screen shows it under the big number), `scenario` and `shown_when` (notes for editors only), `is_active`, `created_at`, `updated_at`. The app decides which situations are true right now; this table decides which true one wins and what it says. Readable by everyone, writable by nobody from the app.

**The goal screen's rows (Phase 10a, applied manually from `docs/backend/10a_onboarding_mascot.sql`).** Seven rows with `screen = 'goal'`, keys `goal_1` ... `goal_7`, priority 1 to 7, one for each number of days a week. `goal_N` is true when the selected number is N, so exactly one row applies. All seven say the same bubble, "Pick a number you can keep. Rest days are part of the plan."; the face and the caption under the big number change:

| Key | Face (`expression`) | Caption (`label`) |
|---|---|---|
| `goal_1` | `smile` | A gentle start |
| `goal_2` | `smile` | Light and steady |
| `goal_3` | `smile` | Steady |
| `goal_4` | `smile` | Committed |
| `goal_5` | `lift` | A strong week |
| `goal_6` | `lift` | Nearly every day |
| `goal_7` | `sleep` | Are you sure? Rest days are important too. |

The Add gym screen has no mascot, so there are no `gym` rows (the SQL removes any an earlier version of it added).

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

## Carousel and Quick Start RPCs (Phase 9)

Source: `docs/backend/phase9a_cms_and_config.sql`, applied manually (the snapshot has not been regenerated since, so its permission list is **unverified** for these; the grants below are from the SQL file, and `get_cms_content` was confirmed callable with the public key on 2026-10-29).

### `get_cms_content()` → json
**Callable before sign-in** (`anon` and `authenticated`); `STABLE`, not `SECURITY DEFINER` (the table allows public reads). Returns
```
{ version: text,
  categories: { landing_carousel: [item, ...], quick_start: [item, ...] } }
item = { id, slug, position, heading, subheading, image_url, image_alt, v }
```
- `version` is **text**, for example `"1793260675788-8"`: the newest `updated_at` in milliseconds, a dash, and the number of rows. It changes when anything is edited, added, hidden or deleted, so the app swaps content in whenever it **differs** (it is not a number to compare).
- Only **active** rows, grouped by category, ordered by `position`, then `id`. A category with no active rows is **missing** from `categories` (it is switched off); it is not an empty list.
- `image_url` may be `''`. `v` is the row's `updated_at` in milliseconds, used to bust the image cache.
- No error codes: it only reads.

### `complete_quickstart()` → boolean
`SECURITY DEFINER`, `authenticated` only, takes no arguments (it uses `auth.uid()`). Sets `profiles.quickstart_completed_at` to now **only if it is still empty** (a second call changes nothing), and returns `true` if a profile row was updated, `false` if there was none. Error: `not_signed_in`.

## Username RPCs (Phase 11a)

Source: `docs/backend/phase11a_username.sql`, applied manually (the snapshot has not been regenerated since Phase 9a, so the grants below are from the SQL file and are **unverified** against the live database). Both are `SECURITY DEFINER` and executable by **`authenticated` only**; `anon` cannot call them. Both clean the value the same way first: `lower(btrim(coalesce(p_username, '')))`.

### `is_username_available(p_username text)` → json
`STABLE`. The live "is it free?" check while someone types. Never raises for a bad name; it reports it. Returns
```
{ username: text, available: boolean, reason: text | null, suggestion: text | null }
```
- `username` is the cleaned value. `reason` is `null` (free), `own` (it is the caller's current username; `available` is `true`), `empty`, `too_short`, `too_long`, `invalid_format` or `taken`. **A reserved name gives `taken`**, the same as one someone else has.
- `suggestion` is a free alternative, **only** when the name is taken: the name (shortened if needed) plus `_` and one of `22`, `23`, ... `29`, `99`, `11`, `10`, `21`, the first that is free and valid. `null` if none of those is free, and `null` for every other reason.
- Raises `not_signed_in` if there is no signed-in user.

### `set_username(p_username text)` → json
The **only** way a username is set or changed. Returns `{ username: text, changed: boolean }`; `changed` is `false` when the person already had exactly that name (nothing is written). Locks the caller's row (`for update`). Errors (the message **starts with** the code):
- `not_signed_in`, `profile_not_found`;
- `invalid_username: <reason>` with the same `empty`, `too_short`, `too_long`, `invalid_format`;
- `username_taken`: someone has it or it is reserved. Also raised if two people race for the same name and the unique index catches it (`unique_violation` is turned into `username_taken`);
- `username_cooldown: N day(s) left`: a CHANGE within `config.username_change_cooldown_days` of the last one. The first time a username is set is never limited, and a name set by hand (no `username_changed_at`) is never limited either.

Sets `username`, `username_changed_at = now()` and `updated_at`.

### The guard: `profiles_guard_username()` and trigger `profiles_guard_username`
`BEFORE INSERT OR UPDATE` on `profiles`. When the current role is `anon` or `authenticated`, it raises `username_locked: use set_username()` for an insert that sets `username` or `username_changed_at`, and for an update that changes either. `set_username()` runs as its owner, so it is not affected, and nor is the SQL editor. So the existing profile update (first name, last name, birthday) keeps working, as long as it does not send the username columns; the app never sends them.

### The setting `config.username_change_cooldown_days`
Inserted as `0` (no limit, fine while testing) only if the key did not exist, into `config` (or `cms` if the Phase 9a rename had not happened), with a remark suggesting 30 before launch. **Current value: unverified.**

## Squad RPCs (Phase 12a)

Source: `docs/backend/phase12a_squad.sql`, applied manually on 2026-11-06 (per the owner). **The live snapshot does not contain any of it yet** (checked: none of the table, the index or the ten functions appears in `live-schema-snapshot.sql`), so everything here is from the SQL file and is **unverified** against the live database. All six are `SECURITY DEFINER`, use `auth.uid()`, and are executable by **`authenticated` only**. **The other person is always given by USERNAME, never by a user id.** Every one raises `not_signed_in` without a signed-in user. A leading `@` and surrounding spaces are ignored, and the name is lowercased (`squad_clean_username`).

| Function | Input | Returns | Errors (the message starts with the code) |
|---|---|---|---|
| `search_people` | `p_query text` | `{ query, results: [ { username, first_name, last_name, relation } ] }` | `not_signed_in` |
| `send_squad_request` | `p_username text` | `{ status: 'requested' \| 'squad' }` | `not_signed_in`, `username_required: set a username first`, `user_not_found`, `cannot_add_self`, `already_in_squad`, `already_requested`, `squad_full`, `their_squad_full`, `request_cooldown: N day(s) left`, `too_many_requests` |
| `respond_squad_request` | `p_username text, p_accept boolean` | `{ status: 'squad' \| 'declined' }` | `not_signed_in`, `invalid_answer` (a null answer), `no_request`, `squad_full`, `their_squad_full` |
| `cancel_squad_request` | `p_username text` | boolean | `not_signed_in` |
| `remove_from_squad` | `p_username text` | boolean | `not_signed_in` |
| `get_squad` | none | see below | `not_signed_in` |

### `search_people(p_query text)` → json
`STABLE`. Cleans the query (a leading `@` dropped, trimmed, lowercased, runs of spaces made one, at most 50 characters). **Fewer than 2 characters returns `results: []`** without searching. Matches usernames, first names, last names and "first last", with `%` and `_` matched literally (`_` is common in usernames). **Never returns the caller, or anyone without a username.** Order: an exact username, then usernames that start with the query, then usernames that contain it, then name matches, then by username. At most `config.squad_search_max_results` (clamped to 1 to 50). `relation` is `none`, `requested` (you asked them), `incoming` (they asked you) or `squad`. **No stats for strangers.** `first_name` and `last_name` may be null.

### `send_squad_request(p_username text)` → json
Needs a username of your own first (`username_required`). The two people's requests are serialised with an advisory lock on the pair. Then:
- already squad-mates → `already_in_squad`; you already asked → `already_requested`;
- **they asked you first → asking back ACCEPTS** (after checking both squads have room: `squad_full` for yours, `their_squad_full` for theirs) and returns `{ status: 'squad' }`;
- **declined earlier:** the person who asked must wait `config.squad_request_cooldown_days` from the decline (`request_cooldown: N day(s) left`, N at least 1); the person who declined may ask at any time;
- otherwise `squad_full` if your squad is full, `too_many_requests` if you already have `config.squad_max_size` requests waiting, else the request is made (a declined row is reused and reset) and `{ status: 'requested' }` is returned.

### `respond_squad_request(p_username text, p_accept boolean)` → json
Answers a request `p_username` sent YOU. `no_request` if there is none pending to you (including an unknown username). Accepting checks both squads have room (`squad_full`, `their_squad_full`) and returns `{ status: 'squad' }`; declining sets `declined` (the request disappears for both, and starts the asker's cooldown) and returns `{ status: 'declined' }`. `invalid_answer` for a null `p_accept`.

### `cancel_squad_request(p_username text)` → boolean
Takes back a request YOU sent: deletes the pending row. `true` if one was cancelled, `false` if there was none.

### `remove_from_squad(p_username text)` → boolean
Leaves someone's squad (both stop seeing each other): deletes the accepted row. `true` if removed, `false` if you were not squad-mates or the username is unknown.

### `get_squad()` → json
```
{ squad_count, max_size, incoming_count,
  squad:    [ { username, first_name, last_name, since, total_showups, weeks_in_a_row } ],
  incoming: [ { username, first_name, last_name, requested_at } ],   -- they asked you
  outgoing: [ { username, first_name, last_name, requested_at } ] }  -- you asked them
```
**Stats only for squad-mates.** `total_showups` is every `showups` row of theirs; `weeks_in_a_row` uses the same rule as `get_home_summary` (the last frozen week's value, plus 1 once this week's goal is met; it closes their finished weeks first). The squad is ordered by weeks in a row, then total showups, then username; the requests by newest first. `since` and `requested_at` are **timestamps**, not calendar dates. `max_size` is `config.squad_max_size` (at least 1). Empty lists are `[]`, never null.

### Internal helpers (not callable from the app)
| Function | Returns | Purpose |
|---|---|---|
| `squad_clean_username(p text)` | text | `'@Jay '` → `'jay'`. `IMMUTABLE` |
| `squad_link_between(a uuid, b uuid)` | `squad_links` row | The link between two people, in either direction. `SECURITY DEFINER` |
| `squad_size(p_user uuid)` | int | How many squad-mates someone has (accepted links). `SECURITY DEFINER` |
| `squad_weeks_in_a_row(p_user uuid)` | int | Weeks in a row right now, as `get_home_summary` works it out. Calls `close_weeks` first. `SECURITY DEFINER` |
All four have `EXECUTE` revoked from `public`, `anon` and `authenticated`.

### Settings (`config` rows, inserted only if the key had never been set)
| Key | Inserted | Used by |
|---|---|---|
| `config.invite_url` | `https://showup-pied.vercel.app` | The app's invite sheet (read through `get_app_config`) |
| `config.squad_max_size` | `50` | The most squad-mates, and the most requests waiting; returned by `get_squad` as `max_size` |
| `config.squad_request_cooldown_days` | `7` | How long the person who asked waits after a decline |
| `config.squad_search_max_results` | `20` | The most `search_people` results (clamped to 1 to 50) |
**Current values: unverified** (the snapshot has no data).

Companion files: `phase12a_check.sql` (a self-check that creates three throwaway people, exercises the functions and ends with an error on purpose so nothing is saved) and `phase12a_undo.sql` (drops everything Phase 12a added and **deletes every squad link**). The app side is in [../frontend/screens-and-rpcs.md](../frontend/screens-and-rpcs.md).

## Mascot RPC (Phase 7)

Source: `docs/backend/phase7a_mascot_tables.sql` (Phase 7), redefined by `docs/backend/10a_onboarding_mascot.sql` (Phase 10a, adds `screen` and `label`). The live snapshot file has not been regenerated since Phase 9a, so it does not show the Phase 10a changes yet.

### `get_mascot_content(p_locale text default 'en')` → json
**Callable before sign-in** (`anon` and `authenticated`); `STABLE`, not `SECURITY DEFINER` (the tables allow public reads). Returns
```
{ version: bigint,
  images:   { <key>: { kind, url, alt, width, height, v } },
  messages: [ { id, key, screen, locale, priority, expression, message, label } ] }
```
- `version` is the newest `updated_at` across both tables, in milliseconds (0 if both are empty). It changes whenever anything is edited.
- `images` holds only **active** pictures with a **non-empty** address, keyed by `mascot_images.key`. `v` is that picture's own `updated_at` in milliseconds (used to bust the browser cache).
- `messages` holds the active rows ordered by `priority`, then `id`. A row is included if its `locale` is the requested one, or if it is English and that key has no active row in the requested locale (so a missing translation falls back to English per message).
- `screen` (`home` or `goal`) and `label` (text or `null`) are on **every** message since Phase 10a (`docs/backend/10a_onboarding_mascot.sql`, applied manually; the earlier source file `phase7a_mascot_tables.sql` still has the old shape of the function). An answer from before that has neither field; the app counts such a message as `home`.
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
| `username_problem(p_username text)` | text | `null` when the format is fine, else `empty`, `too_short`, `too_long` or `invalid_format`. `IMMUTABLE`. **Phase 11a, applied manually**; not executable by `anon` or `authenticated` |
| `username_taken(p_username text)` | boolean | True if a profile has that username **or** it is in `reserved_usernames`. `SECURITY DEFINER`. **Phase 11a, applied manually**; not executable by the app |
| `username_suggestion(p_username text)` | text | A free alternative (see `is_username_available`), or null. `SECURITY DEFINER`. **Phase 11a, applied manually**; not executable by the app |
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
| `squad_links` (Phase 12a) | RLS on, **no** policy, and every right revoked from `anon` and `authenticated`: the app cannot read or write it. Only the squad functions use it |
| `reserved_usernames` (Phase 11a) | RLS on, **no** policy, and every right revoked from `anon` and `authenticated`: the app cannot read or write it. Only the username functions use it |
