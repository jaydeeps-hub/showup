# Showup documentation

Showup is a React single-page app that talks directly to Supabase. A signed-in person saves one gym (chosen with Google Maps) and presses **Show up** when they are there. The database function `record_showup` measures the distance itself and stores at most one Showup per local calendar day. Everything that depends on time or history (weekly goal, weeks in a row, pause passes, the calendar) is calculated in Postgres from raw events and returned as JSON by SQL functions called as RPCs; the app only displays it. Weeks run Monday to Sunday in the user's own timezone, which the app sends from the device on launch.

## Index

**Backend**
- [backend/overview.md](backend/overview.md): tables and every RPC (inputs, JSON output, error codes, who may call it)
- [backend/rules-and-decisions.md](backend/rules-and-decisions.md): the business rules, config, security model and known errata
- [backend/manual-sql-log.md](backend/manual-sql-log.md): everything created by hand in Supabase that is not in `supabase/migrations/`
- [backend/live-schema-snapshot.sql](backend/live-schema-snapshot.sql): dump of the live functions, triggers, policies, indexes and columns

**Frontend**
- [frontend/design-system.md](frontend/design-system.md): tokens, fonts, the shared Loader, Toast and tab bar, and where the app differs from the prototype
- [frontend/screens-and-rpcs.md](frontend/screens-and-rpcs.md): what each screen calls and how errors become user text
- [design/showup-prototype.html](design/showup-prototype.html): the visual prototype (reference only)

**Project**
- [roadmap.md](roadmap.md): phase status
- [CHANGELOG.md](CHANGELOG.md): dated changes from the git log, grouped by backend and frontend

**Older docs (written before the calendar backend)**
- [PRODUCT_OVERVIEW.md](PRODUCT_OVERVIEW.md), [ARCHITECTURE.md](ARCHITECTURE.md), [CODE_GUIDE.md](CODE_GUIDE.md), [SETUP_SUPABASE.md](SETUP_SUPABASE.md), [versions/](versions/)
- [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) covers only `profiles`, `gyms`, `showups` and the migrations up to `place_search_mode`. It does not describe the calendar tables or functions (use `backend/overview.md`), and its advice "never change the database by hand" no longer matches practice (see the manual SQL log).

## Known gaps

- `docs/calendar-backend-design.md` is referred to in the project plan but is **not in this repository**. The erratum about it is recorded in [backend/rules-and-decisions.md](backend/rules-and-decisions.md#erratum-in-the-calendar-backend-design).
- Anything marked "unverified" in these docs could not be confirmed from the repo or the snapshot.
