import type { Gym } from '../types'

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
