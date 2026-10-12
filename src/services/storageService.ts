import { STORAGE_KEY } from '../config/constants'
import type { Gym, ShowupData, ShowupEvent, TemporaryUser } from '../types'

/**
 * Reads and writes all Showup data to the browser's localStorage.
 *
 * This is the only file that touches localStorage. To move to a backend later,
 * replace these functions and keep their inputs and outputs the same.
 */

export type LoadResult =
  | { status: 'ok'; data: ShowupData }
  | { status: 'unavailable' } // localStorage is blocked or missing
  | { status: 'corrupted' } // something is saved, but it is not valid Showup data

export function createEmptyData(): ShowupData {
  return { schemaVersion: 1, user: null, gyms: [], events: [] }
}

function getStorage(): Storage | null {
  try {
    // Accessing localStorage can throw (e.g. in some private browsing modes).
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function loadData(): LoadResult {
  const storage = getStorage()
  if (!storage) return { status: 'unavailable' }

  let raw: string | null
  try {
    raw = storage.getItem(STORAGE_KEY)
  } catch {
    return { status: 'unavailable' }
  }

  if (raw === null) return { status: 'ok', data: createEmptyData() }

  try {
    const parsed: unknown = JSON.parse(raw)
    return isShowupData(parsed) ? { status: 'ok', data: parsed } : { status: 'corrupted' }
  } catch {
    return { status: 'corrupted' }
  }
}

/** Returns false if the data could not be saved (e.g. storage full or blocked). */
export function saveData(data: ShowupData): boolean {
  const storage = getStorage()
  if (!storage) return false
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(data))
    return true
  } catch {
    return false
  }
}

export function clearData(): void {
  try {
    getStorage()?.removeItem(STORAGE_KEY)
  } catch {
    // Nothing useful to do if storage is blocked; the app will start fresh anyway.
  }
}

// --- Validation -------------------------------------------------------------
// localStorage can be edited by hand or left over from an older version, so we
// check the shape before trusting it. Kept hand-written to avoid a dependency.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isTemporaryUser(value: unknown): value is TemporaryUser {
  return isRecord(value) && isString(value.id) && isString(value.username) && isString(value.createdAt)
}

function isGym(value: unknown): value is Gym {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.userId) &&
    isString(value.label) &&
    (value.googlePlaceId === null || isString(value.googlePlaceId)) &&
    isString(value.name) &&
    isString(value.formattedAddress) &&
    isFiniteNumber(value.latitude) &&
    isFiniteNumber(value.longitude) &&
    isString(value.createdAt)
  )
}

function isShowupEvent(value: unknown): value is ShowupEvent {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.userId) &&
    isString(value.gymId) &&
    isString(value.verifiedAt) &&
    (value.distanceMetres === null || isFiniteNumber(value.distanceMetres))
  )
}

function isShowupData(value: unknown): value is ShowupData {
  return (
    isRecord(value) &&
    value.schemaVersion === 1 &&
    (value.user === null || isTemporaryUser(value.user)) &&
    Array.isArray(value.gyms) &&
    value.gyms.every(isGym) &&
    Array.isArray(value.events) &&
    value.events.every(isShowupEvent)
  )
}
