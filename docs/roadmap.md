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
| 9 | Landing and Quick Start content from the database | **In progress** (9a database, 9b `cms` to `config`, 9c data layer, 9d-landing carousel, 9e Quick Start, 9f sign-in box done) | 9a: `cms` renamed to `config`, a new `cms` table for carousel cards and Quick Start slides, `get_cms_content()`, `profiles.quickstart_completed_at`, `complete_quickstart()` (`docs/backend/phase9a_cms_and_config.sql`, applied manually). 9b: the app reads the banner, Terms and carousel heading from `config` through one module with built-in defaults. 9d (landing part): the landing page shows the "Why it works" carousel from the `landing_carousel` rows. 9e: the Quick Start screen, when it appears, and the Profile "Quick start guide" button. Not tried in a browser or on a phone |

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
2. **Other places for the mascot:** the goal screen's logic is done (Phase 10c) but the screen is not built; the Profile avatar (`avatar` image) and the white logo (`logo_white`, now wanted on the landing page and Home, see Phase 10) are not built.
3. **`left_early` (80) and `missed_checks` (85) rank below `paused` (70)** in the table, so a paused week never shows them. Change the numbers in `mascot_messages` if that is not wanted.
4. **`lastOutcome` is forgotten on a page reload** (by design).
5. **`AppTabBar` and `ShowupFeedback` still re-render on every timer tick**; they could move to the selector hooks the same way Home did.

## Phase 10 progress (onboarding rework)
Design changes in `docs/design/showup-prototype.html` that Phase 10 has to build (recorded 2026-10-30):
1. **Setting a goal is optional.** The Set Goal step of onboarding gets a Skip button and a pop-up that encourages the person to set a goal. **Done.**
2. **Home with no goal:** the "0 weeks in a row" card becomes a "Set a Weekly Goal" button of the same size. It opens a standalone Set Goal screen with a Back button and no Skip. **Done:** the standalone screen (back arrow only, no Skip, no progress bar) and the Home card, which is now a "Set a weekly goal" button of the same size whenever there is no goal.
3. **No weekly progress bar above the calendar** for a person who has not set a goal.
4. **The Showup logo** on the landing page and on Home uses `logo_white` from `mascot_images` (it is live; `get_mascot_content()` returns it). **Done for the landing page, the Quick Start, and the Pause, Profile and error-screen header** (28 x 28, with the old shape as the fallback); **Home's own header is not changed yet.**

| Step | Status | Notes |
|---|---|---|
| 10a Database: mascot lines for the goal screen | Done | `docs/backend/10a_onboarding_mascot.sql`, applied manually and logged (items 34 to 37). `mascot_messages.screen` and `label`; `goal_1` ... `goal_7`; two "Gyms near me" settings in `config` (not read by the app yet). The schema snapshot is not regenerated yet |
| 10c Mascot logic for the goal screen | **Done** (no visual change) | `screen` and `label` on `MascotMessage`; `pickMascotMessage(..., screen = 'home')`; `pickGoalMascotMessage`; `goal_N` situations; the seven bundled goal rows as the fallback. Home behaviour and its tests are unchanged |
| 10d Details screen ("What should we call you?") | **Done** (UI only; not tried in a browser or on a phone) | `OnboardingStepHeader` (back arrow, 33% bar, "1 of 3"), the new title and note, plain design-style inputs with blur checks and Enter-to-next, Continue off until both names have text and pushed to the bottom. Save logic and routing unchanged. Back on this step signs out (to confirm) |
| 10e Weekly goal screen | **Done** (UI only; not tried in a browser or on a phone) | The onboarding design: header (100%, "3 of 3"), mascot row from the `goal_N` row (80px), big number with the database caption, seven radio buttons, help text, Set goal (60px, pushed to the bottom). `set_weekly_goal` and the routing are unchanged. Shared `MascotRow` now also draws Home's mascot. `goalLabel` removed |
| 10f Add gym screen | **Done** (UI only; not tried in a browser or on a phone) | The onboarding design: header (66%, "2 of 3"; from Profile a back arrow only), title, search box with a clear ✕, results as a radiogroup with a check, loading / error with Retry / no-results states, "Save gym" with the toast "<name> saved" and a 700 ms hand-off. Search and save logic unchanged. The dropdown became an inline list. No back arrow on the onboarding step (to confirm) |
| 10g "Gyms near me" | **Done** (not tried in a browser or on a phone) | Toggle row, location asked only on the tap, nearby search (Places API (New)) and a biased typed search, distances in the app, 5-minute in-memory cache, on/off flag in `localStorage` (applied only when location is already allowed), `gym_search_radius_meters` / `gym_search_max_results` in the app config. `place_search_mode` untouched |
| Onboarding flow: the weekly goal as step 3, and the Back arrow on steps 2 and 3 only | **Done** (not tried in a browser or on a phone) | `onboardingStep` in `App.tsx` and `utils/onboardingSteps.ts`: names → gym → goal → Home; Back from the goal returns to Add gym and from Add gym to the details (saved names filled in); no arrow on the details page (it used to sign out). Where it starts comes from stored data (no names: 1; no gym: 2; both: none). Fixes the goal screen being skipped. A second bug found on the way: the app's safety net moved a person off a lost gym screen only to show it again |
| Skip button and encouraging sheet on the goal step | **Done** (not tried in a browser or on a phone) | "Skip for now" under Set goal (onboarding only) opens a bottom sheet, "Skip setting a goal?", with "Set a goal" and "Skip for now"; skipping saves nothing and goes to Home. New reusable `BottomSheet`. The goal screen also has an explicit `mode`: opened from Home it now has only a back arrow (no progress bar, no "3 of 3", no Skip) |
| Home "Set a weekly goal" card in place of "weeks in a row" | **Done** (not tried in a browser or on a phone) | `KpiCards` / `SetGoalCard` in `HomeSummaryPanel.tsx`: same size, soft blue with a dashed border, a real button, shown only once the numbers have loaded and there is no goal. It replaces the old full-width "Set your weekly goal" button, and the "This week" block draws nothing without a goal |
| `logo_white` on the landing page, Quick Start, Pause, Profile and the error screen (design change 4) | **Done** (not tried in a browser or on a phone) | `BrandMarkImage` and `logoFrom`: the logo from `mascot_images`, 28 x 28, falling back to the blue dot or the tick square. Not verified in a real browser |
| `logo_white` on Home's own header (design change 4); "This week" progress bar above the calendar hidden without a goal (design change 3) | Not done | The week block under the cards is already empty without a goal, but the calendar's legend entry "Week goal hit" is still shown; check what the design means by "above the calendar" before calling this done |

## Phase 9 progress
| Step | Status | Notes |
|---|---|---|
| 9a Database (rename `cms` to `config`; new `cms` table, `get_cms_content()`, `quickstart_completed_at`, `complete_quickstart()`) | Done | Applied manually; logged in the manual SQL log (items 29 to 33) |
| 9b App reads `config` instead of `cms` | **Done** | `services/landingContent.ts`, `hooks/useLandingContent.ts`; the banner, Terms and `landing.carousel_heading` in one request, before sign-in, with built-in defaults |
| 9c Data layer for the carousel and Quick Start | **Done** (no screen yet) | `cmsService`, `cmsStore` (stale while revalidate, bundled starting content only on failure, an off category is not defaulted, 12 per category), `imageFor`, `quickstart_completed_at` in the profile read, `needsQuickStart`, `markQuickStartDone` with a retry on the next launch |
| 9d-landing Landing page carousel | **Done** (not tried in a browser or on a phone) | `features/landing/LandingCarousel.tsx`: heading from `landing.carousel_heading`, snap-scrolling cards from `useLandingCarouselItems()`, dots, card pictures with a mascot fallback; hidden entirely when the category is empty |
| 9f Floating sign-in box on the landing page | **Done** (not tried in a browser or on a phone) | `SignInBox`, `useCtaMode`, `chooseCtaMode`: sticky glass box with full / compact / static modes chosen from the visible viewport height, the box's measured height and the carousel's height, with hysteresis; the Terms line moved inside it; `viewport-fit=cover`; card text line-clamped |
| 9e Quick Start screen and Profile link | **Done** (not tried in a browser or on a phone) | `features/quickstart/QuickStartScreen.tsx`; shown by `App.tsx` before onboarding/Home via `needsQuickStart`, finish and Skip call `markQuickStartDone`; "Quick start guide" button on Profile; shared `CardPicture`, `CarouselDots`, `BrandLogo` |

**Important sequencing note for 9b.** The database rename was run BEFORE this app change was deployed. From that moment the deployed app (which still reads `cms` for the banner and Terms) gets "column cms.value does not exist": the landing page shows the "banner unavailable" frame and the Terms popup shows its error. It is fixed by deploying this change. Nothing in the database needs to change for it.

Still open after 9b:
1. (Closed in 9d-landing: the carousel heading is now shown above the carousel.)
2. The live `config` timer values differ from the earlier docs: `config.showup_duration_seconds` is 60 and `config.showup_check_interval_seconds` is 15 (measured 2026-10-29), not 900 and 300. The app follows the database, so a visit currently takes 60 seconds.
3. `supabase/tests/database.test.ts` still builds a stand-in table called `cms`, because it replays the old migrations, which name `public.cms`. That test was already failing for another reason and is left as it is.

## Open items (not phases)
- **`supabase/tests/database.test.ts` fails entirely (79 tests)** because it applies the calendar migration, which stops with "missing prerequisites: table goal_history" on the in-process database. This predates Phase 6 and is unchanged by it (before 6b: 79 failed, 143 passed; after: the same 79 failed, 273 passed).
- **Tests are stale.** After the tab bar, Profile and Home changes, several tests (for example in `App.profile.test.tsx` and `App.database.test.tsx`) look for removed buttons and headings and will fail. Not re-run or updated yet.
- **Schema snapshot** has no generation script in the repo and has not been committed (it is untracked). How it was produced: unverified.
- `docs/calendar-backend-design.md` is missing from the repo (see [backend/rules-and-decisions.md](backend/rules-and-decisions.md#erratum-in-the-calendar-backend-design)).
- The older [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md), [ARCHITECTURE.md](ARCHITECTURE.md) and [CODE_GUIDE.md](CODE_GUIDE.md) have not been updated for the calendar backend.
