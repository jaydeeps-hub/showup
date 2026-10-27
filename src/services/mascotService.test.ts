import { beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('./supabaseClient', () => ({ supabase: { rpc: fake.rpc }, isSupabaseConfigured: true }))

const { fetchMascotContent, parseMascotContent } = await import('./mascotService')

/** The exact JSON shape get_mascot_content returns. */
const json = {
  version: 1761600000000,
  images: {
    smile: { kind: 'expression', url: 'https://x.supabase.co/storage/v1/object/public/app-assets/smile.png', alt: 'Smiling', width: 180, height: 250, v: 1761500000000 },
    avatar: { kind: 'avatar', url: 'https://x.supabase.co/storage/v1/object/public/app-assets/avatar.png', alt: null, width: 160, height: 160, v: 1761500000001 },
  },
  messages: [
    { id: 1, key: 'checking', locale: 'en', priority: 10, expression: 'focus', message: 'Hang on, confirming where you are.' },
    { id: 2, key: 'in_progress', locale: 'en', priority: 150, expression: 'smile', message: 'Show up today and you’re at {next} of {goal}.' },
  ],
}

beforeEach(() => {
  fake.rpc.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('parseMascotContent', () => {
  it('reads a complete answer', () => {
    const parsed = parseMascotContent(json)
    expect(parsed?.version).toBe(1761600000000)
    expect(Object.keys(parsed?.images ?? {})).toEqual(['smile', 'avatar'])
    expect(parsed?.messages).toHaveLength(2)
    expect(parsed?.images.smile).toMatchObject({ width: 180, height: 250, v: 1761500000000, alt: 'Smiling' })
  })

  it('reads an answer with no pictures yet (every address still empty)', () => {
    const parsed = parseMascotContent({ ...json, images: {} })
    expect(parsed?.images).toEqual({})
    expect(parsed?.messages).toHaveLength(2)
  })

  it('reads an answer with no messages', () => {
    expect(parseMascotContent({ ...json, messages: [] })?.messages).toEqual([])
  })

  it.each([
    ['null', null],
    ['text', 'hello'],
    ['an array', []],
    ['a missing version', { images: {}, messages: [] }],
    ['a non-numeric version', { version: 'new', images: {}, messages: [] }],
  ])('rejects %s', (_label, raw) => {
    expect(parseMascotContent(raw)).toBeNull()
  })

  it('treats missing images or messages as empty, not as an error', () => {
    expect(parseMascotContent({ version: 5 })).toEqual({ version: 5, images: {}, messages: [] })
  })

  it('drops a picture whose address is not a plain web address (it ends up in an <img>)', () => {
    const parsed = parseMascotContent({
      ...json,
      images: {
        smile: { ...json.images.smile, url: 'javascript:alert(1)' },
        wave: { ...json.images.smile, url: 'data:image/png;base64,AAAA' },
        cheer: { ...json.images.smile, url: 'not a url' },
        lift: { ...json.images.smile, url: 'https://ok.example/lift.png' },
      },
    })
    expect(Object.keys(parsed?.images ?? {})).toEqual(['lift'])
  })

  it('drops a picture with no address', () => {
    expect(Object.keys(parseMascotContent({ ...json, images: { smile: { ...json.images.smile, url: '' } } })?.images ?? {})).toEqual([])
  })

  it('drops an unreadable message and keeps the rest', () => {
    const parsed = parseMascotContent({
      ...json,
      messages: [
        { id: 1, key: 'a', locale: 'en', priority: 1, expression: 'smile', message: 'good' },
        { id: 'x', key: 'b', locale: 'en', priority: 2, expression: 'smile', message: 'bad id' },
        { id: 3, key: 'c', locale: 'en', priority: 'high', expression: 'smile', message: 'bad priority' },
        { id: 4, key: 'd', locale: 'en', priority: 4, expression: 'smile', message: '   ' },
        { id: 5, key: 'e', locale: 'en', priority: 5, message: 'no expression' },
        'nonsense',
      ],
    })
    expect(parsed?.messages.map((m) => m.key)).toEqual(['a'])
  })

  it('defaults an unreadable v to 0 and keeps a picture with no shape', () => {
    const parsed = parseMascotContent({ ...json, images: { smile: { kind: 'expression', url: 'https://ok.example/s.png', alt: null, width: null, height: null } } })
    expect(parsed?.images.smile).toMatchObject({ width: null, height: null, v: 0 })
  })

  it('keeps the order the database sent', () => {
    const parsed = parseMascotContent({ ...json, messages: [json.messages[1], json.messages[0]] })
    expect(parsed?.messages.map((m) => m.id)).toEqual([2, 1])
  })
})

describe('fetchMascotContent', () => {
  it('asks for the English content by default', async () => {
    fake.rpc.mockResolvedValue({ data: json, error: null })
    await fetchMascotContent()
    expect(fake.rpc).toHaveBeenCalledWith('get_mascot_content', { p_locale: 'en' })
  })

  it('passes another locale through', async () => {
    fake.rpc.mockResolvedValue({ data: json, error: null })
    await fetchMascotContent('hi')
    expect(fake.rpc).toHaveBeenCalledWith('get_mascot_content', { p_locale: 'hi' })
  })

  it('returns the parsed content', async () => {
    fake.rpc.mockResolvedValue({ data: json, error: null })
    const result = await fetchMascotContent()
    expect(result.status).toBe('ok')
    if (result.status === 'ok') expect(result.content.messages).toHaveLength(2)
  })

  it('returns an error (never throws) for a database error', async () => {
    fake.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    expect(await fetchMascotContent()).toEqual({ status: 'error' })
  })

  it('returns an error for an answer of the wrong shape', async () => {
    fake.rpc.mockResolvedValue({ data: { surprise: true }, error: null })
    expect(await fetchMascotContent()).toEqual({ status: 'error' })
  })

  it('returns an error (never throws) when the call itself fails', async () => {
    fake.rpc.mockRejectedValue(new Error('Failed to fetch'))
    expect(await fetchMascotContent()).toEqual({ status: 'error' })
  })
})
