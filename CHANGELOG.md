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
