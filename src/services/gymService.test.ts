import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A fake of the Supabase query builder. Each call to from('gyms') starts a fresh chain and the
 * chain's final step returns the next queued response, so a test can script the exact sequence
 * of database answers, and then check exactly what was sent.
 */
const fake = vi.hoisted(() => ({
  responses: [] as Array<{ data: unknown; error: unknown }>,
  calls: [] as Array<{ table: string; steps: Array<[string, unknown[]]> }>,
}))

vi.mock('./supabaseClient', () => {
  function chain(table: string) {
    const record = { table, steps: [] as Array<[string, unknown[]]> }
    fake.calls.push(record)
    const handler: ProxyHandler<object> = {
      get(_target, prop: string) {
        if (prop === 'then') {
          // Awaiting the chain resolves with the next scripted response.
          const next = fake.responses.shift() ?? { data: null, error: null }
          return (resolve: (value: unknown) => void) => resolve(next)
        }
        return (...args: unknown[]) => {
          record.steps.push([prop, args])
          return proxy
        }
      },
    }
    const proxy: object = new Proxy({}, handler)
    return proxy
  }
  return { supabase: { from: (table: string) => chain(table) }, isSupabaseConfigured: true }
})

const { fetchActiveGym, saveActiveGym } = await import('./gymService')

const row = {
  id: 'gym-1',
  user_id: 'user-1',
  name: 'Iron Gym',
  google_place_id: 'place-1',
  address: '1 Main Road',
  latitude: 12.97,
  longitude: 77.59,
  created_at: '2026-10-19T10:00:00Z',
}
const place = { googlePlaceId: 'place-1', name: 'Iron Gym', formattedAddress: '1 Main Road', latitude: 12.97, longitude: 77.59 }

const stepNames = (index: number) => fake.calls[index].steps.map(([name]) => name)
const stepArgs = (index: number, name: string) => fake.calls[index].steps.find(([step]) => step === name)?.[1]

beforeEach(() => {
  fake.responses.length = 0
  fake.calls.length = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('fetchActiveGym', () => {
  it('returns the active gym in the app\'s shape', async () => {
    fake.responses.push({ data: row, error: null })
    expect(await fetchActiveGym()).toEqual({
      status: 'ok',
      gym: {
        id: 'gym-1',
        userId: 'user-1',
        label: 'Gym 1',
        googlePlaceId: 'place-1',
        name: 'Iron Gym',
        formattedAddress: '1 Main Road',
        latitude: 12.97,
        longitude: 77.59,
        createdAt: '2026-10-19T10:00:00Z',
      },
    })
    expect(fake.calls[0].table).toBe('gyms')
    expect(stepArgs(0, 'eq')).toEqual(['is_active', true]) // only the active gym
  })

  it('returns no gym (not an error) when the user has not chosen one', async () => {
    fake.responses.push({ data: null, error: null })
    expect(await fetchActiveGym()).toEqual({ status: 'ok', gym: null })
  })

  it('treats a missing address as an empty string', async () => {
    fake.responses.push({ data: { ...row, address: null }, error: null })
    const result = await fetchActiveGym()
    expect(result.status === 'ok' && result.gym?.formattedAddress).toBe('')
  })

  it('reports an error instead of pretending there is no gym', async () => {
    fake.responses.push({ data: null, error: { message: 'permission denied for table gyms' } })
    expect((await fetchActiveGym()).status).toBe('error')
  })

  it('reports a network problem clearly', async () => {
    fake.responses.push({ data: null, error: { message: 'TypeError: Failed to fetch' } })
    expect(await fetchActiveGym()).toEqual({
      status: 'error',
      message: "We couldn't reach the server. Check your connection and try again.",
    })
  })
})

describe('saveActiveGym', () => {
  it('retires the old gym first, then inserts the new one', async () => {
    fake.responses.push({ data: [{ id: 'old-gym' }], error: null }) // deactivate
    fake.responses.push({ data: row, error: null }) // insert

    const result = await saveActiveGym(place)

    expect(result.status).toBe('ok')
    expect(stepNames(0)).toContain('update')
    expect(stepArgs(0, 'update')).toEqual([{ is_active: false }])
    expect(stepNames(1)).toContain('insert')
    expect(fake.calls).toHaveLength(2)
  })

  it('sends only the permitted columns and never a user id, so the server decides who owns it', async () => {
    fake.responses.push({ data: [], error: null })
    fake.responses.push({ data: row, error: null })

    await saveActiveGym(place)

    expect(stepArgs(1, 'insert')).toEqual([
      { name: 'Iron Gym', google_place_id: 'place-1', address: '1 Main Road', latitude: 12.97, longitude: 77.59 },
    ])
  })

  it('works for a first-time user with no previous gym', async () => {
    fake.responses.push({ data: [], error: null })
    fake.responses.push({ data: row, error: null })
    expect((await saveActiveGym(place)).status).toBe('ok')
  })

  it('puts the old gym back if saving the new one fails', async () => {
    fake.responses.push({ data: [{ id: 'old-gym' }], error: null }) // deactivate old
    fake.responses.push({ data: null, error: { message: 'insert failed' } }) // insert fails
    fake.responses.push({ data: null, error: null }) // restore old

    const result = await saveActiveGym(place)

    expect(result.status).toBe('error')
    expect(fake.calls).toHaveLength(3)
    expect(stepArgs(2, 'update')).toEqual([{ is_active: true }]) // old gym reactivated
    expect(stepArgs(2, 'in')).toEqual(['id', ['old-gym']])
  })

  it('does not insert anything if the old gym could not be retired', async () => {
    fake.responses.push({ data: null, error: { message: 'permission denied' } })

    const result = await saveActiveGym(place)

    expect(result.status).toBe('error')
    expect(fake.calls).toHaveLength(1) // no insert was attempted
  })

  it('does not try to restore when there was no previous gym', async () => {
    fake.responses.push({ data: [], error: null })
    fake.responses.push({ data: null, error: { message: 'insert failed' } })

    expect((await saveActiveGym(place)).status).toBe('error')
    expect(fake.calls).toHaveLength(2)
  })
})
