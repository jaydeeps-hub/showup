import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEY } from '../config/constants'
import { createTestData } from '../test/fixtures'
import { clearData, loadData, saveData } from './storageService'

/** Minimal in-memory stand-in for window.localStorage. */
function createFakeStorage(): Storage {
  const items = new Map<string, string>()
  return {
    get length() {
      return items.size
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, String(value)),
  }
}

describe('storageService', () => {
  let storage: Storage

  beforeEach(() => {
    storage = createFakeStorage()
    vi.stubGlobal('localStorage', storage)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns empty data when nothing has been saved yet', () => {
    expect(loadData()).toEqual({ status: 'ok', data: { schemaVersion: 1, user: null, gyms: [], events: [] } })
  })

  it('saves and reloads data unchanged (survives a page reload)', () => {
    const data = createTestData()
    data.events.push({ id: 'e1', userId: 'user-1', gymId: 'gym-1', verifiedAt: '2026-01-01T00:00:00Z', distanceMetres: 4 })

    expect(saveData(data)).toBe(true)
    expect(loadData()).toEqual({ status: 'ok', data })
  })

  it('never stores a password', () => {
    saveData(createTestData())
    expect(storage.getItem(STORAGE_KEY)).not.toMatch(/password/i)
  })

  it('reports corrupted data when the JSON is invalid', () => {
    storage.setItem(STORAGE_KEY, '{not json')
    expect(loadData()).toEqual({ status: 'corrupted' })
  })

  it('reports corrupted data when the shape is wrong', () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, user: null, gyms: [{ name: 'no coordinates' }], events: [] }))
    expect(loadData()).toEqual({ status: 'corrupted' })
  })

  it('reports corrupted data from an unknown schema version', () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({ ...createTestData(), schemaVersion: 99 }))
    expect(loadData()).toEqual({ status: 'corrupted' })
  })

  it('clears saved data', () => {
    saveData(createTestData())
    clearData()
    expect(storage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('reports unavailable storage instead of crashing', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('SecurityError')
      },
    })
    expect(loadData()).toEqual({ status: 'unavailable' })
    expect(saveData(createTestData())).toBe(false)
  })
})
