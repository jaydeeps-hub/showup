# Changelog

All notable changes to Showup are recorded here, newest first.
Versions follow [Semantic Versioning](https://semver.org): `MAJOR.MINOR.PATCH`.

<!--
Template for each new version:

## [x.y.z] - YYYY-MM-DD

### What changed
### Why
### Important files modified
### Data model changes   (and whether schemaVersion changed)
### Migration / configuration steps
### Tests performed      (only list what was actually run, with results)
-->

## [Unreleased] - Gyms and Showups saved to Supabase (v2, step 6)

Not yet committed or released. Builds on step 5 (already pushed).

### What changed

- **Bug fix:** saving a gym or pressing SHOW UP never wrote to the Supabase `gyms` and `showups` tables, because the app still saved them to the browser's localStorage (the tables were created in step 2 but never connected). Both are now written to Supabase.
- **Saving a gym** retires the previous gym (`is_active = false`) and inserts the new one; if the insert fails the old gym is restored. The screen changes only after the database confirms, and shows an error (keeping the choice) otherwise.
- **SHOW UP** inserts one `showups` row (gym, distance, accuracy; user and time are set by the database). The counter is the number of the user's rows. If the row cannot be saved the user is told "Your Showup wasn't saved" and nothing is counted.
- If the gym cannot be loaded the app shows "We couldn't load your gym" with a retry, rather than offering to choose a new one.
- The browser-storage layer (`storageService`, its recovery screen, the local data types) is removed.

### Why

Data in one browser could not follow the user, could not be reported on, and was not what the database was built for.

### Important files

- New: `src/services/gymService.ts`, `src/services/showupService.ts`, `src/app/DataLoadErrorScreen.tsx`
- Changed: `src/hooks/useShowup.ts` (rewritten), `src/services/attendanceService.ts` (now `checkLocation`; no local history), `src/features/gym/GymSetupScreen.tsx`, `src/app/App.tsx`, `src/config/messages.ts`, `src/types/index.ts`, `src/config/constants.ts`
- Removed: `src/services/storageService.ts` (+ test), `src/app/StorageProblemScreen.tsx`
- Tests: `gymService.test.ts`, `showupService.test.ts`, `App.database.test.tsx`, additions to `supabase/tests/database.test.ts`

### Data model changes

None. No migration: the existing tables and permissions already allow exactly these operations (verified by new database tests). The `localStorage` key `showup:data:v1` is no longer read or written.

### Migration / configuration steps

None for the database, provided the step 2 and step 4 migrations are applied. **Users must choose their gym once more**: gyms and Showups saved in the browser under the old system are not imported (the database sets each Showup's time itself, so old visits could not keep their dates).

### Tests performed

See the final report.

## [Unreleased] - Profile page fixes (v2, step 5)

Not yet committed or released. Builds on step 4 (already pushed).

### What changed

1. **Home page name:** it now shows the first and last name saved in the profile instead of the Google account name (the Google name is used only while the profile cannot be loaded). The name is a button that opens the Profile page, and the separate **Profile** link at the bottom is gone.
2. **Profile page:** details are shown as plain text with an **Edit** button; the name and birthday fields are editable only after pressing it (Save changes returns to the read-only view, Cancel discards). **Change gym** moved here from the home screen, and a **Back** button returns home.
3. **Birthday:** the date picker now stops at exactly 15 years before today, and the form rejects any later date (including typed ones), with the message "Birthday must be at least 15 years ago."

### Why

The home page showed an unfamiliar name, the form invited accidental edits, and future or very recent birthdays were accepted.

### Important files

`src/features/attendance/HomeScreen.tsx`, `src/features/profile/ManageProfileScreen.tsx`, `src/features/profile/ProfileForm.tsx`, `src/utils/profileValidation.ts`, `src/config/constants.ts` (`MINIMUM_AGE_YEARS`), `src/app/App.tsx`. Tests: `profileValidation.test.ts`, `App.profile.test.tsx`, `App.placeSearch.test.tsx`.

### Data model changes

None. No migration. Note: the database still only rejects birthdays before 1900; the 15-year rule is enforced in the app.

### Tests performed

See the final report.

## [Unreleased] - Production login fix and gym search mode (v2, step 4)

Not yet committed or released. Builds on steps 1-3 (already pushed).

### What changed

- **Bug fix, production sign-in:** on the live site Google sign-in returned the user to `localhost:5173`. Cause: Supabase ignores the app's requested return address unless it is on the dashboard's Redirect URLs allow-list, and then falls back to the **Site URL**, which had been set to `http://localhost:5173` (as the README advised). The code already used the current address, so this needed a dashboard change (documented in README step 5 and SETUP_SUPABASE section 8). The code was also hardened: the return address is chosen in one tested place (`utils/authRedirect.ts`) with an optional `VITE_SITE_URL` override that is ignored on localhost, an invalid address is refused instead of used, and errors on the returned URL are shown as a plain message and cleared from the address bar.
- **Gym search mode:** regular users can search and save only gyms and fitness places (already true since 0.1.1, now driven by a setting). Administrators get **Gym search (administrator)** in Manage Profile to switch between *Fitness places only* and *Any place*. The setting is stored in Supabase and enforced by the database. It applies to first-time setup and Change gym.

### Why

Production login was unusable, and "any place" must be an administrator privilege that a normal user cannot reach by editing the frontend.

### Important files

- Login: `src/utils/authRedirect.ts` (new), `src/services/authService.ts`, `src/features/authentication/LoginScreen.tsx`, `src/config/constants.ts`, `.env.example`
- Search mode: `supabase/migrations/20261018100000_place_search_mode.sql` (new), `src/services/gymValidation.ts`, `src/features/gym/GymSearch.tsx`, `GymSetupScreen.tsx`, `src/features/profile/PlaceSearchModeSetting.tsx` (new), `ManageProfileScreen.tsx`, `src/services/profileService.ts`, `src/hooks/useProfile.ts`, `src/app/App.tsx`, `src/types/index.ts`
- Tests: `src/utils/authRedirect.test.ts`, `src/app/App.placeSearch.test.tsx`, additions to `gymValidation.test.ts`, `profileService.test.ts`, `supabase/tests/database.test.ts`

### Data model changes

New column `profiles.place_search_mode` (`'fitness_only'` default, or `'any_place'`), and functions `set_place_search_mode(text)` and `effective_place_search_mode()`. Existing rows become `fitness_only`. `gyms` and `showups` are unchanged.

### Migration / configuration steps

1. Run `supabase/migrations/20261018100000_place_search_mode.sql` in the Supabase SQL Editor (see `docs/SETUP_SUPABASE.md`).
2. **Fix the login bug in the Supabase dashboard:** set **Authentication → URL Configuration → Site URL** to the live Vercel address and make sure **Redirect URLs** lists it, plus `http://localhost:5173` and `http://localhost:4173`. Then redeploy and retest on a phone.
3. To use the admin setting, make an account an administrator in the SQL Editor (`SETUP_SUPABASE.md` section 4).

### Tests performed

See the final report. Not tested: the migration on the real Supabase project, and a real Google sign-in on the live site (the dashboard change above is required first).

## [Unreleased] - Profile onboarding and Manage Profile (v2, step 3)

Not yet committed or released. Builds on steps 1-2 (already pushed).

### What changed

- **Onboarding:** after Google sign-in, a profile with no first or last name sees "Let's get to know you." (first name, last name, optional birthday). It is shown once; after saving it is skipped, including after a refresh. A loading screen is shown while the profile loads, so the app never flashes before onboarding.
- **Manage Profile:** a **Profile** button on the home screen opens a page to edit first name, last name and birthday, see the Google email (read-only), save or cancel, and sign out.
- Saving updates the user's existing `profiles` row (never inserts). Failed saves keep everything typed and can be retried.
- No admin control is shown, and `is_admin` is never sent to the database.

### Why

Every user needs a real name for the app, and a birthday for later birthday messages, and existing users need a place to change them.

### Important files

- New: `src/features/profile/` (`ProfileForm.tsx`, `OnboardingScreen.tsx`, `ManageProfileScreen.tsx`), `src/utils/profileValidation.ts`
- Changed: `src/services/profileService.ts` (`updateProfile`), `src/hooks/useProfile.ts` (`save`), `src/app/App.tsx` (routing), `src/features/attendance/HomeScreen.tsx` (Profile button), `src/types/index.ts`, `src/config/constants.ts`, `vite.config.ts`
- Tests: `src/utils/profileValidation.test.ts`, `src/services/profileService.test.ts`, `src/app/App.profile.test.tsx`

### Data model changes

None. No database migration. The existing column privileges already allow updating exactly `first_name`, `last_name` and `date_of_birth`.

### Migration / configuration steps

Run `npm install` (new dev dependencies for tests: `jsdom`, `@testing-library/*`). Nothing to change in Supabase, provided the Step 2 migrations have been applied.

### Tests performed

See the final report for the latest results. Not tested: the screens against the real Supabase project with a real Google account (needs the manual steps in the README).

## [Unreleased] - Supabase sign-in and database (v2, steps 1-2)

Not yet committed or released.

### What changed

- **Step 1:** Google sign-in through Supabase replaces the temporary demo login. The session is restored on reload, and **Sign out** replaces "Log out & reset". Gyms and Showups stay in `localStorage` but are now keyed by the signed-in Google account.
- **Step 2:** Added a version-controlled Supabase database: `profiles`, `gyms` and `showups` tables, a trigger that creates a profile for every new Auth user, and Row Level Security with column-level privileges (users cannot change `is_admin`). The app loads the signed-in user's profile through a small service and shows a notice if it is missing or cannot be loaded. No profile forms yet.

### Why

To give Showup real accounts and a place to store data safely, before moving gyms and attendance off the browser.

### Important files

- Step 1: `src/services/supabaseClient.ts`, `authService.ts`, `src/hooks/useAuth.ts`, `src/features/authentication/LoginScreen.tsx`, `src/app/App.tsx`, `src/hooks/useShowup.ts`, `.env.example`
- Step 2: `supabase/migrations/*.sql` (3 files), `supabase/tests/database.test.ts`, `src/services/profileService.ts`, `src/hooks/useProfile.ts`, `src/types/index.ts`, `docs/DATABASE_SCHEMA.md`, `docs/SETUP_SUPABASE.md`
- Removed: `src/features/authentication/TemporaryUserScreen.tsx`

### Data model changes

New Supabase tables `profiles`, `gyms`, `showups` (see `docs/DATABASE_SCHEMA.md`). The `localStorage` format (`showup:data:v1`) is unchanged, but its `user` field is no longer used; gyms and events are matched by Auth user ID. Data saved under the old demo profile will not appear for a Google account.

### Migration / configuration steps

1. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
2. Configure Google OAuth in Google Cloud and Supabase, and allow the redirect URLs (README, "Configuring sign-in").
3. Run the three SQL files in `supabase/migrations/` in order (`docs/SETUP_SUPABASE.md`), then run the verification queries there.
4. Add the two `VITE_SUPABASE_*` variables in Vercel and redeploy.

### Tests performed

- `npm run typecheck`, `npm run lint`: clean (after the final code change)
- `npm test`: see the final report; the new `supabase/tests/database.test.ts` (48 tests) passed against an in-process Postgres, and three deliberate security breakages were each caught by the tests
- **Not tested:** the migrations on the real hosted Supabase project, Google sign-in, and the profile trigger with a real Google account. These need the manual steps above.

## [0.2.0] - 2026-10-17

### What changed

Redesigned the whole interface to follow the Showup Visual Design Language v1.1.0: charcoal surfaces, a blue primary accent, Inter typography, the 4 px spacing scale, consistent 8-16 px radii, MUI icons, visible keyboard focus, 44-48 px touch targets, status messages that pair colour with icons and text, and short (100-280 ms) transitions that are switched off when the user prefers reduced motion.

### Why

The first version was a functional placeholder (green accent, no motion). This brings the look and feel in line with the intended calm, premium identity.

### Important files modified

- `src/design-system/tokens.ts` (new): the design tokens, the single source of truth
- `src/app/theme.ts`: rebuilt from the tokens
- `src/components/*`, `src/features/*`, `src/app/StorageProblemScreen.tsx`: restyled; behaviour is unchanged
- `index.html`, `public/favicon.svg`, `src/index.css`: Inter font, new theme colour and icon
- `package.json`: added `@mui/icons-material`

### Data model changes

None.

### Migration / configuration steps

Run `npm install` (new dependency `@mui/icons-material`). The Inter font loads from Google Fonts; if it is blocked, the app falls back to Roboto/Arial.

### Tests performed

- `npm run typecheck`, `npm run lint`: clean
- Automated unit tests: deliberately **not run** for this release (UI-only change, requested by the owner)
- Manual browser and contrast checks: not yet performed

## [0.1.1] - 2026-10-14

Details: [docs/versions/v0.1.1.md](docs/versions/v0.1.1.md).

### What changed

When a place is selected in gym search, Showup now checks Google Maps' categories for it. Only gyms, fitness centres and similar sports facilities can be saved. Anything else shows "Not a gym … Please select another place."

### Why

To stop people saving a random location (such as their home) as their gym and collecting Showups without going to a gym.

### Important files modified

- `src/services/gymValidation.ts` (new): `isFitnessPlace`
- `src/config/constants.ts`: new `ALLOWED_GYM_PLACE_TYPES`
- `src/services/mapsService.ts`: `getPlaceDetails` also fetches `types` and now returns `{ place, types }`
- `src/features/gym/GymSearch.tsx`: rejects non-fitness places

### Data model changes

None. Place types are checked at selection time and are not saved. `schemaVersion` is still 1.

### Migration / configuration steps

None. No new API or environment variable is needed: `types` is part of Places API (New). Gyms saved before this version are not re-checked.

### Tests performed

- `npm test`: 46 passed, 0 failed (6 files; new `gymValidation.test.ts`, updated `mapsService.test.ts`)
- `npm run typecheck`, `npm run lint`: clean
- `npm run build`: succeeded
- Manual browser testing: not yet performed

## [0.1.0] - 2026-10-12

First MVP release. Full details: [docs/versions/v0.1.0.md](docs/versions/v0.1.0.md).

### What changed

- Converted the Vite JavaScript starter to TypeScript and removed the template's demo files.
- Added the temporary demo profile, Google Maps gym search, home screen, location-verified SHOW UP, and localStorage persistence.
- Added the dark Material UI theme.
- Added unit tests (Vitest) and documentation.

### Why

To validate the core Showup interaction with the smallest working app.

### Important files

`src/app/App.tsx`, `src/hooks/useShowup.ts`, `src/services/*`, `src/features/*`, `src/config/constants.ts`.

### Data model

New: `ShowupData` (`schemaVersion: 1`) stored under `localStorage["showup:data:v1"]`, containing `user`, `gyms[]` and `events[]`.

### Configuration

Requires `VITE_GOOGLE_MAPS_API_KEY` in `.env`, with the Maps JavaScript API and Places API (New) enabled (see README).

### Tests performed

- `npm test`: 35 passed, 0 failed
- `npm run typecheck`, `npm run lint`: clean
- `npm run build`: succeeded
- Manual browser testing: not yet performed
