# Architecture

Showup is a **client-side single-page app** (React + Vite) with no server of its own. The browser talks directly to three outside services:

- **Supabase** for Google sign-in and the Postgres database (profiles, gyms, Showups).
- **Google Maps** for gym search.
- **The browser itself** for location (Geolocation) and, for now, for storing the gym and the Showup counter (`localStorage`).

> **Where data lives today.** Sign-in and the `profiles` table are live in Supabase. The `gyms` and `showups` tables exist and are secured, but the app does **not** read or write them yet: the gym and Showup history are still saved in `localStorage`, keyed by the signed-in user's ID. Moving them is a later step. See [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md).

## The big picture

The code is split into layers. Each layer only talks to the one below it.

```
┌──────────────────────────────────────────────┐
│  Screens & components   (src/features, src/components)
│  Show things; call callbacks when clicked.   │
├──────────────────────────────────────────────┤
│  App + useShowup hook   (src/app, src/hooks) │
│  Owns the app state; decides which screen.   │
├──────────────────────────────────────────────┤
│  Services               (src/services)       │
│  Rules, storage, geolocation, Google Maps.   │
├──────────────────────────────────────────────┤
│  Utils, config, types   (src/utils, src/config, src/types)
└──────────────────────────────────────────────┘
```

The rules that decide whether a Showup counts (`attendanceService.ts`) contain no React code. That makes them easy to test and easy to move to a server later.

## Main user flow

```mermaid
flowchart TD
    Start([App opens]) --> Load[Load data from localStorage]
    Load -->|damaged / blocked| Problem[Storage problem screen<br/>Reset or continue without saving]
    Load -->|no user| Welcome[Welcome screen<br/>username + temporary password]
    Load -->|user, no gym| Setup
    Load -->|user + gym| Home
    Problem --> Welcome
    Welcome -->|Continue| Setup[Gym setup<br/>Google Maps search]
    Setup -->|Save as Gym 1| Home[Home screen<br/>SHOW UP + counter]
    Home -->|Change gym| Setup
    Home -->|Log out & reset| Welcome
    Home -->|SHOW UP| Locate[Get current position]
    Locate -->|error| ErrorMsg[Explain the problem<br/>count unchanged]
    Locate --> Accuracy{Accuracy within<br/>100 m?}
    Accuracy -->|no, and might be inside| Retry[Ask user to retry<br/>count unchanged]
    Accuracy -->|yes, or clearly far away| Distance{Within 100 m<br/>of gym?}
    Distance -->|no| Outside[Not at your gym<br/>count unchanged]
    Distance -->|yes| Record[Add ShowupEvent<br/>save → count + 1]
    ErrorMsg --> Home
    Retry --> Home
    Outside --> Home
    Record --> Home
```

## Folders

| Folder | Purpose |
|---|---|
| `src/app/` | `App.tsx` (chooses the screen), `theme.ts` (MUI dark theme), and the storage problem screen. |
| `src/features/` | One folder per feature, each holding its screen(s): `authentication/`, `gym/`, `attendance/`. |
| `src/components/` | Small reusable UI pieces with no business logic: the button, counter, gym card, feedback message and page layout. |
| `src/hooks/` | `useShowup.ts`: the app's state and actions, shared by all screens. |
| `src/services/` | Code that talks to the outside world (Supabase Auth and database, localStorage, Geolocation, Google Maps) and the attendance rules. |
| `supabase/` | The database: `migrations/` (SQL that defines the tables, trigger and security) and `tests/` (checks that run those migrations on a throw-away Postgres). |
| `src/utils/` | Pure helper functions: distance maths and ID generation. |
| `src/config/` | Settings (`constants.ts`) and user-facing feedback text (`messages.ts`). |
| `src/types/` | TypeScript shapes for users, gyms, events and outcomes. |
| `src/test/` | Shared test data (fixtures). Test files themselves sit next to the code they test (`*.test.ts`). |
| `docs/` | This documentation. |

## How components communicate

Data flows **down** as props, and events flow **up** as callbacks:

1. `App.tsx` calls `useShowup()` once. That gives it the current `user`, `gym`, `showupCount`, `isVerifying`, and the actions `createUser`, `saveGym`, `showUp`, `resetDemoData`.
2. `App` picks a screen and passes it only what that screen needs. For example, `HomeScreen` gets `gym`, `showupCount` and `onShowUp`.
3. Screens pass smaller pieces down to components (`ShowUpButton`, `ShowUpCounter`, `GymSummary`).
4. When something happens (a button press), the component calls the callback it was given, and the change travels back up to `useShowup`.
5. `useShowup` updates its state and saves it. React re-renders, and the new values flow down again.

There is no global store, context or router. With three screens, props and an `if` chain in `App.tsx` are the simplest option.

The only UI state that lives *inside* screens is local and temporary: form inputs, the search text, the selected place, and whether a dialog is open.

## Users: Auth users, profiles, gyms and Showups

```mermaid
flowchart LR
    G[Google sign-in] --> A[(auth.users<br/>managed by Supabase)]
    A -- "trigger: on_auth_user_created" --> P[(public.profiles<br/>1 row per user)]
    A --- Y[(public.gyms<br/>many over time, 1 active)]
    A --- S[(public.showups<br/>append-only history)]
    Y -- "gym_id + user_id" --> S
```

**Auth user.** When someone signs in with Google, Supabase creates (or finds) their row in `auth.users`. The app never writes to that table. `authService.ts` talks to Supabase Auth, `useAuth` exposes `loading | signed-out | signed-in`, and `App.tsx` shows the login screen or the app. The Auth user's `id` is the identity everywhere else.

**Profile.** A database trigger creates a `public.profiles` row with the **same id** the moment the Auth user is created, so every signed-in user has a profile. Authentication and profile loading are kept apart on purpose: `profileService.ts` is the only code that queries `profiles`, and `useProfile` loads it *after* sign-in. If the profile is missing or fails to load, the app shows a notice but keeps working. (Step 3 will use the profile for onboarding.)

**Gyms and Showups.** Each belongs to an Auth user (`user_id`). A Showup points at a gym through `(gym_id, user_id)`, so it can only reference a gym its own user owns. Changing gym marks the old gym inactive and adds a new one, so old Showups still point at the gym they were measured against. Deleting an Auth user removes their profile, gyms and Showups; nobody can delete a gym that has Showups.

**Security.** Row Level Security plus column privileges, defined in the migrations, ensure users can read only their own rows, edit only their own name and date of birth, and can never change `is_admin`. The frontend uses only the public **publishable** key; the secret / `service_role` key is never used in the app.

**Browser data keyed by user.** Until gyms and Showups move to the database, `useShowup(user)` stores them in `localStorage` under the Auth user's `id`, so two Google accounts on one browser keep separate gyms and counts.

## Selecting and saving a gym

1. `GymSearch` asks `mapsService.loadPlacesLibrary()` to load the Google Maps script (only once per page). It then creates an **autocomplete session token**.
2. As the user types (at least 3 characters, 300 ms after they stop), it calls `searchPlaces(text, token)`. That uses `AutocompleteSuggestion.fetchAutocompleteSuggestions` from Places API (New).
3. Suggestions appear in an MUI `Autocomplete`. When one is picked, `getPlaceDetails` calls `prediction.toPlace().fetchFields(['id', 'displayName', 'formattedAddress', 'location', 'types'])`.
4. **Gym check:** `isFitnessPlace(types)` in `services/gymValidation.ts` checks Google's categories for the place against `ALLOWED_GYM_PLACE_TYPES` (`config/constants.ts`), e.g. `gym`, `fitness_center` or `yoga_studio`. If none match, `GymSearch` shows "Not a gym … Please select another place." and nothing can be saved. This stops people saving a random spot, such as their home, and earning Showups there. The types are used only for this check and are not stored.
5. If it passes, the result is a `SelectedPlace`. `GymSetupScreen` shows it in a `GymSummary` card and enables **Save as Gym 1**.
6. `useShowup.saveGym` turns it into a `Gym` with its own Showup `id`, the user's `userId`, the label "Gym 1", and a `createdAt` timestamp. It replaces any previous gym for that user.

The gym gets its **own** ID, separate from Google's `googlePlaceId`, so events never depend on Google's identifiers.

## How geolocation verification works

When SHOW UP is pressed:

1. `useShowup.showUp` returns immediately if a check is already running. It uses a ref (`verificationInProgress`), not just state, so even two very fast taps can't start two checks. The button is also disabled while `isVerifying` is true.
2. It calls `attendanceService.attemptShowup`, passing `getCurrentPosition` from `geolocationService`.
3. `getCurrentPosition` wraps `navigator.geolocation.getCurrentPosition` in a Promise. It asks for `enableHighAccuracy: true`, a 15 s timeout and no cached position. Browser errors become a `GeolocationError` with a `reason`: `unsupported`, `permission-denied`, `unavailable` or `timeout`.
4. `evaluatePosition` decides the outcome:
   - Calculate the distance to the gym.
   - If the reported accuracy is worse than `MAX_LOCATION_ACCURACY_METRES` (100 m) **and** the user could be inside the geofence → `poor-accuracy` (ask them to retry).
   - Otherwise, distance ≤ `GEOFENCE_RADIUS_METRES` (100 m) → `success`; anything further → `outside-geofence`.
   - "Clearly outside" means *distance − accuracy > radius*: even the most generous reading puts the user outside. That gets "not at your gym" rather than a confusing accuracy message.
5. On `success` only, `recordShowup` adds a `ShowupEvent`, and the new data is saved.
6. `HomeScreen` turns the outcome into text using `getFeedbackForOutcome` (`config/messages.ts`). It shows a snackbar for success and a dialog for anything else.

## How distance is calculated

`utils/distance.ts` uses the **Haversine formula**, which gives the great-circle distance between two latitude/longitude points on a sphere with the Earth's mean radius (6,371 km). At gym-sized distances it is accurate to well under a metre, far more precise than the GPS reading itself.

## Persistence: counter and history

All data is one JSON object in `localStorage` under the key `showup:data:v1`:

```ts
interface ShowupData {
  schemaVersion: 1
  user: TemporaryUser | null
  gyms: Gym[]            // one gym in v0.1.0
  events: ShowupEvent[]  // successful Showups only
}
```

- **The counter is not stored separately.** `countShowups` counts the user's events, so the counter and the history *cannot* disagree. The stored total *is* the history.
- `storageService.loadData` checks the JSON's shape before trusting it. It returns `ok`, `corrupted` (bad JSON, wrong shape or unknown `schemaVersion`) or `unavailable` (storage blocked). The app shows `StorageProblemScreen` for the last two instead of crashing.
- `saveData` returns `false` if writing fails (e.g. storage full). The app then shows a warning banner.
- `storageService.ts` is the **only** file that touches `localStorage`.

The shape mirrors three future database tables (`users`, `gyms`, `showup_events`). Every gym and event carries a `userId`.

## External APIs

| API | Where | Notes |
|---|---|---|
| Google Maps JavaScript API + Places API (New) | `services/mapsService.ts` only | Loaded with `@googlemaps/js-api-loader` (`setOptions` + `importLibrary('places')`). Uses session tokens to group autocomplete calls into one billing session. Key comes from `VITE_GOOGLE_MAPS_API_KEY`. |
| Browser Geolocation | `services/geolocationService.ts` only | Requires HTTPS or localhost. |
| Browser localStorage | `services/storageService.ts` only | Per browser, per site. Holds the gym and Showup history until they move to Supabase. |
| Supabase Auth (Google) | `services/authService.ts` (via `supabaseClient.ts`) | Publishable key only. Redirect URLs must be allowed in the Supabase dashboard. |
| Supabase database | `services/profileService.ts` (via `supabaseClient.ts`) | Reads `public.profiles`. Protected by Row Level Security. |

Keeping each external API in one file means it can be replaced, or faked in tests, without touching the UI.
