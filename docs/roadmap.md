# Roadmap

Status as of 2026-10-22, from the code and `git log` (not from memory). "Done" means the code is in `main`; none of the UI phases has been tried in a browser by me, and the older tests have not been re-run (see CHANGELOG notes).

| # | Phase | Status | Evidence |
|---|---|---|---|
| 1 | Tokens, fonts and loader | **Done** | `d612e2c`: one token set, Lexend + DM Sans, `Loader` component replacing every spinner |
| 2 | Tab bar (Pause, Home, Profile) | **Done** | `b1a52b2`: `BottomNav`; order Pause, Home, Profile |
| 3 | Profile layout | **Done** | `c3aa8d7`: avatar, read rows, pencil, edit form, pinned Cancel/Save bar, goal stepper |
| 4 | Home polish | **Done** | `c3aa8d7`: "Welcome back" header, "1 day" wording, week segments, paused banner, full-width pass card, shared Toast; Sign out and the disclaimer removed |
| 5 | Device timezone | **Done** | `c3aa8d7`: `useSaveDeviceTimezone` calls `set_my_timezone` once per launch. Caveat: the first Home load may precede it |
| 6 | Timed Show Up flow with `showup_sessions` | **Done** (6a, 6b, 6c) | 6a: backend live (`docs/backend/phase6_showup_sessions.sql`, present in the snapshot). 6b: the engine (`services/showupEngine.ts`, `ShowupProvider`, `useShowupSession`). 6c: Home's button, ring and messages now use it; the old `record_showup` path, the client-side distance/accuracy check and `min_stay_minutes` are removed. **Not yet tried in a browser or on a phone** |
| 7 | Mascot and CMS messages | **Mostly done** (7a, 7c, 7d on Home done) | 7a: tables, `get_mascot_content` and starting messages are live (`docs/backend/phase7a_mascot_tables.sql`). 7c: fetch, cache, bundled words, situation logic, picking, `lastOutcome`. 7d: the mascot picture and speech bubble on Home between the summary cards and the paused banner, and "Welcome" for a user with no showups. **No pictures are uploaded yet** (every `image_url` starts empty), so only the words show. Not yet on the goal screen, the Profile avatar or the landing page. Not tried in a browser or on a phone |
| 8 | Lockdown | **Not done** | Snapshot still shows policy `showups: insert own at own active gym` (INSERT, `authenticated`); `record_showup` is the app's only writer but direct inserts are still possible. No revoke migration |

## Phase 8 notes (planned, not started)
- Revoke `INSERT` on `public.showups` from `authenticated` (and drop or tighten the insert policy), so only `record_showup` (`SECURITY DEFINER`) can add rows. This is a manual change in Supabase; log it in [backend/manual-sql-log.md](backend/manual-sql-log.md).
- Since 6c nothing in the app calls `record_showup`, so phase 8 can revoke direct `INSERT` on `showups` and decide whether to keep `record_showup` at all.

## Phase 6 progress
| Step | Status | Notes |
|---|---|---|
| 6a Read-only inventory | Done | |
| 6b Engine (types, RPC wrappers, position, state machine, provider, wake lock, tests) | Done | 130 unit tests |
| 6c UI (button states, ring, messages, tab lock, removal of the old path) | **Done** | Home journey tests cover the flow. Not tried on a real phone |

Still open after 6c:
1. With `max_missed_checks = 0`, one missed check ends the visit. That is harsh on iPhone Safari, where timers and location pause in the background. A decision on whether to allow some missed checks (`config.showup_max_missed_checks`) is needed before real users rely on it.
2. Home takes "today" (for the calendar highlight) from the device clock, not the server (`get_showup_state.today`). Cosmetic.
3. Whether to keep `record_showup` at all is a phase 8 decision. Nothing in the app calls it now.

## Phase 7 progress
| Step | Status | Notes |
|---|---|---|
| 7a Backend (tables, RPC, starting messages, `config.mascot_almost_seconds`) | Done | Applied manually; logged in the manual SQL log |
| 7b Read-only inventory | Done | |
| 7c Logic (service, cache, defaults, situations, picking, `lastOutcome`) | **Done** | 135 new tests |
| 7d UI (mascot row on Home, the speech bubble) | **Done** | Home only. The avatar, the logo, the goal screen and the landing page are not part of it |

Still open after 7d:
1. **Upload the pictures.** Put the PNGs in the public `app-assets` bucket and set `mascot_images.image_url` for `smile`, `wave`, `cheer`, `lift`, `focus` and `sleep`. Until then the mascot shows words only. Once at least one picture exists, a message whose expression has no picture is skipped in favour of the next one.
2. **Other places for the mascot:** the goal screen (the prototype has one), the Profile avatar (`avatar` image) and a white logo (`logo_white`) are not built.
3. **`left_early` (80) and `missed_checks` (85) rank below `paused` (70)** in the table, so a paused week never shows them. Change the numbers in `mascot_messages` if that is not wanted.
4. **`lastOutcome` is forgotten on a page reload** (by design).
5. **`AppTabBar` and `ShowupFeedback` still re-render on every timer tick**; they could move to the selector hooks the same way Home did.

## Open items (not phases)
- **`supabase/tests/database.test.ts` fails entirely (79 tests)** because it applies the calendar migration, which stops with "missing prerequisites: table goal_history" on the in-process database. This predates Phase 6 and is unchanged by it (before 6b: 79 failed, 143 passed; after: the same 79 failed, 273 passed).
- **Tests are stale.** After the tab bar, Profile and Home changes, several tests (for example in `App.profile.test.tsx` and `App.database.test.tsx`) look for removed buttons and headings and will fail. Not re-run or updated yet.
- **Schema snapshot** has no generation script in the repo and has not been committed (it is untracked). How it was produced: unverified.
- `docs/calendar-backend-design.md` is missing from the repo (see [backend/rules-and-decisions.md](backend/rules-and-decisions.md#erratum-in-the-calendar-backend-design)).
- The older [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md), [ARCHITECTURE.md](ARCHITECTURE.md) and [CODE_GUIDE.md](CODE_GUIDE.md) have not been updated for the calendar backend.
