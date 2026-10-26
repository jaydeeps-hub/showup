import { beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('./supabaseClient', () => ({ supabase: { rpc: fake.rpc }, isSupabaseConfigured: true }))

const { cancelShowup, checkShowup, errorCode, getShowupState, parseCheckResult, parseSession, parseShowupState, parseStartResult, startShowup } =
  await import('./showupSessionService')

/** The exact JSON shape the database's showup_session_json produces. */
const sessionJson = {
  session_id: 'abc',
  status: 'running',
  started_at: '2026-10-26T12:00:00+00:00',
  server_now: '2026-10-26T12:00:05+00:00',
  elapsed_seconds: 5,
  duration_seconds: 900,
  interval_seconds: 300,
  max_missed_checks: 0,
  checkpoints: [
    { at_seconds: 300, needs_location: true, done: false },
    { at_seconds: 600, needs_location: true, done: false },
    { at_seconds: 900, needs_location: true, done: false },
  ],
  location_checks_done: 1,
  location_checks_total: 4,
}

beforeEach(() => {
  fake.rpc.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('parseSession', () => {
  it('reads a complete session', () => {
    const parsed = parseSession(sessionJson)
    expect(parsed?.session_id).toBe('abc')
    expect(parsed?.status).toBe('running')
    expect(parsed?.checkpoints).toHaveLength(3)
    expect(parsed?.location_checks_total).toBe(4)
  })

  it.each([
    ['not an object', 'text'],
    ['null', null],
    ['an unknown status', { ...sessionJson, status: 'paused' }],
    ['a missing id', { ...sessionJson, session_id: undefined }],
    ['an unreadable start time', { ...sessionJson, started_at: 'soon' }],
    ['an unreadable server time', { ...sessionJson, server_now: 12 }],
    ['a negative duration', { ...sessionJson, duration_seconds: -1 }],
    ['missing checkpoints', { ...sessionJson, checkpoints: undefined }],
    ['a broken checkpoint', { ...sessionJson, checkpoints: [{ at_seconds: 'x', needs_location: true, done: false }] }],
  ])('rejects %s', (_label, raw) => {
    expect(parseSession(raw)).toBeNull()
  })

  it('accepts every status the database can send', () => {
    for (const status of ['running', 'completed', 'left_early', 'missed_checks', 'expired', 'cancelled']) {
      expect(parseSession({ ...sessionJson, status })?.status).toBe(status)
    }
  })
})

describe('parseShowupState', () => {
  it('reads a state with no session', () => {
    expect(parseShowupState({ today: '2026-10-26', showed_up_today: false, session: null })).toEqual({
      today: '2026-10-26',
      showed_up_today: false,
      session: null,
    })
  })

  it('reads a state with a running session', () => {
    expect(parseShowupState({ today: '2026-10-26', showed_up_today: false, session: sessionJson })?.session?.session_id).toBe('abc')
  })

  it('rejects a state whose session is broken, rather than pretending there is none', () => {
    expect(parseShowupState({ today: '2026-10-26', showed_up_today: false, session: { nope: true } })).toBeNull()
  })

  it('rejects a missing flag', () => {
    expect(parseShowupState({ today: '2026-10-26', session: null })).toBeNull()
  })
})

describe('parseStartResult', () => {
  it('reads already_done with no session', () => {
    expect(parseStartResult({ already_done: true, session: null })).toEqual({ already_done: true, session: null })
  })

  it('reads a started session', () => {
    expect(parseStartResult({ already_done: false, session: sessionJson })?.session?.status).toBe('running')
  })

  it('rejects a missing flag', () => {
    expect(parseStartResult({ session: sessionJson })).toBeNull()
  })
})

describe('parseCheckResult', () => {
  it('reads a running answer with its optional fields', () => {
    const parsed = parseCheckResult({ result: 'running', check_passed: true, next_check_in_seconds: 295, session: sessionJson })
    expect(parsed?.result).toBe('running')
    expect(parsed?.check_passed).toBe(true)
    expect(parsed?.next_check_in_seconds).toBe(295)
    expect(parsed?.recorded).toBeUndefined()
  })

  it('reads a completed answer with recorded', () => {
    expect(parseCheckResult({ result: 'completed', recorded: true, session: { ...sessionJson, status: 'completed' } })?.recorded).toBe(true)
  })

  it.each(['running', 'not_due', 'poor_accuracy', 'completed', 'left_early', 'missed_checks', 'expired', 'cancelled'])(
    'accepts the result "%s"',
    (result) => {
      expect(parseCheckResult({ result, session: sessionJson })?.result).toBe(result)
    },
  )

  it('rejects an unknown result or a missing session', () => {
    expect(parseCheckResult({ result: 'maybe', session: sessionJson })).toBeNull()
    expect(parseCheckResult({ result: 'running' })).toBeNull()
  })
})

describe('errorCode', () => {
  it.each([
    ['too_far', 'too_far'],
    ['poor_accuracy: the location signal is too weak', 'poor_accuracy'],
    ['gym_not_found: that is not your active gym', 'gym_not_found'],
    ['invalid_position: latitude and longitude are required', 'invalid_position'],
    ['Failed to fetch', 'network'],
    ['', 'unexpected'],
    ['123 weird', 'unexpected'],
  ])('turns "%s" into "%s"', (message, code) => {
    expect(errorCode({ message })).toBe(code)
  })
})

describe('the four calls', () => {
  it('start_showup sends the gym and a whole-number accuracy, and never a user id', async () => {
    fake.rpc.mockResolvedValue({ data: { already_done: false, session: sessionJson }, error: null })
    const result = await startShowup('gym-1', { lat: 12.97, lng: 77.59, accuracy: 8.6 })
    expect(fake.rpc).toHaveBeenCalledWith('start_showup', { p_gym: 'gym-1', p_lat: 12.97, p_lng: 77.59, p_accuracy: 9 })
    expect(result.ok).toBe(true)
  })

  it('check_showup sends the position when there is one', async () => {
    fake.rpc.mockResolvedValue({ data: { result: 'running', session: sessionJson }, error: null })
    await checkShowup('abc', { lat: 1, lng: 2, accuracy: 5 })
    expect(fake.rpc).toHaveBeenCalledWith('check_showup', { p_session: 'abc', p_lat: 1, p_lng: 2, p_accuracy: 5 })
  })

  it('check_showup sends only the session when there is no position', async () => {
    fake.rpc.mockResolvedValue({ data: { result: 'running', session: sessionJson }, error: null })
    await checkShowup('abc', null)
    expect(fake.rpc).toHaveBeenCalledWith('check_showup', { p_session: 'abc' })
  })

  it('never sends a negative accuracy', async () => {
    fake.rpc.mockResolvedValue({ data: { already_done: false, session: sessionJson }, error: null })
    await startShowup('gym-1', { lat: 1, lng: 2, accuracy: -3 })
    expect(fake.rpc.mock.calls[0][1]).toMatchObject({ p_accuracy: 0 })
  })

  it('cancel_showup returns the boolean', async () => {
    fake.rpc.mockResolvedValue({ data: true, error: null })
    expect(await cancelShowup('abc')).toEqual({ ok: true, value: true })
    fake.rpc.mockResolvedValue({ data: false, error: null })
    expect(await cancelShowup('abc')).toEqual({ ok: true, value: false })
  })

  it('cancel_showup rejects anything that is not a boolean', async () => {
    fake.rpc.mockResolvedValue({ data: 'yes', error: null })
    expect(await cancelShowup('abc')).toEqual({ ok: false, error: 'unexpected' })
  })

  it('get_showup_state calls with no arguments', async () => {
    fake.rpc.mockResolvedValue({ data: { today: '2026-10-26', showed_up_today: false, session: null }, error: null })
    await getShowupState()
    expect(fake.rpc).toHaveBeenCalledWith('get_showup_state', undefined)
  })

  it('turns a database error into its code', async () => {
    fake.rpc.mockResolvedValue({ data: null, error: { message: 'too_far' } })
    expect(await startShowup('gym-1', { lat: 1, lng: 2, accuracy: 5 })).toEqual({ ok: false, error: 'too_far' })
  })

  it('turns a poor_accuracy error with a explanation into the code poor_accuracy', async () => {
    fake.rpc.mockResolvedValue({ data: null, error: { message: 'poor_accuracy: the location signal is too weak' } })
    expect(await startShowup('gym-1', { lat: 1, lng: 2, accuracy: 500 })).toEqual({ ok: false, error: 'poor_accuracy' })
  })

  it('turns a thrown network failure into "network" instead of throwing', async () => {
    fake.rpc.mockRejectedValue(new Error('Failed to fetch'))
    expect(await getShowupState()).toEqual({ ok: false, error: 'network' })
  })

  it('refuses an answer of an unexpected shape', async () => {
    fake.rpc.mockResolvedValue({ data: { surprise: true }, error: null })
    expect(await getShowupState()).toEqual({ ok: false, error: 'unexpected' })
  })
})
