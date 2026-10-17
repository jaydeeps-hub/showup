import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

/**
 * Database tests: the REAL migration files are applied to an in-process Postgres (PGlite)
 * that imitates the parts of Supabase the migrations rely on (the auth schema, auth.uid(),
 * and the anon / authenticated / service_role roles). No network or Supabase project needed.
 *
 * What this proves: the SQL is valid and the privilege + row-level-security rules behave as
 * intended. What it does NOT prove: that your hosted project has had the migrations applied
 * (see docs/SETUP_SUPABASE.md for the checks to run there).
 */

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations/', import.meta.url))
const migrationFiles = readdirSync(MIGRATIONS_DIR)
  .filter((file) => file.endsWith('.sql'))
  .sort()

/** A minimal imitation of Supabase's auth schema and roles. */
const SUPABASE_STAND_IN = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create role supabase_auth_admin nologin;

  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );

  -- Same logic as Supabase's real auth.uid(): read the signed-in user's ID from the request claims.
  create function auth.uid() returns uuid language sql stable as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    )::uuid
  $$;

  grant usage on schema auth to anon, authenticated, service_role, supabase_auth_admin;
  grant usage on schema public to anon, authenticated, service_role, supabase_auth_admin;
  grant all on table auth.users to supabase_auth_admin;

  -- Supabase gives its API roles full rights on every new table in public by default.
  -- The security migration must take those away, so the stand-in reproduces them.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
`

async function applyMigration(db: PGlite, file: string) {
  await db.exec(readFileSync(MIGRATIONS_DIR + file, 'utf8'))
}

/**
 * Building the database (loading Postgres and running every migration) is the slow part, so it
 * is done once per test file. Each test then gets a fast, isolated copy via a snapshot.
 */
let template: PGlite | null = null
let templateDump: File | Blob | null = null

async function createDatabase(): Promise<PGlite> {
  if (!template) {
    template = new PGlite()
    await template.exec(SUPABASE_STAND_IN)
    for (const file of migrationFiles) await applyMigration(template, file)
    templateDump = await template.dumpDataDir('none')
  }
  return new PGlite({ loadDataDir: templateDump! })
}

/** Registers a user the way Supabase Auth does: GoTrue inserts into auth.users as supabase_auth_admin. */
async function registerAuthUser(db: PGlite, metadata: Record<string, unknown> = {}): Promise<string> {
  await db.exec('set role supabase_auth_admin')
  try {
    const { rows } = await db.query<{ id: string }>(
      'insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id',
      [`user-${Math.random().toString(36).slice(2)}@example.com`, JSON.stringify(metadata)],
    )
    return rows[0].id
  } finally {
    await db.exec('reset role')
  }
}

/** Runs `action` as the browser would: role `authenticated` with this user's ID (or `anon` if null). */
async function asUser<T>(db: PGlite, userId: string | null, action: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${userId ? 'authenticated' : 'anon'}`)
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(userId ? { sub: userId } : {})])
  try {
    return await action()
  } finally {
    await db.exec('reset role')
  }
}

async function addGym(db: PGlite, userId: string, overrides: Record<string, unknown> = {}): Promise<string> {
  const gym = { name: 'Iron Gym', google_place_id: 'place-1', address: '1 Main Road', latitude: 12.97, longitude: 77.59, ...overrides }
  return asUser(db, userId, async () => {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.gyms (name, google_place_id, address, latitude, longitude)
       values ($1, $2, $3, $4, $5) returning id`,
      [gym.name, gym.google_place_id, gym.address, gym.latitude, gym.longitude],
    )
    return rows[0].id
  })
}

async function addShowup(db: PGlite, userId: string, gymId: string, distance: number | null = 12): Promise<string> {
  return asUser(db, userId, async () => {
    const { rows } = await db.query<{ id: string }>(
      'insert into public.showups (gym_id, distance_meters, location_accuracy_meters) values ($1, $2, 8) returning id',
      [gymId, distance],
    )
    return rows[0].id
  })
}

const PERMISSION_DENIED = /permission denied/i
const RLS_VIOLATION = /row-level security/i

describe('migrations', () => {
  it('apply cleanly and create the three tables with row level security on', async () => {
    const db = await createDatabase()
    const { rows } = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class
       where relnamespace = 'public'::regnamespace and relname in ('profiles', 'gyms', 'showups') order by relname`,
    )
    expect(rows).toEqual([
      { relname: 'gyms', relrowsecurity: true },
      { relname: 'profiles', relrowsecurity: true },
      { relname: 'showups', relrowsecurity: true },
    ])
  })
})

describe('profile creation', () => {
  let db: PGlite
  beforeEach(async () => {
    db = await createDatabase()
  })
  afterEach(async () => {
    await db.close()
  })

  it('gives a new Auth user a profile with is_admin = false', async () => {
    const id = await registerAuthUser(db)
    const { rows } = await db.query('select id, is_admin, first_name, last_name from public.profiles where id = $1', [id])
    expect(rows).toEqual([{ id, is_admin: false, first_name: null, last_name: null }])
  })

  it("copies Google's first and last name", async () => {
    const id = await registerAuthUser(db, { given_name: '  Asha ', family_name: 'Rao' })
    const { rows } = await db.query('select first_name, last_name from public.profiles where id = $1', [id])
    expect(rows).toEqual([{ first_name: 'Asha', last_name: 'Rao' }])
  })

  it('ignores is_admin and role supplied in user metadata', async () => {
    const id = await registerAuthUser(db, { is_admin: true, isAdmin: 'true', role: 'admin', admin: true })
    const { rows } = await db.query('select is_admin from public.profiles where id = $1', [id])
    expect(rows).toEqual([{ is_admin: false }])
  })

  it('never blocks sign-up because of odd names (blank, very long, non-string)', async () => {
    const blank = await registerAuthUser(db, { given_name: '   ', family_name: '' })
    const long = await registerAuthUser(db, { given_name: 'x'.repeat(500), family_name: 42 })
    const { rows } = await db.query<{ id: string; first_name: string | null; last_name: string | null }>(
      'select id, first_name, last_name from public.profiles where id = any($1)',
      [[blank, long]],
    )
    const byId = Object.fromEntries(rows.map((row) => [row.id, row]))
    expect(byId[blank]).toMatchObject({ first_name: null, last_name: null })
    expect(byId[long].first_name).toHaveLength(100)
    expect(byId[long].last_name).toBe('42')
  })

  it('creates profiles for users who signed up before the migration existed', async () => {
    const oldDb = new PGlite()
    await oldDb.exec(SUPABASE_STAND_IN)
    await applyMigration(oldDb, migrationFiles[0]) // tables only, no trigger yet
    await oldDb.exec(
      `insert into auth.users (id, raw_user_meta_data) values ('11111111-1111-1111-1111-111111111111', '{"given_name":"Early"}')`,
    )
    for (const file of migrationFiles.slice(1)) await applyMigration(oldDb, file)

    const { rows } = await oldDb.query('select first_name, is_admin from public.profiles')
    expect(rows).toEqual([{ first_name: 'Early', is_admin: false }])
    await oldDb.close()
  })

  it('cannot be called directly by app users', async () => {
    const id = await registerAuthUser(db)
    await expect(asUser(db, id, () => db.query('select public.handle_new_user()'))).rejects.toThrow(PERMISSION_DENIED)
  })
})

describe('profiles: access rules', () => {
  let db: PGlite
  let alice: string
  let bob: string
  beforeEach(async () => {
    db = await createDatabase()
    alice = await registerAuthUser(db, { given_name: 'Alice' })
    bob = await registerAuthUser(db, { given_name: 'Bob' })
  })
  afterEach(async () => {
    await db.close()
  })

  it('lets a user read only their own profile', async () => {
    const rows = await asUser(db, alice, async () => (await db.query<{ id: string }>('select id from public.profiles')).rows)
    expect(rows.map((row) => row.id)).toEqual([alice])
  })

  it("cannot read another user's profile even by asking for their ID", async () => {
    const rows = await asUser(db, alice, async () => (await db.query('select * from public.profiles where id = $1', [bob])).rows)
    expect(rows).toEqual([])
  })

  it('lets a user update their own name and date of birth', async () => {
    const rows = await asUser(db, alice, async () =>
      (
        await db.query(
          `update public.profiles set first_name = 'Alicia', last_name = 'Stone', date_of_birth = '1990-05-17'
           where id = $1 returning first_name, last_name, date_of_birth::text as date_of_birth`,
          [alice],
        )
      ).rows,
    )
    expect(rows).toEqual([{ first_name: 'Alicia', last_name: 'Stone', date_of_birth: '1990-05-17' }])
  })

  it('refreshes updated_at when a profile changes', async () => {
    const before = (await db.query<{ updated_at: string }>('select updated_at from public.profiles where id = $1', [alice])).rows[0]
    await asUser(db, alice, () => db.query("update public.profiles set first_name = 'New' where id = $1", [alice]))
    const after = (await db.query<{ updated_at: string }>('select updated_at from public.profiles where id = $1', [alice])).rows[0]
    expect(new Date(after.updated_at).getTime()).toBeGreaterThan(new Date(before.updated_at).getTime())
  })

  it("cannot change another user's profile (the update matches no rows)", async () => {
    const rows = await asUser(db, alice, async () =>
      (await db.query("update public.profiles set first_name = 'Hacked' where id = $1 returning id", [bob])).rows,
    )
    expect(rows).toEqual([])
    const { rows: stored } = await db.query('select first_name from public.profiles where id = $1', [bob])
    expect(stored).toEqual([{ first_name: 'Bob' }])
  })

  it('cannot promote themselves to admin', async () => {
    await expect(
      asUser(db, alice, () => db.query('update public.profiles set is_admin = true where id = $1', [alice])),
    ).rejects.toThrow(PERMISSION_DENIED)
    const { rows } = await db.query('select is_admin from public.profiles where id = $1', [alice])
    expect(rows).toEqual([{ is_admin: false }])
  })

  it('cannot promote themselves by updating every column at once', async () => {
    await expect(
      asUser(db, alice, () => db.query("update public.profiles set first_name = 'A', is_admin = true where id = $1", [alice])),
    ).rejects.toThrow(PERMISSION_DENIED)
  })

  it('cannot change their profile id, created_at or updated_at', async () => {
    for (const assignment of [`id = '${bob}'`, `created_at = now()`, `updated_at = now()`]) {
      await expect(
        asUser(db, alice, () => db.query(`update public.profiles set ${assignment} where id = $1`, [alice])),
      ).rejects.toThrow(PERMISSION_DENIED)
    }
  })

  it('cannot insert a profile (not even an admin one) or delete one', async () => {
    await expect(
      asUser(db, alice, () =>
        db.query('insert into public.profiles (id, is_admin) values (gen_random_uuid(), true)'),
      ),
    ).rejects.toThrow(PERMISSION_DENIED)
    await expect(asUser(db, alice, () => db.query('delete from public.profiles where id = $1', [alice]))).rejects.toThrow(
      PERMISSION_DENIED,
    )
  })

  it('rejects invalid values with check constraints', async () => {
    await expect(
      asUser(db, alice, () => db.query("update public.profiles set first_name = '   ' where id = $1", [alice])),
    ).rejects.toThrow(/profiles_first_name_valid/)
    await expect(
      asUser(db, alice, () => db.query("update public.profiles set date_of_birth = '1800-01-01' where id = $1", [alice])),
    ).rejects.toThrow(/profiles_date_of_birth_valid/)
  })

  it('gives signed-out visitors no access', async () => {
    await expect(asUser(db, null, () => db.query('select * from public.profiles'))).rejects.toThrow(PERMISSION_DENIED)
    await expect(asUser(db, null, () => db.query("update public.profiles set first_name = 'x'"))).rejects.toThrow(
      PERMISSION_DENIED,
    )
  })
})

describe('gyms: access rules', () => {
  let db: PGlite
  let alice: string
  let bob: string
  beforeEach(async () => {
    db = await createDatabase()
    alice = await registerAuthUser(db)
    bob = await registerAuthUser(db)
  })
  afterEach(async () => {
    await db.close()
  })

  it('saves a gym for the signed-in user without the app sending user_id', async () => {
    const id = await addGym(db, alice)
    const { rows } = await db.query('select user_id, is_active from public.gyms where id = $1', [id])
    expect(rows).toEqual([{ user_id: alice, is_active: true }])
  })

  it('lets a user read only their own gyms', async () => {
    await addGym(db, alice, { name: 'Alice Gym' })
    await addGym(db, bob, { name: 'Bob Gym' })
    const names = await asUser(db, alice, async () => (await db.query<{ name: string }>('select name from public.gyms')).rows)
    expect(names).toEqual([{ name: 'Alice Gym' }])
  })

  it('cannot save a gym on behalf of another user', async () => {
    await expect(
      asUser(db, alice, () =>
        db.query("insert into public.gyms (user_id, name, latitude, longitude) values ($1, 'Fake', 1, 1)", [bob]),
      ),
    ).rejects.toThrow(RLS_VIOLATION)
  })

  it('rejects out-of-range coordinates and blank names', async () => {
    for (const [latitude, longitude] of [
      [91, 0],
      [-91, 0],
      [0, 181],
      [0, -181],
    ]) {
      await expect(addGym(db, alice, { latitude, longitude })).rejects.toThrow(/gyms_(latitude|longitude)_range/)
    }
    await expect(addGym(db, alice, { name: '   ' })).rejects.toThrow(/gyms_name_not_blank/)
  })

  it('accepts coordinates on the boundaries', async () => {
    await addGym(db, alice, { latitude: 90, longitude: 180 })
  })

  it('allows a gym without a Google place ID', async () => {
    const id = await addGym(db, alice, { google_place_id: null })
    expect(id).toBeTruthy()
  })

  it('allows only one active gym per user', async () => {
    await addGym(db, alice)
    await expect(addGym(db, alice, { name: 'Second' })).rejects.toThrow(/gyms_one_active_per_user_idx/)
  })

  it('lets two different users each have an active gym', async () => {
    await addGym(db, alice)
    await addGym(db, bob)
  })

  it('changes gym by deactivating the old one, keeping it as history', async () => {
    const oldGym = await addGym(db, alice, { name: 'Old Gym' })
    await asUser(db, alice, () => db.query('update public.gyms set is_active = false where id = $1', [oldGym]))
    await addGym(db, alice, { name: 'New Gym' })

    const { rows } = await db.query('select name, is_active from public.gyms where user_id = $1 order by name', [alice])
    expect(rows).toEqual([
      { name: 'New Gym', is_active: true },
      { name: 'Old Gym', is_active: false },
    ])
  })

  it('cannot edit a gym name or coordinates after saving, or reassign its owner', async () => {
    const id = await addGym(db, alice)
    for (const assignment of ["name = 'Moved'", 'latitude = 1', 'longitude = 1', `user_id = '${bob}'`, "address = 'x'"]) {
      await expect(
        asUser(db, alice, () => db.query(`update public.gyms set ${assignment} where id = $1`, [id])),
      ).rejects.toThrow(PERMISSION_DENIED)
    }
  })

  it("cannot change or delete another user's gym", async () => {
    const bobsGym = await addGym(db, bob)
    const updated = await asUser(db, alice, async () =>
      (await db.query('update public.gyms set is_active = false where id = $1 returning id', [bobsGym])).rows,
    )
    expect(updated).toEqual([])
    await expect(asUser(db, alice, () => db.query('delete from public.gyms where id = $1', [bobsGym]))).rejects.toThrow(
      PERMISSION_DENIED,
    )
  })

  it('does not let users delete their own gyms (history is kept)', async () => {
    const id = await addGym(db, alice)
    await expect(asUser(db, alice, () => db.query('delete from public.gyms where id = $1', [id]))).rejects.toThrow(
      PERMISSION_DENIED,
    )
  })

  it('gives signed-out visitors no access', async () => {
    await expect(asUser(db, null, () => db.query('select * from public.gyms'))).rejects.toThrow(PERMISSION_DENIED)
  })
})

describe('showups: access rules', () => {
  let db: PGlite
  let alice: string
  let bob: string
  let aliceGym: string
  let bobGym: string
  beforeEach(async () => {
    db = await createDatabase()
    alice = await registerAuthUser(db)
    bob = await registerAuthUser(db)
    aliceGym = await addGym(db, alice, { name: 'Alice Gym' })
    bobGym = await addGym(db, bob, { name: 'Bob Gym' })
  })
  afterEach(async () => {
    await db.close()
  })

  it('records a Showup for the signed-in user at their own active gym', async () => {
    const id = await addShowup(db, alice, aliceGym, 23)
    const { rows } = await db.query(
      'select user_id, gym_id, distance_meters, location_accuracy_meters, verification_method from public.showups where id = $1',
      [id],
    )
    expect(rows).toEqual([
      { user_id: alice, gym_id: aliceGym, distance_meters: 23, location_accuracy_meters: 8, verification_method: 'gps' },
    ])
  })

  it('stamps the time on the server', async () => {
    const id = await addShowup(db, alice, aliceGym)
    const { rows } = await db.query<{ recent: boolean }>(
      "select (occurred_at > now() - interval '1 minute') as recent from public.showups where id = $1",
      [id],
    )
    expect(rows[0].recent).toBe(true)
  })

  it("cannot record a Showup at someone else's gym", async () => {
    await expect(addShowup(db, alice, bobGym)).rejects.toThrow(RLS_VIOLATION)
  })

  it('cannot record a Showup as another user, even at a gym that user owns', async () => {
    await expect(
      asUser(db, alice, () => db.query('insert into public.showups (user_id, gym_id) values ($1, $2)', [bob, bobGym])),
    ).rejects.toThrow(RLS_VIOLATION)
  })

  it('cannot record a Showup as another user at their own gym', async () => {
    await expect(
      asUser(db, alice, () => db.query('insert into public.showups (user_id, gym_id) values ($1, $2)', [bob, aliceGym])),
    ).rejects.toThrow(RLS_VIOLATION)
  })

  it('cannot record a Showup at a gym that has been deactivated', async () => {
    await asUser(db, alice, () => db.query('update public.gyms set is_active = false where id = $1', [aliceGym]))
    await expect(addShowup(db, alice, aliceGym)).rejects.toThrow(RLS_VIOLATION)
  })

  it('cannot record a Showup at a gym that does not exist', async () => {
    await expect(addShowup(db, alice, '99999999-9999-9999-9999-999999999999')).rejects.toThrow(RLS_VIOLATION)
  })

  it('cannot backdate a Showup or choose its verification method', async () => {
    for (const column of ['occurred_at', 'created_at', 'verification_method', 'id']) {
      const value = column === 'verification_method' ? "'qr'" : column === 'id' ? 'gen_random_uuid()' : "now() - interval '2 days'"
      await expect(
        asUser(db, alice, () => db.query(`insert into public.showups (gym_id, ${column}) values ($1, ${value})`, [aliceGym])),
      ).rejects.toThrow(PERMISSION_DENIED)
    }
  })

  it('rejects negative distance or accuracy', async () => {
    await expect(addShowup(db, alice, aliceGym, -5)).rejects.toThrow(/showups_distance_meters_valid/)
    await expect(
      asUser(db, alice, () =>
        db.query('insert into public.showups (gym_id, location_accuracy_meters) values ($1, -1)', [aliceGym]),
      ),
    ).rejects.toThrow(/showups_accuracy_meters_valid/)
  })

  it('accepts a Showup with no distance or accuracy', async () => {
    await asUser(db, alice, () => db.query('insert into public.showups (gym_id) values ($1)', [aliceGym]))
  })

  it('lets a user read only their own Showups', async () => {
    await addShowup(db, alice, aliceGym)
    await addShowup(db, bob, bobGym)
    await addShowup(db, bob, bobGym)
    const aliceRows = await asUser(db, alice, async () => (await db.query('select id from public.showups')).rows)
    const bobRows = await asUser(db, bob, async () => (await db.query('select id from public.showups')).rows)
    expect(aliceRows).toHaveLength(1)
    expect(bobRows).toHaveLength(2)
  })

  it('makes Showups append-only for users: no update, no delete', async () => {
    const id = await addShowup(db, alice, aliceGym)
    await expect(
      asUser(db, alice, () => db.query('update public.showups set distance_meters = 0 where id = $1', [id])),
    ).rejects.toThrow(PERMISSION_DENIED)
    await expect(asUser(db, alice, () => db.query('delete from public.showups where id = $1', [id]))).rejects.toThrow(
      PERMISSION_DENIED,
    )
  })

  it('keeps history readable after the gym is deactivated and a new one is added', async () => {
    const id = await addShowup(db, alice, aliceGym)
    await asUser(db, alice, () => db.query('update public.gyms set is_active = false where id = $1', [aliceGym]))
    const newGym = await addGym(db, alice, { name: 'New Gym' })
    await addShowup(db, alice, newGym)

    const rows = await asUser(db, alice, async () => (await db.query('select id, gym_id from public.showups order by occurred_at')).rows)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({ id, gym_id: aliceGym })
  })

  it('refuses to delete a gym that has Showups, even for an administrator', async () => {
    await addShowup(db, alice, aliceGym)
    await expect(db.query('delete from public.gyms where id = $1', [aliceGym])).rejects.toThrow(/showups_gym_belongs_to_user/)
  })

  it('refuses a Showup whose gym belongs to a different user, even when written by an administrator', async () => {
    await expect(
      db.query('insert into public.showups (user_id, gym_id) values ($1, $2)', [alice, bobGym]),
    ).rejects.toThrow(/showups_gym_belongs_to_user/)
  })

  it('gives signed-out visitors no access', async () => {
    await expect(asUser(db, null, () => db.query('select * from public.showups'))).rejects.toThrow(PERMISSION_DENIED)
  })

  it("removes all of a user's data when their Auth user is deleted, and nobody else's", async () => {
    await addShowup(db, alice, aliceGym)
    await addShowup(db, bob, bobGym)

    await db.query('delete from auth.users where id = $1', [alice])

    const counts = await db.query<{ table_name: string; rows: number }>(
      `select 'profiles' as table_name, count(*)::int as rows from public.profiles
       union all select 'gyms', count(*)::int from public.gyms
       union all select 'showups', count(*)::int from public.showups order by 1`,
    )
    // Only Bob's profile, gym and Showup remain.
    expect(counts.rows).toEqual([
      { table_name: 'gyms', rows: 1 },
      { table_name: 'profiles', rows: 1 },
      { table_name: 'showups', rows: 1 },
    ])
  })
})

describe('place search mode (admin-only "any place")', () => {
  let db: PGlite
  let regular: string
  let admin: string
  beforeEach(async () => {
    db = await createDatabase()
    regular = await registerAuthUser(db)
    admin = await registerAuthUser(db)
    // Only the SQL Editor / service role can make an administrator.
    await db.query('update public.profiles set is_admin = true where id = $1', [admin])
  })
  afterEach(async () => {
    await db.close()
  })

  const setMode = (userId: string | null, mode: string | null) =>
    asUser(db, userId, async () => (await db.query<{ set_place_search_mode: string }>('select public.set_place_search_mode($1)', [mode])).rows[0])
  const effective = (userId: string) =>
    asUser(db, userId, async () => (await db.query<{ effective_place_search_mode: string }>('select public.effective_place_search_mode()')).rows[0].effective_place_search_mode)
  const stored = async (userId: string) =>
    (await db.query<{ place_search_mode: string }>('select place_search_mode from public.profiles where id = $1', [userId])).rows[0].place_search_mode

  it('starts every user, including a new administrator, on fitness places only', async () => {
    expect(await stored(regular)).toBe('fitness_only')
    expect(await stored(admin)).toBe('fitness_only')
    expect(await effective(regular)).toBe('fitness_only')
  })

  it('lets a user read their own mode', async () => {
    const rows = await asUser(db, regular, async () => (await db.query('select place_search_mode from public.profiles')).rows)
    expect(rows).toEqual([{ place_search_mode: 'fitness_only' }])
  })

  it('lets an administrator switch to any place and back', async () => {
    expect(await setMode(admin, 'any_place')).toEqual({ set_place_search_mode: 'any_place' })
    expect(await stored(admin)).toBe('any_place')
    expect(await effective(admin)).toBe('any_place')

    await setMode(admin, 'fitness_only')
    expect(await stored(admin)).toBe('fitness_only')
    expect(await effective(admin)).toBe('fitness_only')
  })

  it('does NOT let a regular user switch to any place', async () => {
    await expect(setMode(regular, 'any_place')).rejects.toThrow(/Only administrators can search any place/)
    expect(await stored(regular)).toBe('fitness_only')
    expect(await effective(regular)).toBe('fitness_only')
  })

  it('does not let a regular user write the column directly, by any route', async () => {
    await expect(
      asUser(db, regular, () => db.query("update public.profiles set place_search_mode = 'any_place' where id = $1", [regular])),
    ).rejects.toThrow(PERMISSION_DENIED)
    await expect(
      asUser(db, regular, () => db.query("update public.profiles set first_name = 'x', place_search_mode = 'any_place' where id = $1", [regular])),
    ).rejects.toThrow(PERMISSION_DENIED)
    expect(await stored(regular)).toBe('fitness_only')
  })

  it('does not let an administrator write the column directly either (only via the function)', async () => {
    await expect(
      asUser(db, admin, () => db.query("update public.profiles set place_search_mode = 'any_place' where id = $1", [admin])),
    ).rejects.toThrow(PERMISSION_DENIED)
  })

  it('does not let a user promote themselves in order to unlock the setting', async () => {
    await expect(
      asUser(db, regular, () => db.query('update public.profiles set is_admin = true where id = $1', [regular])),
    ).rejects.toThrow(PERMISSION_DENIED)
    await expect(setMode(regular, 'any_place')).rejects.toThrow(/Only administrators/)
  })

  it("only ever changes the caller's own profile", async () => {
    await setMode(admin, 'any_place')
    expect(await stored(regular)).toBe('fitness_only')
  })

  it('lets anyone return to the restrictive mode', async () => {
    expect(await setMode(regular, 'fitness_only')).toEqual({ set_place_search_mode: 'fitness_only' })
  })

  it('rejects unknown modes and null', async () => {
    await expect(setMode(admin, 'everything')).rejects.toThrow(/Invalid place search mode/)
    await expect(setMode(admin, null)).rejects.toThrow(/Invalid place search mode/)
    await expect(setMode(admin, '')).rejects.toThrow(/Invalid place search mode/)
  })

  it('rejects an invalid value written by an administrator in the SQL Editor (check constraint)', async () => {
    await expect(db.query("update public.profiles set place_search_mode = 'bogus' where id = $1", [admin])).rejects.toThrow(
      /profiles_place_search_mode_valid/,
    )
  })

  it('refuses signed-out visitors', async () => {
    await expect(setMode(null, 'fitness_only')).rejects.toThrow(PERMISSION_DENIED)
    await expect(asUser(db, null, () => db.query('select public.effective_place_search_mode()'))).rejects.toThrow(PERMISSION_DENIED)
  })

  it('stops honouring any place the moment admin rights are removed', async () => {
    await setMode(admin, 'any_place')
    expect(await effective(admin)).toBe('any_place')

    await db.query('update public.profiles set is_admin = false where id = $1', [admin]) // done in the SQL Editor
    expect(await stored(admin)).toBe('any_place') // the old value is still stored...
    expect(await effective(admin)).toBe('fitness_only') // ...but no longer applies
    await expect(setMode(admin, 'any_place')).rejects.toThrow(/Only administrators/)
  })

  it('treats a user with no profile row as restricted', async () => {
    const ghost = '22222222-2222-2222-2222-222222222222'
    expect(await effective(ghost)).toBeNull()
    await expect(setMode(ghost, 'any_place')).rejects.toThrow(/Only administrators/)
  })

  it("keeps a user's other profile rights working", async () => {
    await asUser(db, regular, () => db.query("update public.profiles set first_name = 'Asha' where id = $1", [regular]))
    expect((await db.query('select first_name from public.profiles where id = $1', [regular])).rows).toEqual([{ first_name: 'Asha' }])
  })

  it('cannot be called through the function by someone who is not signed in as that user', async () => {
    // auth.uid() comes from the verified sign-in token, never from an argument the caller controls.
    await expect(asUser(db, regular, () => db.query("select public.set_place_search_mode('any_place')"))).rejects.toThrow(/Only administrators/)
  })
})
