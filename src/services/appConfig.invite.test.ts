import { describe, expect, it } from 'vitest'
import { DEFAULT_APP_CONFIG, DEFAULT_INVITE_URL, parseAppConfig, parseHttpsOrigin } from './appConfig'

/** `config.invite_url`: the plain app link the Squad invite shares. Only an https origin is accepted. */

const read = (value: unknown) => parseAppConfig({ invite_url: value }).inviteUrl

describe('inviteUrl (config.invite_url)', () => {
  it('defaults to the app on Vercel', () => {
    expect(DEFAULT_INVITE_URL).toBe('https://showup-pied.vercel.app')
    expect(DEFAULT_APP_CONFIG.inviteUrl).toBe('https://showup-pied.vercel.app')
    expect(parseAppConfig({}).inviteUrl).toBe('https://showup-pied.vercel.app')
  })

  it('reads a good https address as it is', () => {
    expect(read('https://showup.app')).toBe('https://showup.app')
    expect(read('https://showup-pied.vercel.app')).toBe('https://showup-pied.vercel.app')
  })

  it('drops a trailing slash', () => {
    expect(read('https://showup.app/')).toBe('https://showup.app')
  })

  it('keeps only the origin: a path, a query or a fragment is dropped (never a per-person link)', () => {
    expect(read('https://showup.app/join/jay')).toBe('https://showup.app')
    expect(read('https://showup.app/a/b?ref=1#top')).toBe('https://showup.app')
  })

  it('keeps a port, which is part of the origin', () => {
    expect(read('https://showup.app:8443/')).toBe('https://showup.app:8443')
  })

  it('trims spaces and lowercases the host', () => {
    expect(read('  https://showup.app  ')).toBe('https://showup.app')
    expect(read('HTTPS://Showup.App/')).toBe('https://showup.app')
  })

  it.each([
    ['missing', undefined],
    ['null', null],
    ['empty', ''],
    ['spaces', '   '],
  ])('falls back when %s', (_case, value) => {
    expect(read(value)).toBe(DEFAULT_INVITE_URL)
  })

  it('falls back for http (an insecure link must not be shared with friends)', () => {
    expect(read('http://showup.app')).toBe(DEFAULT_INVITE_URL)
  })

  it.each([
    ['plain words', 'not a url'],
    ['a host with no scheme', 'showup.app'],
    ['javascript', 'javascript:alert(1)'],
    ['data', 'data:text/html,hello'],
    ['ftp', 'ftp://showup.app'],
    ['https with no host', 'https://'],
    ['an odd form the URL parser reads as host "path"', 'https:///path'],
    ['a host with no dot', 'https://localhost'],
    ['a number', 42],
    ['an object', { url: 'https://showup.app' }],
    ['a list', ['https://showup.app']],
    ['true', true],
  ])('falls back for junk: %s', (_case, value) => {
    expect(read(value)).toBe(DEFAULT_INVITE_URL)
  })

  it('a bad invite_url does not disturb the other settings', () => {
    const parsed = parseAppConfig({ invite_url: 'junk', max_gym_distance_meters: '150' })
    expect(parsed.inviteUrl).toBe(DEFAULT_INVITE_URL)
    expect(parsed.maxGymDistanceMeters).toBe(150)
  })
})

describe('parseHttpsOrigin', () => {
  it('uses the fallback it is given', () => {
    expect(parseHttpsOrigin('nope', 'https://other.example')).toBe('https://other.example')
  })
})
