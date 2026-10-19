import { beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({
  insert: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
}))

vi.mock('./supabaseClient', () => {
  fake.from.mockImplementation(() => ({ insert: fake.insert, select: fake.select }))
  return { supabase: { from: fake.from }, isSupabaseConfigured: true }
})

const { fetchShowupCount, recordShowup } = await import('./showupService')

beforeEach(() => {
  fake.insert.mockReset()
  fake.select.mockReset()
  fake.from.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('recordShowup', () => {
  it('inserts one row into showups with the gym, rounded distance and accuracy', async () => {
    fake.insert.mockResolvedValue({ error: null })

    const result = await recordShowup({ gymId: 'gym-1', distanceMetres: 23.6, accuracyMetres: 8.2 })

    expect(result).toEqual({ status: 'recorded' })
    expect(fake.from).toHaveBeenCalledWith('showups')
    expect(fake.insert).toHaveBeenCalledTimes(1)
    expect(fake.insert).toHaveBeenCalledWith({ gym_id: 'gym-1', distance_meters: 24, location_accuracy_meters: 8 })
  })

  it('never sends a user id, a timestamp or a verification method (the server sets those)', async () => {
    fake.insert.mockResolvedValue({ error: null })
    await recordShowup({ gymId: 'gym-1', distanceMetres: 10, accuracyMetres: 5 })
    expect(Object.keys(fake.insert.mock.calls[0][0] as object).sort()).toEqual([
      'distance_meters',
      'gym_id',
      'location_accuracy_meters',
    ])
  })

  it('never sends a negative number', async () => {
    fake.insert.mockResolvedValue({ error: null })
    await recordShowup({ gymId: 'gym-1', distanceMetres: -3, accuracyMetres: -1 })
    expect(fake.insert).toHaveBeenCalledWith({ gym_id: 'gym-1', distance_meters: 0, location_accuracy_meters: 0 })
  })

  it('reports an error, and does not claim success, when the database refuses', async () => {
    fake.insert.mockResolvedValue({ error: { code: '42501', message: 'new row violates row-level security policy' } })
    expect((await recordShowup({ gymId: 'gym-1', distanceMetres: 10, accuracyMetres: 5 })).status).toBe('error')
  })

  it('reports a network problem clearly', async () => {
    fake.insert.mockResolvedValue({ error: { message: 'TypeError: Failed to fetch' } })
    expect(await recordShowup({ gymId: 'gym-1', distanceMetres: 10, accuracyMetres: 5 })).toEqual({
      status: 'error',
      message: "We couldn't reach the server. Check your connection and try again.",
    })
  })

  it('catches a thrown error', async () => {
    fake.insert.mockRejectedValue(new TypeError('Failed to fetch'))
    expect((await recordShowup({ gymId: 'gym-1', distanceMetres: 10, accuracyMetres: 5 })).status).toBe('error')
  })
})

describe('fetchShowupCount', () => {
  it('asks the database for a count only, and returns it', async () => {
    fake.select.mockResolvedValue({ count: 7, error: null })

    expect(await fetchShowupCount()).toEqual({ status: 'ok', count: 7 })
    expect(fake.from).toHaveBeenCalledWith('showups')
    expect(fake.select).toHaveBeenCalledWith('id', { count: 'exact', head: true })
  })

  it('returns 0 when there are no Showups', async () => {
    fake.select.mockResolvedValue({ count: 0, error: null })
    expect(await fetchShowupCount()).toEqual({ status: 'ok', count: 0 })
  })

  it('treats a missing count as 0', async () => {
    fake.select.mockResolvedValue({ count: null, error: null })
    expect(await fetchShowupCount()).toEqual({ status: 'ok', count: 0 })
  })

  it('reports an error instead of showing a wrong count', async () => {
    fake.select.mockResolvedValue({ count: null, error: { message: 'permission denied for table showups' } })
    expect((await fetchShowupCount()).status).toBe('error')
  })
})
