import { beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({
  rpc: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
}))

vi.mock('./supabaseClient', () => {
  fake.from.mockImplementation(() => ({ select: fake.select }))
  return { supabase: { from: fake.from, rpc: fake.rpc }, isSupabaseConfigured: true }
})

const { fetchShowupCount, recordShowup } = await import('./showupService')

const position = { gymId: 'gym-1', latitude: 12.9716, longitude: 77.5946, accuracyMetres: 8.2 }

beforeEach(() => {
  fake.rpc.mockReset()
  fake.select.mockReset()
  fake.from.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('recordShowup (calls the record_showup database function)', () => {
  it('sends the gym and the raw position, with accuracy rounded, and never inserts into showups itself', async () => {
    fake.rpc.mockResolvedValue({ data: true, error: null })

    await recordShowup(position)

    expect(fake.rpc).toHaveBeenCalledTimes(1)
    expect(fake.rpc).toHaveBeenCalledWith('record_showup', {
      p_gym: 'gym-1',
      p_lat: 12.9716,
      p_lng: 77.5946,
      p_accuracy: 8,
    })
    expect(fake.from).not.toHaveBeenCalled() // no direct insert any more
  })

  it('never sends a distance, a user id or a time (the database measures and sets those)', async () => {
    fake.rpc.mockResolvedValue({ data: true, error: null })
    await recordShowup(position)
    expect(Object.keys(fake.rpc.mock.calls[0][1] as object).sort()).toEqual(['p_accuracy', 'p_gym', 'p_lat', 'p_lng'])
  })

  it('never sends a negative accuracy', async () => {
    fake.rpc.mockResolvedValue({ data: true, error: null })
    await recordShowup({ ...position, accuracyMetres: -4 })
    expect(fake.rpc.mock.calls[0][1]).toMatchObject({ p_accuracy: 0 })
  })

  it('true means a new Showup was recorded', async () => {
    fake.rpc.mockResolvedValue({ data: true, error: null })
    expect(await recordShowup(position)).toEqual({ status: 'recorded' })
  })

  it('false means today was already counted, which is not an error', async () => {
    fake.rpc.mockResolvedValue({ data: false, error: null })
    expect(await recordShowup(position)).toEqual({ status: 'already-recorded' })
  })

  it("an exception containing 'too_far' means the database found the user too far away", async () => {
    fake.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'too_far' } })
    expect(await recordShowup(position)).toEqual({ status: 'too-far' })
  })

  it('other database errors are reported as errors, not as too far or already recorded', async () => {
    for (const message of ['gym_not_found: that is not your active gym', 'invalid_position: latitude and longitude are required', 'not_signed_in']) {
      fake.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message } })
      expect((await recordShowup(position)).status).toBe('error')
    }
  })

  it('reports a network problem clearly', async () => {
    fake.rpc.mockResolvedValue({ data: null, error: { message: 'TypeError: Failed to fetch' } })
    expect(await recordShowup(position)).toEqual({
      status: 'error',
      message: "We couldn't reach the server. Check your connection and try again.",
    })
  })

  it('catches a thrown error', async () => {
    fake.rpc.mockRejectedValue(new TypeError('Failed to fetch'))
    expect((await recordShowup(position)).status).toBe('error')
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
