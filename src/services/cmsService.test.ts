import { beforeEach, describe, expect, it, vi } from 'vitest'

// Fake of from('cms').select().eq().eq().limit().maybeSingle(); every step is recorded.
const fake = vi.hoisted(() => ({
  steps: [] as Array<[string, unknown[]]>,
  response: { data: null as unknown, error: null as unknown },
}))

vi.mock('./supabaseClient', () => {
  const chain: Record<string, unknown> = {}
  for (const name of ['select', 'eq', 'limit']) {
    chain[name] = (...args: unknown[]) => {
      fake.steps.push([name, args])
      return chain
    }
  }
  chain.maybeSingle = () => Promise.resolve(fake.response)
  return { supabase: { from: (table: string) => (fake.steps.push(['from', [table]]), chain) }, isSupabaseConfigured: true }
})

const { CMS_ENTRIES, fetchCmsValue, toSafeImageUrl } = await import('./cmsService')

const stepArgs = (name: string) => fake.steps.filter(([step]) => step === name).map(([, args]) => args)

beforeEach(() => {
  fake.steps.length = 0
  fake.response = { data: null, error: null }
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('fetchCmsValue', () => {
  it('asks for the banner by BOTH id 1 and content type lpage_banner', async () => {
    fake.response = { data: { value: 'https://example.com/banner.png' }, error: null }

    expect(await fetchCmsValue(CMS_ENTRIES.landingBanner)).toEqual({ status: 'found', value: 'https://example.com/banner.png' })
    expect(stepArgs('from')).toEqual([['cms']])
    expect(stepArgs('select')).toEqual([['value']])
    expect(stepArgs('eq')).toEqual([
      ['id', 1],
      ['content_type', 'lpage_banner'],
    ])
  })

  it('asks for the terms by BOTH id 2 and content type tnc', async () => {
    fake.response = { data: { value: '# Terms' }, error: null }
    await fetchCmsValue(CMS_ENTRIES.termsAndConditions)
    expect(stepArgs('eq')).toEqual([
      ['id', 2],
      ['content_type', 'tnc'],
    ])
  })

  it('reports not-found when there is no such row, instead of inventing content', async () => {
    fake.response = { data: null, error: null }
    expect(await fetchCmsValue(CMS_ENTRIES.landingBanner)).toEqual({ status: 'not-found' })
  })

  it('treats an empty or blank value as not found', async () => {
    fake.response = { data: { value: '   ' }, error: null }
    expect(await fetchCmsValue(CMS_ENTRIES.termsAndConditions)).toEqual({ status: 'not-found' })
    fake.response = { data: { value: null }, error: null }
    expect(await fetchCmsValue(CMS_ENTRIES.termsAndConditions)).toEqual({ status: 'not-found' })
  })

  it('trims the value', async () => {
    fake.response = { data: { value: '\n  # Terms\n' }, error: null }
    expect(await fetchCmsValue(CMS_ENTRIES.termsAndConditions)).toEqual({ status: 'found', value: '# Terms' })
  })

  it('reports a database error', async () => {
    fake.response = { data: null, error: { message: 'permission denied for table cms' } }
    expect(await fetchCmsValue(CMS_ENTRIES.landingBanner)).toEqual({ status: 'error', message: 'permission denied for table cms' })
  })
})

describe('toSafeImageUrl', () => {
  it('accepts normal web addresses', () => {
    expect(toSafeImageUrl('https://example.com/a.png?x=1')).toBe('https://example.com/a.png?x=1')
    expect(toSafeImageUrl('http://localhost:3000/a.png')).toBe('http://localhost:3000/a.png')
  })

  it.each(['javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zz4=', 'file:///etc/passwd', 'not a url', '', '//example.com/a.png'])(
    'rejects %j',
    (value) => {
      expect(toSafeImageUrl(value)).toBeNull()
    },
  )
})
