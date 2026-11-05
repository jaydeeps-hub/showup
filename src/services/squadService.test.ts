import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The six squad RPCs, with Supabase faked: what is sent, how each reply is checked against the contract
 * (docs/backend/phase12a_squad.sql), and the words for every error code. A malformed reply must be an error, never an
 * empty-looking answer.
 */

const calls = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }))
vi.mock('./supabaseClient', () => ({ supabase: { rpc: calls.rpc, from: calls.from }, isSupabaseConfigured: true }))

const service = await import('./squadService')
const {
  cancelSquadRequest,
  describeSquadError,
  getSquad,
  parseSearchResult,
  parseSquadMember,
  parseSquadRequest,
  parseSquadState,
  removeFromSquad,
  respondSquadRequest,
  searchPeople,
  sendSquadRequest,
  SQUAD_ERROR_CODES,
  SQUAD_GENERIC_ERROR,
} = service

const member = (overrides: Record<string, unknown> = {}) => ({
  username: 'rahul_k',
  first_name: 'Rahul',
  last_name: 'Kapoor',
  since: '2026-11-01T10:00:00+00:00',
  total_showups: 128,
  weeks_in_a_row: 12,
  ...overrides,
})
const request = (overrides: Record<string, unknown> = {}) => ({
  username: 'karan_m',
  first_name: 'Karan',
  last_name: 'Mehta',
  requested_at: '2026-11-05T09:00:00+00:00',
  ...overrides,
})
const squadReply = (overrides: Record<string, unknown> = {}) => ({
  squad_count: 1,
  max_size: 50,
  incoming_count: 1,
  squad: [member()],
  incoming: [request()],
  outgoing: [request({ username: 'priya_fit', first_name: 'Priya', last_name: null })],
  ...overrides,
})

beforeEach(() => {
  calls.rpc.mockReset()
  calls.from.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

// --- Parsing ------------------------------------------------------------------------------------------------------

describe('parseSquadState (get_squad)', () => {
  it('reads a good reply, turning snake_case into the app’s names', () => {
    expect(parseSquadState(squadReply())).toEqual({
      squadCount: 1,
      maxSize: 50,
      incomingCount: 1,
      squad: [{ username: 'rahul_k', firstName: 'Rahul', lastName: 'Kapoor', since: '2026-11-01T10:00:00+00:00', totalShowups: 128, weeksInARow: 12 }],
      incoming: [{ username: 'karan_m', firstName: 'Karan', lastName: 'Mehta', requestedAt: '2026-11-05T09:00:00+00:00' }],
      outgoing: [{ username: 'priya_fit', firstName: 'Priya', lastName: null, requestedAt: '2026-11-05T09:00:00+00:00' }],
    })
  })

  it('reads an empty squad: zero counts and empty lists are a real answer', () => {
    expect(parseSquadState({ squad_count: 0, max_size: 50, incoming_count: 0, squad: [], incoming: [], outgoing: [] })).toEqual({
      squadCount: 0,
      maxSize: 50,
      incomingCount: 0,
      squad: [],
      incoming: [],
      outgoing: [],
    })
  })

  it('accepts numbers sent as text, as Postgres may', () => {
    expect(parseSquadState(squadReply({ squad_count: '1', max_size: '50' }))?.maxSize).toBe(50)
  })

  it('accepts a person with no names (both null) and a member with no "since"', () => {
    const state = parseSquadState(squadReply({ squad: [member({ first_name: null, last_name: null, since: null })] }))
    expect(state?.squad[0]).toMatchObject({ firstName: null, lastName: null, since: null })
  })

  it.each([
    ['not an object', 'nope'],
    ['null', null],
    ['an array', []],
    ['squad_count missing', squadReply({ squad_count: undefined })],
    ['max_size missing', squadReply({ max_size: undefined })],
    ['incoming_count missing', squadReply({ incoming_count: undefined })],
    ['squad missing', squadReply({ squad: undefined })],
    ['incoming missing', squadReply({ incoming: undefined })],
    ['outgoing missing', squadReply({ outgoing: undefined })],
    ['a negative count', squadReply({ squad_count: -1 })],
    ['a fractional count', squadReply({ max_size: 2.5 })],
    ['a count as words', squadReply({ incoming_count: 'one' })],
    ['squad not a list', squadReply({ squad: {} })],
    ['incoming not a list', squadReply({ incoming: 'karan_m' })],
  ])('is null (an error, not an empty squad) when %s', (_case, raw) => {
    expect(parseSquadState(raw)).toBeNull()
  })

  it('is null when ONE item in a list is bad: never a silently shorter list', () => {
    expect(parseSquadState(squadReply({ squad: [member(), member({ total_showups: 'lots' })] }))).toBeNull()
    expect(parseSquadState(squadReply({ incoming: [request(), { username: 'x' }] }))).toBeNull()
  })
})

describe('parseSquadMember', () => {
  it.each([
    ['no username', member({ username: undefined })],
    ['an empty username', member({ username: '' })],
    ['a username that is not text', member({ username: 42 })],
    ['a first name that is not text', member({ first_name: 5 })],
    ['a last name that is an object', member({ last_name: {} })],
    ['no total_showups', member({ total_showups: undefined })],
    ['negative showups', member({ total_showups: -3 })],
    ['weeks as text that is not a number', member({ weeks_in_a_row: 'many' })],
    ['since that is a number', member({ since: 123 })],
  ])('is null for %s', (_case, raw) => {
    expect(parseSquadMember(raw)).toBeNull()
  })

  it('treats a left-out name as none', () => {
    const { first_name: _f, last_name: _l, ...noNames } = member()
    expect(parseSquadMember(noNames)).toMatchObject({ firstName: null, lastName: null })
  })
})

describe('parseSquadRequest', () => {
  it.each([
    ['no requested_at', request({ requested_at: undefined })],
    ['an empty requested_at', request({ requested_at: '' })],
    ['requested_at as a number', request({ requested_at: 1730800000 })],
    ['no username', request({ username: null })],
  ])('is null for %s', (_case, raw) => {
    expect(parseSquadRequest(raw)).toBeNull()
  })
})

describe('parseSearchResult', () => {
  it.each([['none'], ['requested'], ['incoming'], ['squad']])('reads the relation %s', (relation) => {
    expect(parseSearchResult({ username: 'a', first_name: null, last_name: null, relation })?.relation).toBe(relation)
  })

  it('refuses a relation it does not know, rather than guessing', () => {
    expect(parseSearchResult({ username: 'a', first_name: null, last_name: null, relation: 'blocked' })).toBeNull()
    expect(parseSearchResult({ username: 'a', first_name: null, last_name: null })).toBeNull()
  })

  it('never carries stats for a stranger, even if the reply had some', () => {
    const result = parseSearchResult({ username: 'a', first_name: 'A', last_name: null, relation: 'none', total_showups: 5 })
    expect(result).toEqual({ username: 'a', firstName: 'A', lastName: null, relation: 'none' })
  })
})

// --- Error texts --------------------------------------------------------------------------------------------------

describe('describeSquadError: the words for every error code', () => {
  it.each([
    ['user_not_found', "We couldn't find that person."],
    ['cannot_add_self', "That's you!"],
    ['already_requested', 'Request already sent.'],
    ['already_in_squad', 'Already in your squad.'],
    ['request_cooldown: 5 day(s) left', 'You can ask again in 5 day(s).'],
    ['request_cooldown: 1 day(s) left', 'You can ask again in 1 day(s).'],
    ['their_squad_full', 'Their squad is full.'],
    ['too_many_requests', 'You have too many requests waiting. Cancel some first.'],
    ['no_request', 'That request is no longer there.'],
    ['username_required: set a username first', 'Set a username on Profile first.'],
  ])('%j says %j', (message, text) => {
    expect(describeSquadError({ message }).message).toBe(text)
  })

  it('"Your squad is full (max N)." with the limit the caller knows', () => {
    expect(describeSquadError({ message: 'squad_full' }, 50).message).toBe('Your squad is full (max 50).')
    expect(describeSquadError({ message: 'squad_full' }, 12).message).toBe('Your squad is full (max 12).')
  })

  it('leaves the number out, rather than inventing one, when the limit is not known', () => {
    expect(describeSquadError({ message: 'squad_full' }).message).toBe('Your squad is full.')
    expect(describeSquadError({ message: 'squad_full' }, 0).message).toBe('Your squad is full.')
  })

  it('a cooldown with no number still says something true', () => {
    expect(describeSquadError({ message: 'request_cooldown' }).message).toBe('You can ask again later.')
  })

  it.each([
    ['not_signed_in'],
    ['invalid_answer'],
    ['Failed to fetch'],
    ['network error'],
    ['something_brand_new'],
    [''],
  ])('%j falls back to "Something went wrong. Try again."', (message) => {
    expect(describeSquadError({ message }).message).toBe(SQUAD_GENERIC_ERROR)
    expect(SQUAD_GENERIC_ERROR).toBe('Something went wrong. Try again.')
  })

  it('an error with no message at all is the generic text', () => {
    expect(describeSquadError({}).message).toBe(SQUAD_GENERIC_ERROR)
  })

  it('keeps the code for every real code, and none for other text', () => {
    for (const code of SQUAD_ERROR_CODES) expect(describeSquadError({ message: code }).code).toBe(code)
    expect(describeSquadError({ message: 'request_cooldown: 2 day(s) left' }).code).toBe('request_cooldown')
    expect(describeSquadError({ message: 'network error' }).code).toBeNull()
    expect(describeSquadError({ message: 'Failed to fetch' }).code).toBeNull()
  })

  it('reads the code only at the start of the message', () => {
    expect(describeSquadError({ message: 'oops: squad_full happened' })).toEqual({ message: SQUAD_GENERIC_ERROR, code: null })
    // A code that does not start the message is not the database's code (the database always puts it first).
    expect(describeSquadError({ message: '  squad_full' })).toEqual({ message: SQUAD_GENERIC_ERROR, code: null })
    expect(describeSquadError({ message: '(no_request)' })).toEqual({ message: SQUAD_GENERIC_ERROR, code: null })
  })
})

// --- The calls ----------------------------------------------------------------------------------------------------

describe('searchPeople', () => {
  it('calls search_people with the query and reads the results', async () => {
    calls.rpc.mockResolvedValue({ data: { query: 'rah', results: [{ username: 'rahul_k', first_name: 'Rahul', last_name: 'Kapoor', relation: 'squad' }] }, error: null })
    expect(await searchPeople('rah')).toEqual({
      status: 'ok',
      query: 'rah',
      results: [{ username: 'rahul_k', firstName: 'Rahul', lastName: 'Kapoor', relation: 'squad' }],
    })
    expect(calls.rpc).toHaveBeenCalledWith('search_people', { p_query: 'rah' })
  })

  it('an empty result list is a real answer', async () => {
    calls.rpc.mockResolvedValue({ data: { query: 'zzz', results: [] }, error: null })
    expect(await searchPeople('zzz')).toEqual({ status: 'ok', query: 'zzz', results: [] })
  })

  it('a malformed reply is an error, not "nobody found"', async () => {
    for (const data of [null, { query: 'a' }, { results: [] }, { query: 'a', results: [{ username: 'x' }] }, { query: 1, results: [] }]) {
      calls.rpc.mockResolvedValue({ data, error: null })
      expect(await searchPeople('a')).toEqual({ status: 'error', message: SQUAD_GENERIC_ERROR, code: null })
    }
  })

  it('a database error and a network failure are errors', async () => {
    calls.rpc.mockResolvedValue({ data: null, error: { message: 'not_signed_in' } })
    expect(await searchPeople('a')).toEqual({ status: 'error', message: SQUAD_GENERIC_ERROR, code: 'not_signed_in' })
    calls.rpc.mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await searchPeople('a')).toEqual({ status: 'error', message: SQUAD_GENERIC_ERROR, code: null })
  })
})

describe('sendSquadRequest', () => {
  it.each([['requested'], ['squad']] as const)('reads "%s"', async (status) => {
    calls.rpc.mockResolvedValue({ data: { status }, error: null })
    expect(await sendSquadRequest('rahul_k')).toEqual({ status })
    expect(calls.rpc).toHaveBeenCalledWith('send_squad_request', { p_username: 'rahul_k' })
  })

  it('maps an error, with the limit for squad_full', async () => {
    calls.rpc.mockResolvedValue({ data: null, error: { message: 'squad_full' } })
    expect(await sendSquadRequest('rahul_k', 50)).toEqual({ status: 'error', message: 'Your squad is full (max 50).', code: 'squad_full' })
  })

  it('a reply with an unknown status is an error', async () => {
    for (const data of [null, {}, { status: 'pending' }, 'requested']) {
      calls.rpc.mockResolvedValue({ data, error: null })
      expect((await sendSquadRequest('a')).status).toBe('error')
    }
  })

  it('a network failure is an error', async () => {
    calls.rpc.mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await sendSquadRequest('a')).toEqual({ status: 'error', message: SQUAD_GENERIC_ERROR, code: null })
  })
})

describe('respondSquadRequest', () => {
  it('sends the answer and reads "squad" or "declined"', async () => {
    calls.rpc.mockResolvedValue({ data: { status: 'squad' }, error: null })
    expect(await respondSquadRequest('karan_m', true)).toEqual({ status: 'squad' })
    expect(calls.rpc).toHaveBeenCalledWith('respond_squad_request', { p_username: 'karan_m', p_accept: true })
    calls.rpc.mockResolvedValue({ data: { status: 'declined' }, error: null })
    expect(await respondSquadRequest('karan_m', false)).toEqual({ status: 'declined' })
    expect(calls.rpc).toHaveBeenLastCalledWith('respond_squad_request', { p_username: 'karan_m', p_accept: false })
  })

  it('maps no_request and their_squad_full', async () => {
    calls.rpc.mockResolvedValue({ data: null, error: { message: 'no_request' } })
    expect(await respondSquadRequest('x', true)).toMatchObject({ message: 'That request is no longer there.' })
    calls.rpc.mockResolvedValue({ data: null, error: { message: 'their_squad_full' } })
    expect(await respondSquadRequest('x', true)).toMatchObject({ message: 'Their squad is full.' })
  })

  it('a reply with the wrong status is an error ("requested" is not an answer)', async () => {
    calls.rpc.mockResolvedValue({ data: { status: 'requested' }, error: null })
    expect((await respondSquadRequest('x', true)).status).toBe('error')
  })
})

describe('cancelSquadRequest and removeFromSquad', () => {
  it.each([
    ['cancelSquadRequest', 'cancel_squad_request'],
    ['removeFromSquad', 'remove_from_squad'],
  ] as const)('%s calls %s and reads true or false', async (fn, rpcName) => {
    const call = fn === 'cancelSquadRequest' ? cancelSquadRequest : removeFromSquad
    calls.rpc.mockResolvedValue({ data: true, error: null })
    expect(await call('rahul_k')).toEqual({ status: 'ok', done: true })
    expect(calls.rpc).toHaveBeenCalledWith(rpcName, { p_username: 'rahul_k' })
    calls.rpc.mockResolvedValue({ data: false, error: null })
    expect(await call('rahul_k')).toEqual({ status: 'ok', done: false })
  })

  it.each([['cancelSquadRequest'], ['removeFromSquad']] as const)('%s: anything but true or false is an error', async (fn) => {
    const call = fn === 'cancelSquadRequest' ? cancelSquadRequest : removeFromSquad
    for (const data of [null, 'true', 1, {}, []]) {
      calls.rpc.mockResolvedValue({ data, error: null })
      expect((await call('a')).status).toBe('error')
    }
  })
})

describe('getSquad', () => {
  it('calls get_squad with nothing and reads the state', async () => {
    calls.rpc.mockResolvedValue({ data: squadReply(), error: null })
    const result = await getSquad()
    expect(calls.rpc).toHaveBeenCalledWith('get_squad')
    expect(result.status === 'ok' && result.squad.incomingCount).toBe(1)
  })

  it('a malformed reply is an error, never an empty squad', async () => {
    calls.rpc.mockResolvedValue({ data: { squad_count: 0 }, error: null })
    expect(await getSquad()).toEqual({ status: 'error', message: SQUAD_GENERIC_ERROR, code: null })
  })

  it('a database error and a network failure are errors', async () => {
    calls.rpc.mockResolvedValue({ data: null, error: { message: 'not_signed_in' } })
    expect((await getSquad()).status).toBe('error')
    calls.rpc.mockRejectedValue(new TypeError('Failed to fetch'))
    expect((await getSquad()).status).toBe('error')
  })
})

describe('the app never reads the table directly', () => {
  it('no call touches squad_links (the functions do all the reading and writing)', async () => {
    calls.rpc.mockResolvedValue({ data: squadReply(), error: null })
    await getSquad()
    await searchPeople('ab')
    expect(calls.from).not.toHaveBeenCalled()
  })
})
