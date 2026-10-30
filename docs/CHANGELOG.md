# Changelog (from the git log)

Built from `git log` on 2026-10-22, newest first, grouped by backend (migrations, SQL, database tests) and frontend (everything in `src/`, `index.html`, `public/`). A commit that touched both is listed in both groups. The older, hand-written, version-numbered history is in [../CHANGELOG.md](../CHANGELOG.md); this file does not replace it.

**Not in git:** the SQL run by hand in Supabase has no commit and no date. See [backend/manual-sql-log.md](backend/manual-sql-log.md).

## 2026-10-30 (not yet committed)

### Backend
- Phase 10a SQL (`docs/backend/10a_onboarding_mascot.sql`) applied manually in Supabase, not in migrations: `mascot_messages` gets `screen` (`home` or `goal`, default `home`) and `label`; `get_mascot_content()` returns both for every message; seven goal-screen lines `goal_1` ... `goal_7` are added; two `config` settings for "Gyms near me" (`config.gym_search_radius_meters` = 5000, `config.gym_search_max_results` = 20) are added. Logged in `manual-sql-log.md` (items 34 to 37). The live schema snapshot has not been regenerated.

### Frontend
- Phase 10f, the Add gym screen in the onboarding design (UI only; the Google search and the save are unchanged): the shared top row (66% bar and "2 of 3" in onboarding; a back arrow only from Profile's "Change gym"), the title, a search box with an icon and a clear ✕, the results as a radiogroup of rows with a check mark, and the design's loading ("Finding gyms…" with three placeholder rows), error ("Couldn’t load gyms" with Retry) and no-results states. "Save gym" shows "<name> saved" and, after 700 ms, moves on (back to Profile when opened from there). The toast now belongs to `App`, the page is one screen tall with only the list scrolling, and the gym screen can no longer be left while a save is on its way. The dropdown (`Autocomplete`) is gone; the old "Selected as Gym 1" card is gone (the chosen row shows a check).
- Phase 10g, "Gyms near me": a toggle row between the search box and the results. Location is asked for only when the person turns it on (low accuracy, 10 s, a minute-old position is fine); a refusal turns it back off with a note. With an empty box it lists gyms around the device (Places API (New) `searchNearby`, gyms only, nearest first, `gym_search_radius_meters` 5000 / `gym_search_max_results` 20); with text it biases the usual search toward the device and sorts by distance. Distances are worked out in the app. Results are kept in memory for 5 minutes, the position is never stored or sent anywhere but to Google for the search, and only an on/off flag is remembered in this browser (applied on open only when location is already allowed). `profiles.place_search_mode` is not used or changed. New: `NearMeToggle`, `useNearMe`, `useNearMeSearch`, `GymScreenBack`, `utils/distance.ts`, `utils/nearMeCache.ts`, `getNearMePosition`, `searchNearbyGyms`; `searchPlaces` takes an optional position.
- Fixed after review (three independent reviews and a mutation run of 10f and 10g): pressing Back during a save no longer strands the person on a gym screen; a cache hit no longer leaves "Finding gyms…" on; the ✕ is off while details load and late details for a changed search are ignored; the choice is dropped when the toggle is used; the nearby list has a Retry; the loading state shows at once instead of "No gyms found" for 300 ms; cached results are not reused after a place is picked. 164 new tests across the gym files, the distance and cache helpers and the config; the existing gym journeys were updated to the new screen.
- Phase 10e, the weekly goal screen in the onboarding design (UI only; `set_weekly_goal` and the routing are unchanged): the shared top row (back arrow, 100% bar, "3 of 3", no tab bar), the title "How often will you show up?", a mascot row (picture 80px tall on the left, speech bubble on the right) taken from the `goal_N` row for the selected number, a 96px Lexend number with the row's label as its caption (day 7: "Are you sure? Rest days are important too.", a nudge only: 7 stays selectable and savable), seven radio buttons (56px) starting on the pending goal, else the current goal, else 3, the help text, and a 60px Set goal button pushed to the bottom. If the mascot content has not loaded, the bundled goal rows are used. New: `MascotRow` (the picture and bubble, now also used by Home's `MascotBubble`, which is unchanged in behaviour), `useGoalMascot`, `usePreloadMascotImages`, `config/mascotLayout.ts`. Removed: the hard-coded captions `goalLabel`. 37 new tests; Home's 43 mascot tests pass unchanged.
- Phase 10d, the details screen of onboarding, UI only: a shared top row (back arrow, progress bar 33% full, "1 of 3") with no tab bar; the title "What should we call you?" and the note "Just the basics. It takes a few seconds."; First name, Last name and Date of birth (an "Optional" tag and "You can add this later.") as design-style inputs with the right autocomplete, capitalisation and keyboard hints; an empty name is flagged on blur with a red border and "Enter your first name" / "Enter your last name" and cleared by typing; Enter moves First name to Last name to Date of birth; Continue is 54px, pushed to the bottom, and off until both names have text. The save logic, the 15-year birthday rule and the step routing are unchanged. Back on this first step signs out. `hasNameText`, `NAME_REQUIRED_MESSAGE` (in `profileValidation.ts`), `progressPercent` and `OnboardingStepHeader` are new; `ProfileForm` no longer has a Cancel button (nothing used it). 30 new tests in a new file; in the existing files only the new wording and the disabled Continue changed (two onboarding tests in `App.profile.test.tsx` were rewritten, the title was updated in four more, and in `App.quickStart.test.tsx`).
- Phase 10c, the mascot logic for the goal screen (no visual change): `MascotMessage` has `screen` and `label`, read by `mascotService`; a message with no `screen` counts as Home; `pickMascotMessage` takes a fourth `screen` argument (default `home`) so Home is unchanged; `pickGoalMascotMessage` returns the face, bubble and caption for the selected number with `goal_1` ... `goal_7` situations; the seven goal rows are bundled as the fallback when the content has none. 41 new tests; the existing mascot tests are untouched.

## 2026-10-29 (not yet committed)

### Backend
- Phase 9a SQL (`docs/backend/phase9a_cms_and_config.sql`) applied manually in Supabase, not in migrations: the old `cms` table was **renamed `config`** (all rows kept; `cfg()` and `get_app_config()` now read it, with the same names and grants); a **new table `cms`** (eight landing-card and Quick Start rows), `get_cms_content()`, `profiles.quickstart_completed_at` and `complete_quickstart()` were added; the row `landing.carousel_heading` ("Why it works") was added to `config`. The old migration files still say `public.cms` and were not changed. See [backend/manual-sql-log.md](backend/manual-sql-log.md).

### Frontend
- Phase 9f, the floating sign-in box on the landing page: "Get started today." (full mode only), the two Google buttons and the Terms line (moved in unchanged) sit in a glass box (translucent with blur, solid where blur is unsupported or less transparency is asked for) that floats at the bottom of the screen with `position: sticky` when there is room, and otherwise ends the page. `chooseCtaMode` (pure, in `utils/ctaMode.ts`) picks full, compact or static from the visible viewport height, the box's real measured heights and the carousel block's height, never floating in landscape or under 420px tall, with 24px of hysteresis; `useCtaMode` measures and decides before first paint and again on resize, rotation, visual viewport change, font load and size changes. The viewport meta gains `viewport-fit=cover`. Carousel card headings are limited to 2 lines and subheadings to 3. 54 new tests.
- Phase 9e, the Quick Start: a full screen (no tab bar) with the brand, a Skip link, a swipeable carousel (45px threshold, 0.3s slide, none under reduced motion), dots and one button, with one slide per `quick_start` item (4:3 picture with the mascot smile/lift/focus/cheer when there is none or it fails). The last button says "Set up my profile" for someone with no first name, otherwise "Done"; Skip does the same. It is shown once, before onboarding or Home, to a signed-in person who has not finished it (`needsQuickStart`), and finishing or skipping calls `markQuickStartDone()`. With no `quick_start` items it is not shown and nothing is recorded; if the fetch fails the bundled slides are used. Profile gets a "Quick start guide" button under the details list (hidden while editing and when there are no items) that opens it ending in "Done" and never records anything. The landing carousel's picture, dots and wordmark became shared components (`CardPicture`, `CarouselDots`, `BrandLogo`). The test that said the app reads no `showup:` browser keys now says the gym is not kept there, because the cached content and the Quick Start reminder legitimately are. 43 new tests.
- Phase 9d (landing part), the "Why it works" carousel on the landing page: `features/landing/LandingCarousel.tsx` shows the `landing.carousel_heading` and a snap-scrolling row of cards, one per active `landing_carousel` row, with dots, the card's own picture (mascot wave/cheer/focus/sleep when it has none or fails to load), and labels for screen readers. Nothing is drawn when the category is empty. `fallbackExpression` lives in `utils/cms.ts`. The Quick Start screen is still to do. 22 new tests.
- Phase 9c, the data layer for the landing carousel and the Quick Start (no visible change): `fetchCmsContent()` over `get_cms_content()` with strict parsing and a safety limit of 12 cards per category; a stale-while-revalidate store (saved in `localStorage`, refreshed on launch and when the tab is visible after 5 minutes, swapped whenever the text `version` differs); the 8 starting rows bundled and used only when a fetch fails with nothing saved, never to fill in a category the database switched off; `imageFor`; `profiles.quickstart_completed_at` added to the existing profile read; `needsQuickStart`; and `markQuickStartDone` / `useQuickStart`, which never block the person and retry on the next launch if the database could not be told. Includes 118 new tests. The `Profile` type gained `quickstartCompletedAt`. No screen uses any of it yet.
- Phase 9b, the app reads the table `config` (now config, renamed from `cms` in Phase 9) instead of `cms`: the landing banner, the Terms and the new carousel heading are read in ONE request, before sign-in, by `services/landingContent.ts` and `hooks/useLandingContent.ts` (the newest row per `content_type` wins; rows are found by `content_type` only, not by id; key names unchanged). Every key has a built-in default: the design's mascot banner (now a file, `public/images/landing-banner-default.jpg`), "Why it works", and the line "By continuing you agree to the Terms and Privacy Policy.". A missing, empty, unsafe or failing banner now shows the built-in picture instead of an "unavailable" frame. Removed `cmsService.ts` and `useCmsValue.ts`; moved the image address check to `utils/imageUrl.ts`. `get_app_config()` is untouched. **The deployed app breaks between the database rename and deploying this change.**

## 2026-10-27 (not yet committed)

### Backend
- Phase 7a SQL (`docs/backend/phase7a_mascot_tables.sql`) applied manually in Supabase, not in migrations: tables `mascot_images` and `mascot_messages` (with 16 starting messages and 8 picture rows that have no addresses yet), the trigger function `mascot_touch_updated_at`, the function `get_mascot_content(p_locale)` (callable before sign-in), the public `app-assets` bucket (if it could be created from SQL), and the `cms` row `config.mascot_almost_seconds` = 180. See [backend/manual-sql-log.md](backend/manual-sql-log.md).

### Frontend
- Phase 7d, the mascot on Home: a picture (104px high, decorative, with a fallback to the smile picture and then none, and every picture preloaded) and a speech bubble between the summary cards and the paused banner, with the words picked from the table by the 7c logic. The greeting reads "Welcome" for a user with no showups. The mascot is wrapped in an error boundary so it can never break Home. To keep a running timer from re-rendering Home, added `useShowupSelector` and `useShowupActions`, a `ConnectedShowUpButton` that reads the clock itself, and a stepped seconds value for the bubble (about 16 changes over a 15 minute timer instead of 901). `lastOutcome` now has a visible effect. No pictures are uploaded yet, so only the words show.
- Phase 7c, the mascot logic (no visible change): `fetchMascotContent`, a stale-while-revalidate store that keeps the last content in `localStorage` and refreshes on launch and on becoming visible after 5 minutes, bundled default words (no pictures), the situation and picking logic (code decides what is true, the table decides what wins), placeholder filling, picture lookup with cache busting, and `lastOutcome` (`left_early` or `missed_checks`) held by the Show Up engine. `config.mascot_almost_seconds` is read through the app config. Includes a parity test against the prototype's `skey()`. No screen uses it yet.

## 2026-10-26

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
