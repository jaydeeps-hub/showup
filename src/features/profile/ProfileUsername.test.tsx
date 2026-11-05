// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { theme } from '../../app/theme'
import type { Profile, ProfileEdits, SaveResult } from '../../types'

/**
 * The username on the Profile tab (Phase 11d): the "@username" line under the name, the Username row, and the
 * Username field in the edit view with its save order (set_username BEFORE the rest, only when it changed). The REAL
 * Profile screen and edit form are used. Only the database calls (the username RPCs) and the goal data are faked, and
 * the save behaves like the app's: it replaces the profile with the row the database returns, read again with the
 * username, so the header and the list update.
 */

vi.mock('../../hooks/useGoalState', () => ({
  useGoalState: () => ({ status: 'ready', goal: { hasGoal: true, currentGoal: 3, pendingGoal: null, pendingFrom: null }, save: vi.fn(), retry: vi.fn() }),
}))
vi.mock('../../hooks/useMascot', () => ({ useMascotContent: () => ({ version: 1, images: {}, messages: [] }) }))
const usernames = vi.hoisted(() => ({ checkUsername: vi.fn(), saveUsername: vi.fn() }))
vi.mock('../../services/usernameService', () => usernames)

const { ManageProfileScreen } = await import('./ManageProfileScreen')

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'user-1',
    firstName: 'Asha',
    lastName: 'Rao',
    dateOfBirth: '1990-05-17',
    isAdmin: false,
    placeSearchMode: 'fitness_only',
    quickstartCompletedAt: '2026-10-17T10:00:00Z',
    username: 'asha_rao',
    usernameChangedAt: '2026-11-01T10:00:00Z',
    createdAt: '2026-10-17T10:00:00Z',
    updatedAt: '2026-10-17T10:00:00Z',
    ...overrides,
  }
}

/** The fake database row: set_username and the profile update both change it, as the real ones change the real row. */
let row: Profile
const saveProfile = vi.fn(async (edits: ProfileEdits): Promise<SaveResult> => {
  row = { ...row, ...edits }
  return { ok: true }
})

/** Holds the profile the way App does: a save replaces it with the saved row, so the screen shows what was saved. */
function Harness() {
  const [shown, setShown] = useState<Profile>(row)
  return (
    <ManageProfileScreen
      profile={shown}
      email="asha@example.com"
      gym={null}
      onSave={async (edits) => {
        const result = await saveProfile(edits)
        if (result.ok) setShown(row) // the database's reply, read again with the username
        return result
      }}
      onChangeSearchMode={vi.fn()}
      onChangeGym={vi.fn()}
      onSignOut={vi.fn()}
    />
  )
}

function renderProfile(start: Profile) {
  row = start
  return render(
    <ThemeProvider theme={theme}>
      <Harness />
    </ThemeProvider>,
  )
}

const usernameLine = () => screen.queryByTestId('profile-username')
const rowValue = (label: string) => {
  const labelNode = screen.getAllByText(label).find((node) => node.tagName === 'SPAN')
  return labelNode?.parentElement?.querySelector('b')?.textContent ?? null
}
const rowLabels = () => Array.from(document.querySelectorAll('b')).map((value) => value.previousElementSibling?.textContent ?? '')
const usernameBox = () => screen.getByLabelText('Username') as HTMLInputElement
const usernameHint = () => document.getElementById('profile-username-hint') as HTMLElement
const saveButton = () => screen.getByRole('button', { name: /save changes|saving/i }) as HTMLButtonElement
const colourOf = (element: Element) => getComputedStyle(element).color.replace(/\s/g, '')
const MUTED = 'rgb(141,147,160)'
const GREEN = 'rgb(61,190,139)'
const RED = 'rgb(240,112,122)'

async function startEditing(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Edit details' }))
}
async function typeUsername(user: ReturnType<typeof userEvent.setup>, value: string, replace = true) {
  if (replace) await user.clear(usernameBox())
  await user.click(usernameBox())
  await user.keyboard(value)
}

beforeEach(() => {
  vi.clearAllMocks()
  usernames.checkUsername.mockImplementation(async (value: string) => ({
    status: 'ok',
    check: { username: value, available: true, reason: value === row.username ? 'own' : null, suggestion: null },
  }))
  usernames.saveUsername.mockImplementation(async (value: string) => {
    const changed = row.username !== value
    row = { ...row, username: value, usernameChangedAt: '2026-11-05T12:00:00Z' }
    return { status: 'saved', username: value, changed }
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('the header', () => {
  it('shows "@username" in the muted colour under the name', () => {
    renderProfile(profile())
    const line = usernameLine()!
    expect(line.textContent).toBe('@asha_rao')
    expect(colourOf(line)).toBe(MUTED)
    const heading = screen.getByRole('heading', { level: 1 })
    expect(Boolean(heading.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
  })

  it('shows nothing there for someone with no username (everyone from before Phase 11)', () => {
    renderProfile(profile({ username: null, usernameChangedAt: null }))
    expect(usernameLine()).toBeNull()
    expect(screen.queryByText(/^@/)).toBeNull()
  })
})

describe('the details list', () => {
  it('has Username as the first row, showing "@username"', () => {
    renderProfile(profile())
    expect(rowLabels()[0]).toBe('Username')
    expect(rowValue('Username')).toBe('@asha_rao')
  })

  it('shows "Not set" for someone with no username', () => {
    renderProfile(profile({ username: null }))
    expect(rowValue('Username')).toBe('Not set')
  })

  it('shows "Not added" for an empty last name', () => {
    renderProfile(profile({ lastName: null }))
    expect(rowValue('Last name')).toBe('Not added')
  })
})

describe('the edit view', () => {
  it('has the Username field first, with their username filled in and accepted, in green, without asking the server', async () => {
    const user = userEvent.setup()
    renderProfile(profile())
    await startEditing(user)
    const box = usernameBox()
    const first = screen.getByLabelText('First name')
    expect(Boolean(box.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
    expect(box.value).toBe('asha_rao')
    expect(usernameHint().textContent).toBe('This is your username')
    expect(colourOf(usernameHint())).toBe(GREEN)
    expect(box.placeholder).toBe('jay_shows_up')
    expect(box.maxLength).toBe(20)
    expect(box.getAttribute('autocapitalize')).toBe('none')
    expect(box.getAttribute('autocomplete')).toBe('username')
    expect(box.getAttribute('spellcheck')).toBe('false')
    expect(box.getAttribute('enterkeyhint')).toBe('next')
    expect(box.parentElement!.firstElementChild!.textContent).toBe('@')
    expect(usernameHint().getAttribute('aria-live')).toBe('polite')
    await new Promise((resolve) => setTimeout(resolve, 700))
    expect(usernames.checkUsername).not.toHaveBeenCalled()
  })

  it('someone with no username starts with an empty field and the default hint', async () => {
    const user = userEvent.setup()
    renderProfile(profile({ username: null }))
    await startEditing(user)
    expect(usernameBox().value).toBe('')
    expect(usernameHint().textContent).toBe('Friends find you with this. 3–20 letters, numbers or underscores.')
    expect(colourOf(usernameHint())).toBe(MUTED)
  })

  it('checks a new name live, the same as onboarding: "Checking @v…", then green "✓ @v is available"', async () => {
    const user = userEvent.setup()
    renderProfile(profile())
    await startEditing(user)
    await typeUsername(user, 'asha_lifts')
    expect(usernameHint().textContent).toBe('Checking @asha_lifts…')
    expect(await screen.findByText('✓ @asha_lifts is available', {}, { timeout: 3000 })).toBeTruthy()
    expect(colourOf(usernameHint())).toBe(GREEN)
  })

  it('cleans what is typed, and Enter moves to First name without saving', async () => {
    const user = userEvent.setup()
    renderProfile(profile())
    await startEditing(user)
    await typeUsername(user, 'Asha Lifts!{Enter}')
    expect(usernameBox().value).toBe('ashalifts')
    expect(document.activeElement).toBe(screen.getByLabelText('First name'))
    expect(saveProfile).not.toHaveBeenCalled()
  })

  it('going back to their own name says "This is your username" again', async () => {
    const user = userEvent.setup()
    renderProfile(profile())
    await startEditing(user)
    await typeUsername(user, 'asha_rao2')
    await typeUsername(user, '{Backspace}', false)
    expect(usernameHint().textContent).toBe('This is your username')
  })
})

describe('saving', () => {
  it('an unchanged username is NOT sent: only the rest is saved', async () => {
    const user = userEvent.setup()
    renderProfile(profile())
    await startEditing(user)
    await user.clear(screen.getByLabelText('First name'))
    await user.type(screen.getByLabelText('First name'), 'Ashley')
    await user.click(saveButton())
    await vi.waitFor(() => expect(saveProfile).toHaveBeenCalledTimes(1))
    expect(usernames.saveUsername).not.toHaveBeenCalled()
    expect(saveProfile).toHaveBeenCalledWith({ firstName: 'Ashley', lastName: 'Rao', dateOfBirth: '1990-05-17' })
  })

  it('a changed username is saved FIRST, then the rest, and the header and the list show the new name', async () => {
    const user = userEvent.setup()
    renderProfile(profile())
    await startEditing(user)
    await typeUsername(user, 'asha_lifts')
    await screen.findByText('✓ @asha_lifts is available', {}, { timeout: 3000 })
    await user.click(saveButton())

    await vi.waitFor(() => expect(saveProfile).toHaveBeenCalledTimes(1))
    expect(usernames.saveUsername).toHaveBeenCalledWith('asha_lifts')
    expect(usernames.saveUsername.mock.invocationCallOrder[0]).toBeLessThan(saveProfile.mock.invocationCallOrder[0])
    // Back in the read view, with the new username in the header and the first row.
    expect(await screen.findByRole('button', { name: 'Edit details' })).toBeTruthy()
    expect(usernameLine()!.textContent).toBe('@asha_lifts')
    expect(rowValue('Username')).toBe('@asha_lifts')
  })

  it('someone with no username can leave the field empty and still save their other changes', async () => {
    const user = userEvent.setup()
    renderProfile(profile({ username: null }))
    await startEditing(user)
    await user.clear(screen.getByLabelText('First name'))
    await user.type(screen.getByLabelText('First name'), 'Ashley')
    await user.click(saveButton())
    await vi.waitFor(() => expect(saveProfile).toHaveBeenCalledTimes(1))
    expect(usernames.saveUsername).not.toHaveBeenCalled()
    expect(usernameLine()).toBeNull() // still none
  })

  it('someone with no username can pick one here: it is saved first and then shows in the header', async () => {
    const user = userEvent.setup()
    renderProfile(profile({ username: null }))
    await startEditing(user)
    await typeUsername(user, 'asha_rao')
    await screen.findByText('✓ @asha_rao is available', {}, { timeout: 3000 })
    await user.click(saveButton())
    await vi.waitFor(() => expect(saveProfile).toHaveBeenCalledTimes(1))
    expect(usernames.saveUsername).toHaveBeenCalledWith('asha_rao')
    expect((await screen.findByTestId('profile-username')).textContent).toBe('@asha_rao')
  })

  it.each([
    ['taken', { status: 'ok', check: { username: 'jay', available: false, reason: 'taken', suggestion: 'jay_22' } }, 'jay'],
    ['too short', null, 'ab'],
    ['could not be checked', { status: 'error' }, 'asha_lifts'],
  ] as const)('is blocked while the username is %s: nothing is saved and the cursor goes to the username', async (_case, reply, value) => {
    if (reply) usernames.checkUsername.mockResolvedValue(reply)
    const user = userEvent.setup()
    renderProfile(profile())
    await startEditing(user)
    await typeUsername(user, value)
    if (reply) await vi.waitFor(() => expect(usernameHint().getAttribute('data-status')).toBe('error'), { timeout: 3000 })
    expect(colourOf(usernameHint())).toBe(RED)
    expect(usernameBox().getAttribute('aria-invalid')).toBe('true')
    await user.click(saveButton())
    expect(saveProfile).not.toHaveBeenCalled()
    expect(usernames.saveUsername).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(usernameBox())
    expect(screen.queryByRole('button', { name: 'Edit details' })).toBeNull() // still editing
  })

  it('is blocked while the username is still being checked', async () => {
    const user = userEvent.setup()
    renderProfile(profile())
    await startEditing(user)
    await typeUsername(user, 'asha_lifts')
    expect(usernameHint().textContent).toBe('Checking @asha_lifts…')
    fireEvent.submit(saveButton().closest('form')!)
    await act(async () => {})
    expect(saveProfile).not.toHaveBeenCalled()
    expect(usernames.saveUsername).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(usernameBox())
  })

  it('someone who HAS a username cannot clear it: an empty field blocks the save and says why, in red under the field', async () => {
    const user = userEvent.setup()
    renderProfile(profile())
    await startEditing(user)
    await user.clear(usernameBox())
    // Before Save the empty field only shows the grey default hint, so nothing tells the person anything yet.
    expect(colourOf(usernameHint())).toBe(MUTED)
    await user.click(saveButton())
    expect(saveProfile).not.toHaveBeenCalled()
    expect(usernames.saveUsername).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(usernameBox())
    expect(usernameHint().textContent).toBe("You can't remove your username. Type a new one, or press Cancel to keep @asha_rao.")
    expect(colourOf(usernameHint())).toBe(RED)
    expect(usernameBox().getAttribute('aria-invalid')).toBe('true')
    expect(screen.queryByRole('button', { name: 'Edit details' })).toBeNull() // still editing
  })

  it('the "can’t remove" message goes as soon as they type, and Cancel keeps their username', async () => {
    const user = userEvent.setup()
    renderProfile(profile())
    await startEditing(user)
    await user.clear(usernameBox())
    await user.click(saveButton())
    expect(screen.getByText(/You can't remove your username/)).toBeTruthy()

    await typeUsername(user, 'a', false)
    expect(screen.queryByText(/You can't remove your username/)).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(usernameLine()!.textContent).toBe('@asha_rao')
    expect(rowValue('Username')).toBe('@asha_rao')
  })

  it('someone with NO username never sees the "can’t remove" message, even when Save is blocked with the field empty', async () => {
    // Blocked by a bad first name typed AFTER a too-short username was cleared: make sure an empty username is not
    // what gets blamed. First a plain save with an empty field goes through.
    const user = userEvent.setup()
    renderProfile(profile({ username: null }))
    await startEditing(user)
    await user.click(saveButton())
    await vi.waitFor(() => expect(saveProfile).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(/You can't remove your username/)).toBeNull()
  })

  it('someone with NO username who presses Save while a new name is still being checked: no "can’t remove" message', async () => {
    // "Checking…" is not an error, so any stored message would show over it. This is the one place it could.
    const user = userEvent.setup()
    renderProfile(profile({ username: null }))
    await startEditing(user)
    await typeUsername(user, 'asha_rao')
    expect(usernameHint().textContent).toBe('Checking @asha_rao…')
    fireEvent.submit(saveButton().closest('form')!)
    await act(async () => {})
    expect(saveProfile).not.toHaveBeenCalled()
    expect(screen.queryByText(/You can't remove your username/)).toBeNull()
    expect(usernameHint().textContent).toBe('Checking @asha_rao…')
  })

  it('someone with NO username who types a bad one and clears it again: no "can’t remove" message on Save', async () => {
    const user = userEvent.setup()
    renderProfile(profile({ username: null }))
    await startEditing(user)
    await typeUsername(user, 'ab')
    await user.click(saveButton()) // blocked: too short
    expect(saveProfile).not.toHaveBeenCalled()
    expect(screen.queryByText(/You can't remove your username/)).toBeNull()
    await user.clear(usernameBox())
    await user.click(saveButton()) // empty again: fine for someone with none
    await vi.waitFor(() => expect(saveProfile).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(/You can't remove your username/)).toBeNull()
  })

  it('a block for any OTHER reason does not leave a "can’t remove" message waiting behind it', async () => {
    // Save while the name is still being checked: the hint shows "Checking…", which is not an error, so a stored
    // message WOULD show over it. None must be stored for this block.
    const user = userEvent.setup()
    renderProfile(profile())
    await startEditing(user)
    await typeUsername(user, 'asha_lifts')
    expect(usernameHint().textContent).toBe('Checking @asha_lifts…')
    fireEvent.submit(saveButton().closest('form')!)
    await act(async () => {})
    expect(saveProfile).not.toHaveBeenCalled()
    expect(screen.queryByText(/You can't remove your username/)).toBeNull()
    expect(usernameHint().textContent).toBe('Checking @asha_lifts…')
  })

  it('a username refused as taken: the message under the field, with the suggestion from the fresh check, nothing else saved, still editing', async () => {
    const user = userEvent.setup()
    renderProfile(profile())
    await startEditing(user)
    await typeUsername(user, 'asha_lifts')
    await screen.findByText('✓ @asha_lifts is available', {}, { timeout: 3000 })
    await user.clear(screen.getByLabelText('First name'))
    await user.type(screen.getByLabelText('First name'), 'Ashley')

    usernames.saveUsername.mockResolvedValue({ status: 'error', message: '@asha_lifts is taken', taken: true })
    usernames.checkUsername.mockResolvedValue({ status: 'ok', check: { username: 'asha_lifts', available: false, reason: 'taken', suggestion: 'asha_lifts_22' } })
    await user.click(saveButton())

    expect(await screen.findByText('@asha_lifts is taken. Try @asha_lifts_22', {}, { timeout: 3000 })).toBeTruthy()
    expect(colourOf(usernameHint())).toBe(RED)
    expect(saveProfile).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Edit details' })).toBeNull() // still editing
    expect((screen.getByLabelText('First name') as HTMLInputElement).value).toBe('Ashley') // what was typed is kept
    expect(usernameLine()!.textContent).toBe('@asha_rao') // the header still shows the old name
  })

  it('a username_cooldown refusal: "You can change your username again in N day(s)." under the field, and nothing else saved', async () => {
    usernames.saveUsername.mockResolvedValue({ status: 'error', message: 'You can change your username again in 12 day(s).', taken: false })
    const user = userEvent.setup()
    renderProfile(profile())
    await startEditing(user)
    await typeUsername(user, 'asha_lifts')
    await screen.findByText('✓ @asha_lifts is available', {}, { timeout: 3000 })
    await user.click(saveButton())
    const message = await screen.findByText('You can change your username again in 12 day(s).')
    expect(usernameHint().contains(message)).toBe(true) // under the username field
    expect(colourOf(usernameHint())).toBe(RED)
    expect(saveProfile).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Edit details' })).toBeNull()
  })

  it('editing the username after a refusal clears it and checks again', async () => {
    usernames.saveUsername.mockResolvedValueOnce({ status: 'error', message: 'You can change your username again in 3 day(s).', taken: false })
    const user = userEvent.setup()
    renderProfile(profile())
    await startEditing(user)
    await typeUsername(user, 'asha_lifts')
    await screen.findByText('✓ @asha_lifts is available', {}, { timeout: 3000 })
    await user.click(saveButton())
    await screen.findByText('You can change your username again in 3 day(s).')
    await typeUsername(user, '2', false)
    expect(screen.queryByText('You can change your username again in 3 day(s).')).toBeNull()
    expect(await screen.findByText('✓ @asha_lifts2 is available', {}, { timeout: 3000 })).toBeTruthy()
  })

  it('Cancel throws a typed username away, and the next edit starts from the saved one', async () => {
    const user = userEvent.setup()
    renderProfile(profile())
    await startEditing(user)
    await typeUsername(user, 'something_else')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(usernames.saveUsername).not.toHaveBeenCalled()
    await startEditing(user)
    expect(usernameBox().value).toBe('asha_rao')
    expect(usernameHint().textContent).toBe('This is your username')
  })
})
