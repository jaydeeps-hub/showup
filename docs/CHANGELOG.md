# Changelog (from the git log)

Built from `git log` on 2026-10-22, newest first, grouped by backend (migrations, SQL, database tests) and frontend (everything in `src/`, `index.html`, `public/`). A commit that touched both is listed in both groups. The older, hand-written, version-numbered history is in [../CHANGELOG.md](../CHANGELOG.md); this file does not replace it.

**Not in git:** the SQL run by hand in Supabase has no commit and no date. See [backend/manual-sql-log.md](backend/manual-sql-log.md).

## 2026-10-26 (not yet committed)

### Backend
- Phase 6 SQL (`docs/backend/phase6_showup_sessions.sql`, smoke test `phase6_smoke_test.sql`) applied manually in Supabase, not in migrations: tables `showup_sessions` and `showup_checks`; functions `get_showup_state`, `start_showup`, `check_showup`, `cancel_showup` and the internal `showup_grace_seconds`, `showup_checkpoints`, `showup_session_json`; four config rows. `record_showup` and the direct `INSERT` on `showups` are unchanged. See [backend/manual-sql-log.md](backend/manual-sql-log.md).

### Frontend
- Phase 6c, Home now uses the timed Show Up: the Show up button sits in a progress ring with the states idle, checking, running (countdown as M:SS, "Checked N of M times", Stop link) and done (green). Every message is one function, `showupMessage`, shown in the shared toast on any tab. The tabs are locked only while the location is being read to start, not for the whole timer. The provider now wraps every signed-in screen. Removed: the one-tap `record_showup` path, `attendanceService`, `geolocationService`, `showupService`, `utils/distance`, `FeedbackMessage`, the client-side distance and accuracy checks, `config.min_stay_minutes` / `minStayMinutes`, and the unused Showup count read. Rewrote `App.database.test.tsx` for the new flow and repaired the stale helpers in `App.placeSearch.test.tsx` (the administrator "any place" tests pass again).
- Phase 6b, the timed Show Up engine (no visible change): types for the new RPCs, `getPosition()`, the four RPC wrappers with strict JSON checking, a state machine (`idle | checking | running | done`) driven by the server's clock, a `ShowupProvider` and `useShowupSession()` mounted above the tabs, and a Wake Lock helper. 130 new unit tests.

## 2026-10-22

### Backend
- `1ab145c`: added `supabase/migrations/20261023100000_calendar_backend.sql`: `set_weekly_goal`, `use_pause`, `end_pause`, `record_showup`, `get_calendar`, `get_home_summary`, `get_app_config`, and the internal helpers `close_weeks`, `week_summary`, `local_today`, `week_start_of`, `calendar_distance_meters`, `cfg_int`, `passes_used_in_month`. It needs the hand-made tables and functions listed in the manual SQL log. `INSERT` on `showups` was deliberately left open.
- Applied manually the same period (undated, not in git): `get_goal_state`, `get_pause_state`, `set_my_timezone`.

### Frontend
- `c3aa8d7`: Profile redesign (avatar with initials, read rows, pencil, edit form with pinned Cancel/Save bar, goal stepper). Home polish ("Welcome back" header, singular "1 day" wording, full-width pass card). Sign out and the location disclaimer removed from Home. One shared Toast. Device timezone saved once per launch through `set_my_timezone`.
- `b1a52b2`: bottom tab bar (Pause, Home, Profile); "Pause a week" shortcut and the Back buttons removed from the three tab screens; prototype tab order updated.
- `d612e2c`: one set of design tokens (navy palette), Lexend and DM Sans, a single Loader replacing every spinner, 54px controls and 14px radii.
- `81fe2e2`: landing page root background matched for iOS pull-to-refresh.
- `1ab145c`: Show Up now calls `record_showup`; Home with total showups, weeks in a row and week progress; monthly calendar; weekly goal screen; Pause screen; settings read from `config.*` rows via `get_app_config`.

## 2026-10-21

### Backend
- `f3a0831`: added `supabase/migrations/20261022100000_cms_public_read.sql`, a read-only policy so signed-out visitors can read only `lpage_banner` and `tnc` from `cms`; extended `supabase/tests/database.test.ts`.

### Frontend
- `f3a0831`: the landing page (wordmark, mascot banner from `cms`, Terms popup rendered from Markdown).
- `9508c04`: removed the landing page card border and the extra empty space.
- `57c942f`: applied the Showup design system.

## 2026-10-19

### Backend
- `dea8773`: extended `supabase/tests/database.test.ts` with journey tests for saving a gym and a Showup. No migration.

### Frontend
- `dea8773`: gyms and Showups are saved to Supabase instead of browser storage.
- `17242da`: saved name shown on Home, Edit mode on Profile, birthday limited to 15+ years.

## 2026-10-17

### Backend
- `59bcfb7`: added `supabase/migrations/20261018100000_place_search_mode.sql` (`profiles.place_search_mode`, `set_place_search_mode`, `effective_place_search_mode`).
- `4e8c511`: added the first three migrations: core tables (`profiles`, `gyms`, `showups`), the profile-creation trigger, and row level security with column privileges; added the in-process database tests.

### Frontend
- `59bcfb7`: hardened the Google sign-in redirect; admin-only "any place" gym search setting.
- `a5ed971`: profile onboarding and Manage Profile.
- `4e8c511`: Google sign-in through Supabase replaces the demo login.
- `bc9693b`: UI redesign to the Showup visual design language.

## 2026-10-14

### Frontend
- `0aaff7c`: only gyms and fitness facilities can be saved as the gym.

## 2026-10-12

### Frontend
- `abf601c`: Showup MVP v0.1.0.
- `37ab2cf`: initial React app.

## Not yet committed
These documentation files and `docs/backend/live-schema-snapshot.sql` are new and untracked.
