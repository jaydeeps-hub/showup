// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '@mui/material/styles'
import type { Session } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { theme } from './theme'
import type { Profile, ProfileEdits } from '../types'

/**
 * Journey tests for onboarding and Manage Profile, using the REAL screens, hooks and form
 * validation. Only the outside world is faked: the Supabase session, the profile database
 * calls, the gym storage and the Google Maps search.
 */

const USER_ID = 'user-1'

// --- Fakes for the outside world -------------------------------------------------------

const auth = vi.hoisted(() => ({ signOut: vi.fn() }))
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    status: 'signed-in',
    session: {
      user: { id: 'user-1', email: 'asha@example.com', user_metadata: { full_name: 'Asha Rao' } },
    } as unknown as Session,
  }),
}))
vi.mock('../services/authService', () => ({
  getIdentity: () => ({ id: 'user-1', username: 'Asha Rao' }),
  signOut: auth.signOut,
}))

const db = vi.hoisted(() => ({ fetchProfile: vi.fn(), updateProfile: vi.fn() }))
vi.mock('../services/profileService', () => ({
  fetchProfile: db.fetchProfile,
  updateProfile: db.updateProfile,
}))

// The home screen needs a saved gym, otherwise the app shows gym setup instead.
vi.mock('../hooks/useShowup', () => ({
  useShowup: () => ({
    storageStatus: 'ok',
    isNotPersisting: false,
    gym: {
      id: 'gym-1',
      userId: 'user-1',
      label: 'Gym 1',
      googlePlaceId: null,
      name: 'Iron Gym',
      formattedAddress: '1 Main Road',
      latitude: 1,
      longitude: 1,
      createdAt: '2026-10-17T00:00:00Z',
    },
    showupCount: 3,
    isVerifying: false,
    saveGym: vi.fn(),
    showUp: vi.fn(),
    resetDemoData: vi.fn(),
    continueWithoutSaving: vi.fn(),
  }),
}))

const { App } = await import('./App')

// --- Helpers ---------------------------------------------------------------------------

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: USER_ID,
    firstName: null,
    lastName: null,
    dateOfBirth: null,
    isAdmin: false,
    createdAt: '2026-10-17T10:00:00Z',
    updatedAt: '2026-10-17T10:00:00Z',
    ...overrides,
  }
}

const completeProfile = profile({ firstName: 'Asha', lastName: 'Rao', dateOfBirth: '1990-05-17' })

/** A fake database: remembers the saved profile, so a reload (remount) sees the saved data. */
let stored: Profile
function useFakeDatabase(initial: Profile) {
  stored = initial
  db.fetchProfile.mockImplementation(async () => ({ status: 'found', profile: stored }))
  db.updateProfile.mockImplementation(async (_id: string, edits: ProfileEdits) => {
    stored = { ...stored, ...edits, updatedAt: '2026-10-17T11:00:00Z' }
    return { status: 'saved', profile: stored }
  })
}

function renderApp() {
  return render(
    <ThemeProvider theme={theme}>
      <App />
    </ThemeProvider>,
  )
}

const onboardingHeading = () => screen.queryByRole('heading', { name: "Let's get to know you." })
const homeShowUpButton = () => screen.queryByRole('button', { name: /show up/i })

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// --- Onboarding routing ----------------------------------------------------------------

describe('incomplete-profile routing', () => {
  it('shows onboarding, not the app, when the profile has no names', async () => {
    useFakeDatabase(profile())
    renderApp()

    expect(await screen.findByRole('heading', { name: "Let's get to know you." })).toBeTruthy()
    expect(screen.getByText('What should we call you, and when should we wish you on your birthday?')).toBeTruthy()
    expect(homeShowUpButton()).toBeNull()
  })

  it('shows a loading state, not the app, while the profile is loading', async () => {
    db.fetchProfile.mockReturnValue(new Promise(() => {})) // never resolves
    renderApp()

    expect(screen.getByRole('status')).toBeTruthy()
    expect(homeShowUpButton()).toBeNull()
    expect(onboardingHeading()).toBeNull()
  })

  it('shows onboarding when only one name is present', async () => {
    useFakeDatabase(profile({ firstName: 'Asha' }))
    renderApp()
    expect(await screen.findByRole('heading', { name: "Let's get to know you." })).toBeTruthy()
  })

  it('pre-fills names that Google already provided', async () => {
    useFakeDatabase(profile({ firstName: 'Asha' }))
    renderApp()

    expect((await screen.findByLabelText(/first name/i) as HTMLInputElement).value).toBe('Asha')
    expect((screen.getByLabelText(/last name/i) as HTMLInputElement).value).toBe('')
  })

  it('skips onboarding and shows the app when the profile is complete', async () => {
    useFakeDatabase(completeProfile)
    renderApp()

    expect(await screen.findByRole('button', { name: /show up/i })).toBeTruthy()
    expect(onboardingHeading()).toBeNull()
  })

  it('skips onboarding even when the birthday is missing (it is optional)', async () => {
    useFakeDatabase(profile({ firstName: 'Asha', lastName: 'Rao' }))
    renderApp()
    expect(await screen.findByRole('button', { name: /show up/i })).toBeTruthy()
  })

  it('keeps the app usable and shows a notice when the profile cannot be loaded', async () => {
    db.fetchProfile.mockResolvedValue({ status: 'error', message: 'offline' })
    renderApp()

    expect(await screen.findByRole('button', { name: /show up/i })).toBeTruthy()
    expect(screen.getByText(/profile could not be loaded/i)).toBeTruthy()
    // Without a profile there is nothing to manage, so the Profile button is hidden.
    expect(screen.queryByRole('button', { name: /^profile$/i })).toBeNull()
  })

  it('keeps the app usable and explains when no profile row exists', async () => {
    db.fetchProfile.mockResolvedValue({ status: 'not-found' })
    renderApp()
    expect(await screen.findByText(/profile was not found/i)).toBeTruthy()
    expect(await screen.findByRole('button', { name: /show up/i })).toBeTruthy()
  })
})

// --- Completing onboarding -------------------------------------------------------------

describe('completing onboarding', () => {
  it('saves the profile and moves on to the app', async () => {
    useFakeDatabase(profile())
    const user = userEvent.setup()
    renderApp()

    await user.type(await screen.findByLabelText(/first name/i), '  Asha ')
    await user.type(screen.getByLabelText(/last name/i), 'Rao')
    await user.type(screen.getByLabelText(/date of birth/i), '1990-05-17')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByRole('button', { name: /show up/i })).toBeTruthy()
    expect(db.updateProfile).toHaveBeenCalledTimes(1)
    expect(db.updateProfile).toHaveBeenCalledWith(USER_ID, {
      firstName: 'Asha',
      lastName: 'Rao',
      dateOfBirth: '1990-05-17',
    })
    expect(onboardingHeading()).toBeNull()
  })

  it('saves without a birthday', async () => {
    useFakeDatabase(profile())
    const user = userEvent.setup()
    renderApp()

    await user.type(await screen.findByLabelText(/first name/i), 'Asha')
    await user.type(screen.getByLabelText(/last name/i), 'Rao')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByRole('button', { name: /show up/i })).toBeTruthy()
    expect(db.updateProfile).toHaveBeenCalledWith(USER_ID, { firstName: 'Asha', lastName: 'Rao', dateOfBirth: null })
  })

  it('does not show onboarding again after a refresh', async () => {
    useFakeDatabase(profile())
    const user = userEvent.setup()
    const first = renderApp()

    await user.type(await screen.findByLabelText(/first name/i), 'Asha')
    await user.type(screen.getByLabelText(/last name/i), 'Rao')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await screen.findByRole('button', { name: /show up/i })

    first.unmount() // a page refresh: everything remounts and reloads from the database
    renderApp()

    expect(await screen.findByRole('button', { name: /show up/i })).toBeTruthy()
    expect(onboardingHeading()).toBeNull()
    expect(db.updateProfile).toHaveBeenCalledTimes(1) // not saved again, no duplicate
  })

  it('requires first and last name and does not call the database', async () => {
    useFakeDatabase(profile())
    const user = userEvent.setup()
    renderApp()

    await user.click(await screen.findByRole('button', { name: 'Continue' }))

    expect(await screen.findByText('Enter your first name.')).toBeTruthy()
    expect(screen.getByText('Enter your last name.')).toBeTruthy()
    expect(db.updateProfile).not.toHaveBeenCalled()
    expect(onboardingHeading()).toBeTruthy()
  })

  it('explains why the birthday is asked', async () => {
    useFakeDatabase(profile())
    renderApp()
    expect(await screen.findByText(/we use it only to wish you a happy birthday/i)).toBeTruthy()
  })

  it('rejects a birthday in the future and does not save', async () => {
    useFakeDatabase(profile())
    const user = userEvent.setup()
    renderApp()

    await user.type(await screen.findByLabelText(/first name/i), 'Asha')
    await user.type(screen.getByLabelText(/last name/i), 'Rao')
    await user.type(screen.getByLabelText(/date of birth/i), '2999-01-01')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByText("Birthday can't be in the future.")).toBeTruthy()
    expect(db.updateProfile).not.toHaveBeenCalled()
  })
})

// --- Manage Profile --------------------------------------------------------------------

async function openManageProfile(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /^profile$/i }))
  return screen.findByRole('heading', { name: 'Your profile' })
}

describe('Manage Profile', () => {
  it('opens from the home screen and shows the current details and Google email', async () => {
    useFakeDatabase(completeProfile)
    const user = userEvent.setup()
    renderApp()
    await openManageProfile(user)

    expect((screen.getByLabelText(/first name/i) as HTMLInputElement).value).toBe('Asha')
    expect((screen.getByLabelText(/last name/i) as HTMLInputElement).value).toBe('Rao')
    expect((screen.getByLabelText(/date of birth/i) as HTMLInputElement).value).toBe('1990-05-17')
    const email = screen.getByLabelText(/google account email/i) as HTMLInputElement
    expect(email.value).toBe('asha@example.com')
    expect(email.disabled).toBe(true) // cannot be edited
  })

  it('saves edits and updates the profile on screen', async () => {
    useFakeDatabase(completeProfile)
    const user = userEvent.setup()
    renderApp()
    await openManageProfile(user)

    const first = screen.getByLabelText(/first name/i)
    await user.clear(first)
    await user.type(first, 'Ashley')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Your changes have been saved.')).toBeTruthy()
    expect(db.updateProfile).toHaveBeenCalledWith(USER_ID, { firstName: 'Ashley', lastName: 'Rao', dateOfBirth: '1990-05-17' })
    expect(stored.firstName).toBe('Ashley')
    expect((screen.getByLabelText(/first name/i) as HTMLInputElement).value).toBe('Ashley')
  })

  it('shows the saved changes after a refresh', async () => {
    useFakeDatabase(completeProfile)
    const user = userEvent.setup()
    const first = renderApp()
    await openManageProfile(user)
    const lastName = screen.getByLabelText(/last name/i)
    await user.clear(lastName)
    await user.type(lastName, 'Iyer')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await screen.findByText('Your changes have been saved.')

    first.unmount()
    renderApp()
    await openManageProfile(user)
    expect((screen.getByLabelText(/last name/i) as HTMLInputElement).value).toBe('Iyer')
  })

  it('can clear the birthday', async () => {
    useFakeDatabase(completeProfile)
    const user = userEvent.setup()
    renderApp()
    await openManageProfile(user)

    await user.clear(screen.getByLabelText(/date of birth/i))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await screen.findByText('Your changes have been saved.')
    expect(db.updateProfile).toHaveBeenCalledWith(USER_ID, { firstName: 'Asha', lastName: 'Rao', dateOfBirth: null })
  })

  it('cancel discards edits and returns to the home screen without saving', async () => {
    useFakeDatabase(completeProfile)
    const user = userEvent.setup()
    renderApp()
    await openManageProfile(user)

    await user.type(screen.getByLabelText(/first name/i), ' Changed')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(await screen.findByRole('button', { name: /show up/i })).toBeTruthy()
    expect(db.updateProfile).not.toHaveBeenCalled()

    await openManageProfile(user)
    expect((screen.getByLabelText(/first name/i) as HTMLInputElement).value).toBe('Asha') // edit was discarded
  })

  it('signs out from the Manage Profile page', async () => {
    useFakeDatabase(completeProfile)
    const user = userEvent.setup()
    renderApp()
    await openManageProfile(user)

    await user.click(screen.getByRole('button', { name: /sign out/i }))
    expect(auth.signOut).toHaveBeenCalledTimes(1)
  })

  it('rejects a blank name when editing', async () => {
    useFakeDatabase(completeProfile)
    const user = userEvent.setup()
    renderApp()
    await openManageProfile(user)

    await user.clear(screen.getByLabelText(/first name/i))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Enter your first name.')).toBeTruthy()
    expect(db.updateProfile).not.toHaveBeenCalled()
  })

  it('rejects a future birthday when editing and keeps what was typed', async () => {
    useFakeDatabase(completeProfile)
    const user = userEvent.setup()
    renderApp()
    await openManageProfile(user)

    const dob = screen.getByLabelText(/date of birth/i)
    await user.clear(dob)
    await user.type(dob, '2999-12-31')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText("Birthday can't be in the future.")).toBeTruthy()
    expect((screen.getByLabelText(/date of birth/i) as HTMLInputElement).value).toBe('2999-12-31')
    expect(db.updateProfile).not.toHaveBeenCalled()
  })
})

// --- Database errors and retry ---------------------------------------------------------

describe('database errors and retrying a save', () => {
  it('shows the error, keeps everything typed, and succeeds when retried', async () => {
    useFakeDatabase(completeProfile)
    const user = userEvent.setup()
    renderApp()
    await openManageProfile(user)

    // First attempt fails (for example the network drops); the second works.
    db.updateProfile.mockResolvedValueOnce({ status: 'error', message: "We couldn't reach the server. Check your connection and try again." })

    const first = screen.getByLabelText(/first name/i)
    await user.clear(first)
    await user.type(first, 'Ashley')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText(/couldn't reach the server/i)).toBeTruthy()
    expect((screen.getByLabelText(/first name/i) as HTMLInputElement).value).toBe('Ashley') // nothing lost
    expect(stored.firstName).toBe('Asha') // nothing was saved
    expect(screen.queryByText('Your changes have been saved.')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Your changes have been saved.')).toBeTruthy()
    expect(db.updateProfile).toHaveBeenCalledTimes(2)
    expect(db.updateProfile).toHaveBeenLastCalledWith(USER_ID, { firstName: 'Ashley', lastName: 'Rao', dateOfBirth: '1990-05-17' })
    expect(stored.firstName).toBe('Ashley')
    expect(screen.queryByRole('alert')).toBeNull() // the error is gone after success
  })

  it('stays on onboarding with the typed values when saving fails, then completes on retry', async () => {
    useFakeDatabase(profile())
    const user = userEvent.setup()
    renderApp()

    db.updateProfile.mockResolvedValueOnce({ status: 'error', message: "We couldn't save your changes. Please try again." })

    await user.type(await screen.findByLabelText(/first name/i), 'Asha')
    await user.type(screen.getByLabelText(/last name/i), 'Rao')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(onboardingHeading()).toBeTruthy() // still here, not sent on to the app
    expect((screen.getByLabelText(/first name/i) as HTMLInputElement).value).toBe('Asha')
    expect((screen.getByLabelText(/last name/i) as HTMLInputElement).value).toBe('Rao')

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('button', { name: /show up/i })).toBeTruthy()
  })

  it('ignores a second press while a save is still in progress', async () => {
    useFakeDatabase(completeProfile)
    const user = userEvent.setup()
    renderApp()
    await openManageProfile(user)

    let finish!: (value: unknown) => void
    db.updateProfile.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))

    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    const saving = await screen.findByRole('button', { name: 'Saving…' })
    expect((saving as HTMLButtonElement).disabled).toBe(true) // the button cannot be pressed again
    // Pressing Enter in a field submits the form too, so try that as the "second press".
    await user.type(screen.getByLabelText(/date of birth/i), '{Enter}', { skipClick: true })

    finish({ status: 'saved', profile: completeProfile })
    await screen.findByText('Your changes have been saved.')
    expect(db.updateProfile).toHaveBeenCalledTimes(1)
  })
})

// --- is_admin --------------------------------------------------------------------------

describe('is_admin cannot be changed through the UI', () => {
  it('shows no admin control on onboarding or Manage Profile', async () => {
    useFakeDatabase(profile())
    const first = renderApp()
    await screen.findByRole('heading', { name: "Let's get to know you." })
    expect(screen.queryByText(/admin/i)).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByRole('switch')).toBeNull()
    first.unmount()

    useFakeDatabase(completeProfile)
    const user = userEvent.setup()
    renderApp()
    await openManageProfile(user)
    expect(screen.queryByText(/admin/i)).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('never sends is_admin when an administrator edits their profile', async () => {
    useFakeDatabase({ ...completeProfile, isAdmin: true })
    const user = userEvent.setup()
    renderApp()
    await openManageProfile(user)

    await user.type(screen.getByLabelText(/first name/i), 'a')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await screen.findByText('Your changes have been saved.')

    const sent = db.updateProfile.mock.calls[0][1] as Record<string, unknown>
    expect(Object.keys(sent).sort()).toEqual(['dateOfBirth', 'firstName', 'lastName'])
    expect(stored.isAdmin).toBe(true) // unchanged
  })
})
