import type { Gym, ReportedPosition, ShowupData } from '../types'

/** Shared sample data for tests. Coordinates are arbitrary, not a real gym. */

export const TEST_USER_ID = 'user-1'

export const testGym: Gym = {
  id: 'gym-1',
  userId: TEST_USER_ID,
  label: 'Gym 1',
  googlePlaceId: 'google-place-1',
  name: 'Test Gym',
  formattedAddress: '1 Test Street, Test City',
  latitude: 12.9716,
  longitude: 77.5946,
  createdAt: '2026-01-01T00:00:00.000Z',
}

/** One metre of latitude, in degrees (Earth radius 6,371 km). */
const METRE_IN_LATITUDE_DEGREES = 1 / 111_194.93

/** A position `metres` due north of the test gym. */
export function positionNorthOfGym(metres: number, accuracyMetres = 10): ReportedPosition {
  return {
    latitude: testGym.latitude + metres * METRE_IN_LATITUDE_DEGREES,
    longitude: testGym.longitude,
    accuracyMetres,
  }
}

export function createTestData(): ShowupData {
  return {
    schemaVersion: 1,
    user: { id: TEST_USER_ID, username: 'tester', createdAt: '2026-01-01T00:00:00.000Z' },
    gyms: [testGym],
    events: [],
  }
}
