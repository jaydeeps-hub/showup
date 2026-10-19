# Code guide

A practical map of the code for future you. Read [ARCHITECTURE.md](ARCHITECTURE.md) first for the big picture; this guide is about *where to go to change things*.

## Ten-second orientation

- **Want to change a number or setting?** → `src/config/constants.ts`
- **Want to change wording after SHOW UP?** → `src/config/messages.ts`
- **Want to change what a screen looks like?** → `src/features/<feature>/…Screen.tsx`
- **Want to change colours or rounded corners?** → `src/app/theme.ts`
- **Want to change the rules for what counts?** → `src/services/attendanceService.ts`
- **Want to change how gyms or Showups are saved?** → `src/services/gymService.ts` and `src/services/showupService.ts`
- **Want to change app state or add a new action?** → `src/hooks/useShowup.ts`

## How a click becomes a Showup

Follow one press of the button through the files:

1. `components/ShowUpButton.tsx`: the button calls its `onClick` prop.
2. `features/attendance/HomeScreen.tsx`: `handleShowUp` calls `onShowUp()` and waits for the outcome.
3. `app/App.tsx`: connects `onShowUp` to `showup.showUp` from the hook.
4. `hooks/useShowup.ts`: `showUp` blocks double taps, sets `isVerifying`, and calls `attemptShowup`.
5. `services/attendanceService.ts`: `attemptShowup` gets the position, calls `evaluatePosition`, and on success, `recordShowup`.
6. `services/geolocationService.ts`: `getCurrentPosition` asks the browser for coordinates.
7. `utils/distance.ts`: `distanceInMetres` does the maths.
8. Back in the hook: for a success it calls `showupService.recordShowup`, which inserts a row into the Supabase `showups` table. Only when that succeeds does the counter go up.
9. Back in `HomeScreen`: `getFeedbackForOutcome` (`config/messages.ts`) picks the message, and `FeedbackMessage` shows it.

---

## Feature by feature

### Profile onboarding and Manage Profile

1. **Which files control it?** `src/features/profile/OnboardingScreen.tsx`, `ManageProfileScreen.tsx` and the shared `ProfileForm.tsx`. Routing is in `src/app/App.tsx`.
2. **What do they do?** `App.tsx` shows onboarding when the loaded profile has no first or last name, and the Profile page when the user taps their name on the home screen. The home screen name is the saved first and last name (`getDisplayName` in `utils/profileValidation.ts`), not the Google account name. The Profile page shows details as text; **Edit** swaps in `ProfileForm`; **Change gym** and **Sign out** live on the page. Both screens use `ProfileForm`, which validates, saves, shows errors, and keeps the typed values if saving fails.
3. **What do they depend on?** `hooks/useProfile.ts` (`save`), `services/profileService.ts` (`updateProfile`, the only database code), `utils/profileValidation.ts` (the rules and `isProfileComplete`), and the `profiles` table (see `docs/DATABASE_SCHEMA.md`).
4. **To change it, start at:** the rules in `utils/profileValidation.ts` (what counts as "complete", name length, and the birthday rule: `MINIMUM_AGE_YEARS` in `config/constants.ts` sets the 15-year limit used by both the date picker and the validation); wording in the two screen files; which fields exist in `ProfileEdits` (`types/index.ts`) and `updateProfile`. A new field also needs a database migration and a column privilege (`GRANT UPDATE`), or the database will refuse the save.
5. **Test after changing:** `npm test` (`profileValidation.test.ts`, `profileService.test.ts`, `App.profile.test.tsx`), then try a brand-new Google account, a refresh, and an offline save in the browser.

### Gym search mode (fitness places vs any place)

1. **Which files control it?** `src/services/gymValidation.ts` (`isPlaceAllowed`), `src/features/gym/GymSearch.tsx` (applies it), `src/features/profile/PlaceSearchModeSetting.tsx` (the admin-only switch), `src/services/profileService.ts` (`updatePlaceSearchMode`), and `supabase/migrations/20261018100000_place_search_mode.sql` (the real enforcement).
2. **What do they do?** The search only accepts fitness places unless the signed-in user is an administrator who chose "Any place". The choice is stored on the profile in Supabase and changed only through a database function that checks `is_admin`.
3. **What do they depend on?** `ALLOWED_GYM_PLACE_TYPES` in `config/constants.ts`, `useProfile` (`setPlaceSearchMode`), `Profile.placeSearchMode`.
4. **To change it, start at:** which places count as fitness: `ALLOWED_GYM_PLACE_TYPES`. Who may widen the search: the migration (a new migration, never edit an applied one). Never rely on hiding the control in the interface as the only protection.
5. **Test after changing:** `npm test` (`gymValidation.test.ts`, `App.placeSearch.test.tsx`, and the "place search mode" tests in `supabase/tests/database.test.ts`), then sign in as a normal user and as an administrator.

### Sign-in return address

1. **Which files control it?** `src/utils/authRedirect.ts` (decides the address and explains errors) and `src/services/authService.ts` (`signInWithGoogle`).
2. **What do they do?** They give Supabase the address to return to after Google, and turn any error on the returned URL into a friendly message.
3. **To change it, start at:** `chooseRedirectUrl`. Remember the Supabase **Redirect URLs** and **Site URL** dashboard settings must match (see README step 5).
4. **Test after changing:** `npm test` (`authRedirect.test.ts`) and a real sign-in on localhost **and** on the live site.

### Temporary user (welcome screen) — removed

The old demo login (`TemporaryUserScreen`) was replaced by Google sign-in. Sign-in lives in `features/authentication/LoginScreen.tsx` and `services/authService.ts`.

### Gym search and setup

1. **Which files control it?** `src/features/gym/GymSetupScreen.tsx` (heading, selected gym card, Save button) and `src/features/gym/GymSearch.tsx` (the search box and its loading/error states).
2. **What do they do?** `GymSearch` loads Google Maps, fetches suggestions as you type, and fetches full details when you pick one. `GymSetupScreen` shows the result and calls `onSave`.
3. **Depends on:** `services/mapsService.ts` (all Google calls), `services/gymValidation.ts` (is the place a gym?), `config/constants.ts` (debounce delay, minimum characters, `PRIMARY_GYM_LABEL`, `ALLOWED_GYM_PLACE_TYPES`), `components/GymSummary.tsx`, and `useShowup.saveGym`.
4. **To change it, start at:**
   - Search behaviour (e.g. restrict to gyms, or to one country): `searchPlaces` in `mapsService.ts`. Add options such as `includedPrimaryTypes: ['gym']` or `includedRegionCodes: ['in']` to the request.
   - Which kinds of places count as a gym: add or remove Google place types in `ALLOWED_GYM_PLACE_TYPES` (`config/constants.ts`). The full list is at https://developers.google.com/maps/documentation/places/web-service/place-types. The "Not a gym" wording is in `handleSelect` in `GymSearch.tsx`.
   - Which fields are saved: `getPlaceDetails` in `mapsService.ts`, the `SelectedPlace` and `Gym` types in `types/index.ts`, and `toGym`/`saveActiveGym` in `gymService.ts` (plus a database migration for any new column).
5. **Test after changing:** `npm test` (the maps tests use a fake Google library), then search in the browser for a real gym, a nonsense string (expect "No places found"), a non-gym such as a street address or restaurant (expect "Not a gym") and with the key removed (expect the setup warning).

### Home screen

1. **Which file controls it?** `src/features/attendance/HomeScreen.tsx`
2. **What does it do?** Lays out the gym card, the SHOW UP button, the counter and the Sign out link. The saved name at the top opens the Profile page. Shows feedback after each press.
3. **Depends on:** `components/ShowUpButton.tsx`, `ShowUpCounter.tsx`, `GymSummary.tsx`, `FeedbackMessage.tsx`, `config/messages.ts`.
4. **To change it, start at:** the screen for layout; the individual component for the button's size or the counter's label.
5. **Test after changing:** check at phone width (DevTools device toolbar, <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>M</kbd>) and desktop width; the button is disabled with "Checking location…" while verifying.

### Location verification rules

1. **Which file controls it?** `src/services/attendanceService.ts`
2. **What does it do?** `evaluatePosition` decides success, outside or poor accuracy. `attemptShowup` runs the whole check-and-record flow. `countShowups` produces the counter.
3. **Depends on:** `utils/distance.ts`, `services/geolocationService.ts` (only for the `GeolocationError` type), `config/constants.ts`.
4. **To change it, start at:** the constants first; then `evaluatePosition` if you need different logic.
5. **Test after changing:** `npm test`, especially `attendanceService.test.ts`. Add a test for any new rule. Then use DevTools → Sensors to fake a location near and far from the gym.

### Getting the device location

1. **Which file controls it?** `src/services/geolocationService.ts`
2. **What does it do?** Turns the browser's callback API into a Promise, and turns error codes into readable reasons.
3. **Depends on:** `GEOLOCATION_OPTIONS` in `config/constants.ts`.
4. **To change it, start at:** `GEOLOCATION_OPTIONS` for the timeout or high accuracy.
5. **Test after changing:** `geolocationService.test.ts`; in the browser, block location for the site (padlock icon → Location → Block) and press SHOW UP.

### Saving the gym and Showups

1. **Which files control it?** `src/services/gymService.ts` (the gym) and `src/services/showupService.ts` (Showups). Both talk to Supabase; nothing else queries the `gyms` or `showups` tables.
2. **What do they do?** `saveActiveGym` retires the old gym and inserts the new one (restoring the old one if the insert fails). `fetchActiveGym` loads the active gym. `recordShowup` inserts one Showup row. `fetchShowupCount` counts the user's rows.
3. **What do they depend on?** `supabaseClient.ts`, the `Gym` type, and the tables and permissions in `supabase/migrations/` (see `docs/DATABASE_SCHEMA.md`). `useShowup.ts` calls them.
4. **To change it, start at:** the service. A new field needs a new migration (a column, and a `GRANT INSERT` on it) before the service can send it, or the database will refuse the write.
5. **Test after changing:** `npm test` (`gymService.test.ts`, `showupService.test.ts`, `App.database.test.tsx`, and "what the app does against the database" in `supabase/tests/database.test.ts`), then in the browser save a gym, press SHOW UP, and check the rows in Supabase **Table Editor**.

### App state and screen switching

1. **Which files control it?** `src/hooks/useShowup.ts` and `src/app/App.tsx`
2. **What do they do?** The hook holds all saved data and exposes actions. `App` decides which screen to show from that data.
3. **Depends on:** every service.
4. **To change it, start at:** `App.tsx` to add or reorder screens; the hook to add a new action.
5. **Test after changing:** the full manual checklist in [versions/v0.1.0.md](versions/v0.1.0.md).

### Look and feel

1. **Which file controls it?** `src/app/theme.ts`
2. **What does it do?** Builds the Material UI theme (palette, type scale, shape, short transitions, component styles) from the design tokens in `src/design-system/tokens.ts`.
3. **Depends on:** nothing.
4. **To change it, start at:** `src/design-system/tokens.ts` for colours, radii, spacing and motion timings; `theme.ts` only for how components use them.
5. **Test after changing:** text contrast is still readable, especially the dark text on the accent-coloured button.

---

## Worked examples of likely changes

### Adjust the geofence radius

Change `GEOFENCE_RADIUS_METRES` in `src/config/constants.ts`, for example to `150`. Consider changing `MAX_LOCATION_ACCURACY_METRES` to match, since accepting a reading less precise than the radius itself makes little sense. Run `npm test`; the "uses the configured radius" test adapts automatically.

### Change the success message

Edit the `'success'` case in `getFeedbackForOutcome`, `src/config/messages.ts`. No other file needs to change. Other messages (outside the gym, permission denied, and so on) are in the same file.

### Allow only one Showup per day

Add a check in `attemptShowup` (`attendanceService.ts`) *before* `recordShowup`: if `data.events` already has an event for this user with today's date, return a new outcome such as `{ type: 'already-recorded-today' }`. Then:

1. add that outcome to the `ShowupOutcome` type in `types/index.ts`;
2. add a message for it in `messages.ts` (TypeScript will flag the missing case);
3. add a test in `attendanceService.test.ts`.

### Add a weekly workout goal

1. **Data:** add `weeklyGoal: number | null` to `TemporaryUser` (or a new `settings` object) in `types/index.ts`.
2. **Storage:** add a column in a new migration and handle rows that existed *before* the field (see the next section).
3. **Logic:** add a pure function such as `countShowupsThisWeek(data, userId, now)` to `attendanceService.ts`, with tests. Decide what "week" means (Monday start? local time zone?).
4. **State:** expose `showupsThisWeek` and `setWeeklyGoal` from `useShowup.ts`.
5. **UI:** show "3 / 4 this week" in `ShowUpCounter` or a new small component, and add a way to set the goal.

### Changing the data model safely

Users already have data saved in the old shape. Options:

- **Backwards-compatible addition:** make the new field optional, and treat a missing value as a default when reading.
- **Breaking change:** bump `schemaVersion` to `2`, then in `loadData` check for version 1 data and convert it (a "migration") before validating. Without a migration, old data will show the "could not be read" screen, which is safe but loses users' history.

Record any data-model change in `CHANGELOG.md`.

### Move the Show Up decision to the server

Today the browser measures the distance and the database trusts it, so someone who fakes their location can add Showups. To fix that:

1. Create a Supabase Edge Function that receives the coordinates, loads the user's active gym, runs the same `evaluatePosition` rules (`attendanceService.ts` has no browser dependencies, so it can be reused), and inserts the row itself.
2. Remove the `showups` INSERT privilege from `authenticated` (new migration), so the function is the only way in.
3. Change `showupService.recordShowup` to call the function instead of inserting.

### Support multiple gyms

`ShowupData.gyms` is already an array and events already store `gymId`. You would change `saveGym` to add instead of replace, give each gym its own label, let `evaluatePosition` run against every gym (picking the nearest one inside the radius), and add a gym list to the UI.

---

## Testing cheat-sheet

| Command | When |
|---|---|
| `npm test` | After any logic change |
| `npm run test:watch` | While writing tests |
| `npm run typecheck` | After changing types; catches broken props |
| `npm run lint` | Before committing |
| `npm run build` | Before committing; catches everything the deploy would |

Tests sit next to their code: `distance.ts` ↔ `distance.test.ts`. Shared sample data is in `src/test/fixtures.ts`. Tests never touch the real Google Maps, GPS or localStorage. Each file swaps in a small fake using `vi.stubGlobal` or `vi.mock`.
