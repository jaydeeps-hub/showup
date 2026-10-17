# Supabase setup: database

Do this once, after Google sign-in is working (see the README section "Configuring sign-in"). It creates the tables, the profile-creation trigger and the security rules in your Supabase project.

> **Status:** the migrations have been tested against a local Postgres (`npm test`), but have **not** yet been run on your real Supabase project. Follow the steps below and the checks in section 3 to confirm.

## What you must do manually

Nothing in this project can change your hosted database for you. You do these steps in the Supabase dashboard:

1. Run the three migration files in the SQL Editor, in order (section 1).
2. Run the verification queries (section 3).
3. Sign in once and confirm a profile was created (section 3).
4. Optionally make yourself an administrator (section 4).

## 1. Apply the migrations

### Option A: SQL Editor (no installs, recommended for now)

1. Open the [Supabase dashboard](https://supabase.com/dashboard) and choose your project.
2. Open **SQL Editor** → **New query**.
3. Open `supabase/migrations/20261017120000_create_core_tables.sql` in VS Code, copy **all** of it, paste it into the editor, and click **Run**. Expect "Success. No rows returned".
4. Repeat for `20261017120100_provision_profiles.sql`, then `20261017120200_row_level_security.sql`. **Keep this order.**
5. If any step shows an error, stop, and do not continue to the next file. Copy the error message; most errors mean a file was already run once (for example "relation already exists"). Do not run a file twice.

### Option B: Supabase CLI (later, when you want repeatable deployments)

The CLI is not installed in this project. When you want it:

```bash
npx supabase login
npx supabase link --project-ref rjhvjnqtzbpkvcdouqxf
npx supabase db push
```

`db push` applies any migration in `supabase/migrations/` that your project has not run yet. Use either option for a given database; do not mix them, or the CLI will try to re-run files you already pasted into the SQL Editor.

## 2. Existing users

The second migration also creates profiles for everyone who has **already** signed in (including you, if you tested Google sign-in earlier). New users get theirs automatically.

## 3. Verify

Run each query in the SQL Editor.

**The three tables exist and Row Level Security is on** — `rls_on` must be `true` for every row:

```sql
select c.relname as table_name, c.relrowsecurity as rls_on
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relname in ('profiles', 'gyms', 'showups')
order by 1;
```

**The policies exist** — expect 7 rows:

```sql
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

**Signed-in users cannot change `is_admin`** — expect `false` in `can_update_is_admin`, and `true` for the three name/date columns:

```sql
select
  has_column_privilege('authenticated', 'public.profiles', 'is_admin', 'UPDATE')       as can_update_is_admin,
  has_column_privilege('authenticated', 'public.profiles', 'first_name', 'UPDATE')     as can_update_first_name,
  has_column_privilege('authenticated', 'public.profiles', 'date_of_birth', 'UPDATE')  as can_update_dob;
```

**Signed-out visitors have no access** — expect `false`, `false`, `false`:

```sql
select
  has_table_privilege('anon', 'public.profiles', 'SELECT') as anon_profiles,
  has_table_privilege('anon', 'public.gyms',     'SELECT') as anon_gyms,
  has_table_privilege('anon', 'public.showups',  'SELECT') as anon_showups;
```

**The trigger is installed** — expect one row:

```sql
select tgname from pg_trigger where tgname = 'on_auth_user_created';
```

**A profile exists for each user** — `profiles` should have one row per Auth user (the SQL Editor ignores Row Level Security, so you see everyone):

```sql
select
  (select count(*) from auth.users)      as auth_users,
  (select count(*) from public.profiles) as profiles;
```

**New sign-ups get a profile (end-to-end test):**

1. Sign in to the running app with a Google account that has **not** signed in before (or delete your test user first under **Authentication → Users**, then sign in again).
2. Run `select id, first_name, last_name, is_admin from public.profiles order by created_at desc limit 3;`
3. The newest row should be your account, with `is_admin = false`.
4. In the app, no yellow "profile was not found" banner should appear above the page.

## 4. Making someone an administrator

Only you can do this, in the SQL Editor (the app cannot):

```sql
update public.profiles set is_admin = true where id = (select id from auth.users where email = 'you@example.com');
```

To remove it, set `is_admin = false` the same way. Admin features themselves come in a later step.

## 5. Troubleshooting

| Symptom | Likely cause |
|---|---|
| Yellow banner "profile was not found" in the app | Migrations not run yet, or run in the wrong order. Run section 3's last check, then run migration 2 (its back-fill creates missing profiles). |
| Yellow banner "profile could not be loaded" | Migration 3 not run (no read access), the project URL/key in `.env.local` points at a different project, or a network problem. The message in brackets says which. |
| `permission denied for table profiles` in the browser console | Same as above: migration 3 has not been applied, or has not been applied completely. |
| SQL Editor: `relation "public.profiles" already exists` | That migration was already run. Skip it. |
| SQL Editor: `permission denied for schema auth` or `must be owner` | You are not running it as the project owner in the dashboard SQL Editor. |

## 6. Keys and secrets

- The app uses only the **Project URL** and the **publishable key** (`.env.local`).
- The **secret key** and `service_role` key bypass all of the security above. Never put them in frontend code, a `VITE_` variable, `.env.example`, a commit or a chat. If one is exposed, rotate it in **Project Settings → API Keys**.

## 7. Running the database tests

```bash
npm test
```

`supabase/tests/database.test.ts` applies every migration file to a throw-away in-process Postgres (PGlite) and checks, among other things, that a new user gets a profile, that one user cannot read or edit another's data, and that nobody can promote themselves to admin. It imitates Supabase's `auth` schema and roles, so it proves the SQL and the security rules but **not** that your hosted project has the migrations. That is what the checks in section 3 are for.
