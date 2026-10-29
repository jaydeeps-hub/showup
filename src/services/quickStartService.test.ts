import { describe, expect, it, vi } from 'vitest'
import {
  hasPendingQuickStart,
  markQuickStartDone,
  QUICKSTART_PENDING_KEY_PREFIX,
  retryPendingQuickStart,
  type PendingStorage,
  type QuickStartDependencies,
} from './quickStartService'

function memoryStorage(initial: Record<string, string> = {}): PendingStorage & { data: Record<string, string> } {
  const data = { ...initial }
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value
    },
    removeItem: (key) => {
      delete data[key]
    },
  }
}

function setup(complete: QuickStartDependencies['complete'], initial: Record<string, string> = {}) {
  const storage = memoryStorage(initial)
  const deps: QuickStartDependencies = { complete: vi.fn(complete), storage }
  return { deps, storage }
}

const KEY = (userId: string) => `${QUICKSTART_PENDING_KEY_PREFIX}${userId}`

describe('markQuickStartDone', () => {
  it('calls the database once and reports success when it confirms', async () => {
    const { deps } = setup(async () => true)
    expect(await markQuickStartDone('u1', deps)).toBe(true)
    expect(deps.complete).toHaveBeenCalledTimes(1)
  })

  it('remembers nothing when the database confirms', async () => {
    const { deps, storage } = setup(async () => true)
    await markQuickStartDone('u1', deps)
    expect(storage?.getItem(KEY('u1'))).toBeNull()
  })

  it('remembers it for the next launch when the call FAILS', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { deps, storage } = setup(async () => {
      throw new Error('offline')
    })
    expect(await markQuickStartDone('u1', deps)).toBe(false)
    expect(storage?.getItem(KEY('u1'))).toBe('1')
    expect(hasPendingQuickStart('u1', deps)).toBe(true)
  })

  it('remembers it for the next launch when the database answers FALSE (no profile row was updated)', async () => {
    const { deps, storage } = setup(async () => false)
    expect(await markQuickStartDone('u1', deps)).toBe(false)
    expect(storage?.getItem(KEY('u1'))).toBe('1')
  })

  it('NEVER throws or rejects, whatever goes wrong', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const failure of [new Error('x'), 'a string', undefined, { code: '42501' }]) {
      const { deps } = setup(() => Promise.reject(failure))
      await expect(markQuickStartDone('u1', deps)).resolves.toBe(false)
    }
  })

  it('does not throw even if the browser storage is blocked', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const storage: PendingStorage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    }
    const deps: QuickStartDependencies = { complete: async () => false, storage }
    await expect(markQuickStartDone('u1', deps)).resolves.toBe(false)
    expect(hasPendingQuickStart('u1', deps)).toBe(false)
  })

  it('works with no storage at all', async () => {
    const deps: QuickStartDependencies = { complete: async () => false, storage: null }
    await expect(markQuickStartDone('u1', deps)).resolves.toBe(false)
  })

  it('keeps a reminder per person, so one account never marks another as pending', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { deps } = setup(async () => {
      throw new Error('offline')
    })
    await markQuickStartDone('alice', deps)
    expect(hasPendingQuickStart('alice', deps)).toBe(true)
    expect(hasPendingQuickStart('bob', deps)).toBe(false)
  })
})

describe('retrying on the next launch', () => {
  it('does nothing, and does not call the database, when nothing is pending', async () => {
    const { deps } = setup(async () => true)
    expect(await retryPendingQuickStart('u1', deps)).toBe(false)
    expect(deps.complete).not.toHaveBeenCalled()
  })

  it('tries again when something is pending, and clears the reminder once the database confirms', async () => {
    const { deps, storage } = setup(async () => true, { [KEY('u1')]: '1' })
    expect(await retryPendingQuickStart('u1', deps)).toBe(true)
    expect(deps.complete).toHaveBeenCalledTimes(1)
    expect(storage?.getItem(KEY('u1'))).toBeNull()
    expect(hasPendingQuickStart('u1', deps)).toBe(false)
  })

  it('keeps the reminder, for yet another launch, if the retry fails too', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { deps, storage } = setup(async () => {
      throw new Error('still offline')
    }, { [KEY('u1')]: '1' })
    expect(await retryPendingQuickStart('u1', deps)).toBe(false)
    expect(storage?.getItem(KEY('u1'))).toBe('1')
  })

  it('keeps the reminder if the retry is answered with false', async () => {
    const { deps, storage } = setup(async () => false, { [KEY('u1')]: '1' })
    await retryPendingQuickStart('u1', deps)
    expect(storage?.getItem(KEY('u1'))).toBe('1')
  })

  it('a whole story: offline when finishing, then recorded on the next launch', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const storage = memoryStorage()
    let online = false
    const deps: QuickStartDependencies = {
      complete: async () => {
        if (!online) throw new Error('offline')
        return true
      },
      storage,
    }

    expect(await markQuickStartDone('u1', deps)).toBe(false) // finishing while offline
    expect(hasPendingQuickStart('u1', deps)).toBe(true)

    expect(await retryPendingQuickStart('u1', deps)).toBe(false) // launch 2, still offline
    expect(hasPendingQuickStart('u1', deps)).toBe(true)

    online = true
    expect(await retryPendingQuickStart('u1', deps)).toBe(true) // launch 3, back online
    expect(hasPendingQuickStart('u1', deps)).toBe(false)
  })

  it('only retries the person who is signed in now', async () => {
    const { deps } = setup(async () => true, { [KEY('alice')]: '1' })
    expect(await retryPendingQuickStart('bob', deps)).toBe(false)
    expect(deps.complete).not.toHaveBeenCalled()
  })

  it('does not treat an unexpected stored value as pending', () => {
    const { deps } = setup(async () => true, { [KEY('u1')]: 'yes please' })
    expect(hasPendingQuickStart('u1', deps)).toBe(false)
  })
})
