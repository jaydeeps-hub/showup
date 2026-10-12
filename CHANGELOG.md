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
