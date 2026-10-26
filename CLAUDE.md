# Showup

Showup is a location-verified gym attendance app. A person saves one gym and presses **Show up** when they are there. The database measures the distance and counts one Showup per local calendar day. Weekly goals, weeks in a row and pause passes are all worked out by the database; the app only displays them.

**Stack:** React 19 + TypeScript + Vite 8, MUI 9, Google Maps Places API (New), Supabase (Google sign-in, Postgres, row level security, SQL functions called as RPCs), deployed on Vercel. Tests use Vitest (and PGlite for the migrations). Checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

## Rules for future work

- Read [docs/README.md](docs/README.md) before changing the backend or the UI contracts.
- Any SQL run manually in Supabase must be logged in [docs/backend/manual-sql-log.md](docs/backend/manual-sql-log.md).
- After any backend phase, regenerate [docs/backend/live-schema-snapshot.sql](docs/backend/live-schema-snapshot.sql) and update [docs/CHANGELOG.md](docs/CHANGELOG.md). (No script in the repo produces the snapshot; how it was generated is unverified.)
- Never insert into `showups` directly from the app; showing up goes through the timed Show Up RPCs (`start_showup`, `check_showup`, `cancel_showup`, `get_showup_state`). The app no longer calls `record_showup`.

## Working agreements (from the project owner)

- Do not commit or push to GitHub without the owner's approval.
- Never put secrets in the repo: the Maps key lives in the git-ignored `.env`, the Supabase publishable key in `.env.local`. The Supabase secret / service-role key is never used in frontend code.
- Calendar dates are `YYYY-MM-DD` strings. Never turn them into a `Date` with `new Date(string)`; use `src/utils/calendarDates.ts`.
