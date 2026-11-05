// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '@mui/material/styles'
import type { Session } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Profile, ProfileEdits } from '../types'
import { theme } from './theme'

/**
 * The first onboarding screen, "What should we call you?" (Phase 10d), through the REAL App, screen, form and
 * validation. Only the outside world is faked: the session, the profile database calls and the gym hook.
 */

const auth = vi.hoisted(() => ({ signOut: vi.fn() }))
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    status: 'signed-in',
    session: { user: { id: 'user-1', email: 'asha@example.com', user_metadata: {} } } as unknown as Session,
  }),
}))
vi.mock('../services/authService', () => ({
  getIdentity: () => ({ id: 'user-1', username: 'Asha' }),
  signOut: auth.signOut,
}))

const db = vi.hoisted(() => ({ fetchProfile: vi.fn(), updateProfile: vi.fn() }))
// The username RPCs (the real hook and form use them; only the database calls are faked).
const usernames = vi.hoisted(() => ({ checkUsername: vi.fn(), saveUsername: vi.fn() }))
vi.mock('../services/usernameService', () => usernames)
vi.mock('../services/profileService', () => ({
  fetchProfile: db.fetchProfile,
  updateProfile: db.updateProfile,
}))
vi.mock('../hooks/useShowup', () => ({
  useShowup: () => ({
    dataStatus: 'ready',
    loadError: null,
    reload: vi.fn(),
    gym: { id: 'gym-1', userId: 'user-1', label: 'Gym 1', googlePlaceId: null, name: 'Iron Gym', formattedAddress: '1 Main Road', latitude: 1, longitude: 1, createdAt: '2026-10-17T00:00:00Z' },
    showupCount: 3,
    isVerifying: false,
    saveGym: vi.fn().mockResolvedValue({ ok: true }),
    showUp: vi.fn(),
  }),
}))

const { App } = await import('./App')
const { OnboardingStepHeader } = await import('../components/OnboardingStepHeader')
const { progressPercent, ONBOARDING_STEP_COUNT } = await import('../utils/onboardingProgress')
const { latestBirthDate } = await import('../utils/profileValidation')

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'user-1',
    firstName: null,
    lastName: null,
    dateOfBirth: null,
    isAdmin: false,
    placeSearchMode: 'fitness_only',
    quickstartCompletedAt: '2026-10-17T10:00:00Z',
    // Most tests here are about the names, so the person already has a username: it is filled in and accepted, and
    // Continue depends only on the names. The username tests below start from “no username” instead.
    username: 'asha_rao',
    usernameChangedAt: null,
    createdAt: '2026-10-17T10:00:00Z',
    updatedAt: '2026-10-17T10:00:00Z',
    ...overrides,
  }
}

function useFakeDatabase(initial: Profile) {
  let stored = initial
  db.fetchProfile.mockImplementation(async () => ({ status: 'found', profile: stored }))
  // A free name unless the test says otherwise; the person's own name is "own", as the database reports it.
  usernames.checkUsername.mockImplementation(async (value: string) => ({
    status: 'ok',
    check: { username: value, available: true, reason: value === stored.username ? 'own' : null, suggestion: null },
  }))
  // set_username writes the row, so the profile the next save returns (and any reload) carries the name.
  usernames.saveUsername.mockImplementation(async (value: string) => {
    const changed = stored.username !== value
    stored = { ...stored, username: value }
    return { status: 'saved', username: value, changed }
  })
  db.updateProfile.mockImplementation(async (_id: string, edits: ProfileEdits) => {
    stored = { ...stored, ...edits }
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

const title = () => screen.findByRole('heading', { name: 'What should we call you?' })
const usernameBox = () => screen.getByLabelText('Username') as HTMLInputElement
const usernameHint = () => document.getElementById('onboarding-username-hint') as HTMLElement
const first = () => screen.getByLabelText('First name') as HTMLInputElement
const last = () => screen.getByLabelText(/^last name/i) as HTMLInputElement // the label also holds the "Optional" tag
const birthday = () => screen.getByLabelText(/date of birth/i) as HTMLInputElement
const continueButton = () => screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement

beforeEach(() => {
  vi.clearAllMocks()
  useFakeDatabase(profile())
  auth.signOut.mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('the top row and the words', () => {
  it('has a progress bar 33% full and "1 of 3", and NO back arrow (it is the first step)', async () => {
    renderApp()
    await title()
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
    expect(screen.getByText('1 of 3')).toBeTruthy()
    expect(screen.getByTestId('step-progress').style.width || getComputedStyle(screen.getByTestId('step-progress')).width).toBe('33%')
  })

  it('has the title and the muted note', async () => {
    renderApp()
    expect(await title()).toBeTruthy()
    expect(screen.getByText('Just the basics. It takes a few seconds.')).toBeTruthy()
  })

  it('has no tab bar', async () => {
    renderApp()
    await title()
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull()
  })

  it('has nothing to press that signs the person out (the old arrow here did)', async () => {
    renderApp()
    await title()
    expect(screen.queryByRole('button', { name: /back|sign out/i })).toBeNull()
    expect(auth.signOut).not.toHaveBeenCalled()
  })
})

describe('the username field (Phase 11c)', () => {
  /** A person with no username yet: what a brand-new person sees. */
  const noUsername = () => profile({ username: null })
  /** The colour MUI drew for an element, without spaces. */
  const colourOf = (element: Element) => getComputedStyle(element).color.replace(/\s/g, '')
  const MUTED = 'rgb(141,147,160)' // tokens.color.textSecondary (#8D93A0), the design's --mu
  const GREEN = 'rgb(61,190,139)' // tokens.color.success (#3DBE8B), the design's --ok
  const RED = 'rgb(240,112,122)' // tokens.color.error (#F0707A), the design's --er
  const typeUsername = async (user: ReturnType<typeof userEvent.setup>, value: string) => {
    await user.click(usernameBox())
    await user.keyboard(value)
  }

  it('comes first: Username, then First name, Last name and Date of birth, in that order', async () => {
    useFakeDatabase(noUsername())
    renderApp()
    await title()
    const order = [usernameBox(), first(), last(), birthday()]
    for (let i = 1; i < order.length; i += 1) {
      expect(Boolean(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
    }
  })

  it('has the label "Username", an "@" inside the field, and the design’s input settings', async () => {
    useFakeDatabase(noUsername())
    renderApp()
    await title()
    const box = usernameBox()
    expect(document.querySelector('label[for="onboarding-username"]')?.textContent).toBe('Username')
    expect(box.placeholder).toBe('jay_shows_up')
    expect(box.maxLength).toBe(20)
    expect(box.getAttribute('autocapitalize')).toBe('none')
    expect(box.getAttribute('autocomplete')).toBe('username')
    expect(box.getAttribute('spellcheck')).toBe('false')
    expect(box.getAttribute('enterkeyhint')).toBe('next')
    // The "@" sits in the same wrapper as the field, before it, and screen readers skip it.
    const at = box.parentElement!.firstElementChild as HTMLElement
    expect(at.textContent).toBe('@')
    expect(at.getAttribute('aria-hidden')).toBe('true')
    expect(getComputedStyle(at).position).toBe('absolute')
    expect(getComputedStyle(box).paddingLeft).toBe('34px') // the text starts after the "@"
  })

  it('a new person sees the default hint in the muted colour, and Continue is off', async () => {
    useFakeDatabase(noUsername())
    renderApp()
    await title()
    expect(usernameBox().value).toBe('')
    expect(usernameHint().textContent).toBe('Friends find you with this. 3–20 letters, numbers or underscores.')
    expect(colourOf(usernameHint())).toBe(MUTED)
    expect(usernameHint().getAttribute('aria-live')).toBe('polite')
    expect(usernameBox().getAttribute('aria-describedby')).toBe('onboarding-username-hint')
    expect(continueButton().disabled).toBe(true)
  })

  it('cleans what is typed on every keystroke: lowercase, only a-z, 0-9 and _', async () => {
    useFakeDatabase(noUsername())
    const user = userEvent.setup()
    renderApp()
    await title()
    await typeUsername(user, 'Jay Mehta!')
    expect(usernameBox().value).toBe('jaymehta')
  })

  it('a rule that fails shows at once in red, with a red border, and asks the database nothing', async () => {
    useFakeDatabase(noUsername())
    const user = userEvent.setup()
    renderApp()
    await title()
    await typeUsername(user, 'ab')
    expect(usernameHint().textContent).toBe('Use at least 3 characters')
    expect(colourOf(usernameHint())).toBe(RED)
    expect(usernameBox().getAttribute('aria-invalid')).toBe('true')
    // Checked with the cursor ELSEWHERE: the focus style also turns the border red, so checking while focused would
    // pass even if a field the person has left showed no red border.
    first().focus()
    expect(document.activeElement).not.toBe(usernameBox())
    expect(getComputedStyle(usernameBox()).borderColor.replace(/\s/g, '')).toBe(RED)
    await user.clear(usernameBox())
    await typeUsername(user, '1abc')
    expect(usernameHint().textContent).toBe('Start with a letter, then use letters, numbers or underscores')
    await new Promise((resolve) => setTimeout(resolve, 700))
    expect(usernames.checkUsername).not.toHaveBeenCalled()
  })

  it('shows "Checking @v…", then a free name in green with the ✓, and Continue turns on once the first name is in', async () => {
    useFakeDatabase(noUsername())
    const user = userEvent.setup()
    renderApp()
    await title()
    await typeUsername(user, 'asha_rao')
    expect(usernameHint().textContent).toBe('Checking @asha_rao…')
    expect(await screen.findByText('✓ @asha_rao is available', {}, { timeout: 3000 })).toBeTruthy()
    expect(colourOf(usernameHint())).toBe(GREEN)
    expect(usernameBox().getAttribute('aria-invalid')).toBe('false')
    expect(continueButton().disabled).toBe(true) // the first name is still empty
    await user.type(first(), 'Asha')
    expect(continueButton().disabled).toBe(false)
  })

  it('Continue stays off with a first name while the username is still being checked, or is taken', async () => {
    useFakeDatabase(noUsername())
    usernames.checkUsername.mockResolvedValue({ status: 'ok', check: { username: 'jay', available: false, reason: 'taken', suggestion: 'jay_22' } })
    const user = userEvent.setup()
    renderApp()
    await title()
    await user.type(first(), 'Asha')
    expect(continueButton().disabled).toBe(true) // no username
    await typeUsername(user, 'jay')
    expect(continueButton().disabled).toBe(true) // still checking
    expect(await screen.findByText('@jay is taken. Try @jay_22', {}, { timeout: 3000 })).toBeTruthy()
    expect(colourOf(usernameHint())).toBe(RED)
    expect(continueButton().disabled).toBe(true) // taken
  })

  it('a failed check says "Couldn’t check right now" and keeps Continue off', async () => {
    useFakeDatabase(noUsername())
    usernames.checkUsername.mockResolvedValue({ status: 'error' })
    const user = userEvent.setup()
    renderApp()
    await title()
    await user.type(first(), 'Asha')
    await typeUsername(user, 'asha_rao')
    expect(await screen.findByText('Couldn’t check right now', {}, { timeout: 3000 })).toBeTruthy()
    expect(continueButton().disabled).toBe(true)
  })

  it('Enter in Username moves to First name and does not submit', async () => {
    useFakeDatabase(noUsername())
    const user = userEvent.setup()
    renderApp()
    await title()
    await typeUsername(user, 'asha_rao{Enter}')
    expect(document.activeElement).toBe(first())
    expect(usernames.saveUsername).not.toHaveBeenCalled()
    expect(db.updateProfile).not.toHaveBeenCalled()
  })

  it('Continue saves the username FIRST, then the names and birthday, then moves on to step 2', async () => {
    useFakeDatabase(noUsername())
    const user = userEvent.setup()
    renderApp()
    await title()
    await typeUsername(user, 'asha_rao')
    await screen.findByText('✓ @asha_rao is available', {}, { timeout: 3000 })
    await user.type(first(), 'Asha')
    await user.click(continueButton())
    expect(usernames.saveUsername).toHaveBeenCalledWith('asha_rao')
    expect(db.updateProfile).toHaveBeenCalledWith('user-1', { firstName: 'Asha', lastName: null, dateOfBirth: null })
    expect(usernames.saveUsername.mock.invocationCallOrder[0]).toBeLessThan(db.updateProfile.mock.invocationCallOrder[0])
    expect(await screen.findByRole('heading', { name: 'Where do you work out?' }, { timeout: 4000 })).toBeTruthy()
  })

  it('a username refused as taken: the message under the field, the suggestion when the fresh check has one, nothing else saved, and the screen stays', async () => {
    useFakeDatabase(noUsername())
    const user = userEvent.setup()
    renderApp()
    await title()
    await typeUsername(user, 'asha_rao')
    await screen.findByText('✓ @asha_rao is available', {}, { timeout: 3000 })
    await user.type(first(), 'Asha')

    // Someone took it between the check and the press.
    usernames.saveUsername.mockResolvedValue({ status: 'error', message: '@asha_rao is taken', taken: true })
    usernames.checkUsername.mockResolvedValue({ status: 'ok', check: { username: 'asha_rao', available: false, reason: 'taken', suggestion: 'asha_rao_22' } })
    await user.click(continueButton())

    expect(await screen.findByText('@asha_rao is taken. Try @asha_rao_22', {}, { timeout: 3000 })).toBeTruthy()
    expect(colourOf(usernameHint())).toBe(RED)
    expect(db.updateProfile).not.toHaveBeenCalled() // nothing else saved
    expect(await title()).toBeTruthy() // still on this screen
    expect(continueButton().disabled).toBe(true)
    expect(first().value).toBe('Asha') // what was typed is kept
  })

  it('a username refused for the cooldown: its message under the field, and nothing else saved', async () => {
    useFakeDatabase(noUsername())
    usernames.saveUsername.mockResolvedValue({ status: 'error', message: 'You can change your username again in 12 day(s).', taken: false })
    const user = userEvent.setup()
    renderApp()
    await title()
    await typeUsername(user, 'asha_rao')
    await screen.findByText('✓ @asha_rao is available', {}, { timeout: 3000 })
    await user.type(first(), 'Asha')
    await user.click(continueButton())
    expect(await screen.findByText('You can change your username again in 12 day(s).')).toBeTruthy()
    expect(colourOf(usernameHint())).toBe(RED)
    expect(db.updateProfile).not.toHaveBeenCalled()
    expect(usernames.checkUsername).toHaveBeenCalledTimes(1) // not taken, so no new check is asked for
  })

  it('editing the username after a refusal clears it and checks the new name', async () => {
    useFakeDatabase(noUsername())
    usernames.saveUsername.mockResolvedValueOnce({ status: 'error', message: 'Something went wrong. Try again.', taken: false })
    const user = userEvent.setup()
    renderApp()
    await title()
    await typeUsername(user, 'asha_rao')
    await screen.findByText('✓ @asha_rao is available', {}, { timeout: 3000 })
    await user.type(first(), 'Asha')
    await user.click(continueButton())
    expect(await screen.findByText('Something went wrong. Try again.')).toBeTruthy()

    await typeUsername(user, '1')
    expect(screen.queryByText('Something went wrong. Try again.')).toBeNull()
    expect(await screen.findByText('✓ @asha_rao1 is available', {}, { timeout: 3000 })).toBeTruthy()
  })

  it('shows the shared loader and "Saving…" on the button while saving, and refuses a second press', async () => {
    useFakeDatabase(noUsername())
    let finish!: (value: unknown) => void
    usernames.saveUsername.mockImplementation(() => new Promise((resolve) => (finish = resolve)))
    const user = userEvent.setup()
    renderApp()
    await title()
    await typeUsername(user, 'asha_rao')
    await screen.findByText('✓ @asha_rao is available', {}, { timeout: 3000 })
    await user.type(first(), 'Asha')
    await user.click(continueButton())

    const button = screen.getByRole('button', { name: /saving/i }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(button.getAttribute('aria-busy')).toBe('true')
    expect(button.querySelector('[aria-hidden="true"] svg, svg')).toBeTruthy() // the loader
    expect(usernameBox().disabled).toBe(true)
    fireEvent.click(button) // a disabled button cannot be pressed with the pointer; even a forced click does nothing
    fireEvent.submit(button.closest('form')!) // and a second submit while saving is ignored
    expect(usernames.saveUsername).toHaveBeenCalledTimes(1)

    await act(async () => finish({ status: 'saved', username: 'asha_rao', changed: true }))
    expect(await screen.findByRole('heading', { name: 'Where do you work out?' }, { timeout: 4000 })).toBeTruthy()
  })

  it('a mistake in the names is shown before anything is saved, the username included', async () => {
    useFakeDatabase(noUsername())
    const user = userEvent.setup()
    renderApp()
    await title()
    await typeUsername(user, 'asha_rao')
    await screen.findByText('✓ @asha_rao is available', {}, { timeout: 3000 })
    await user.type(first(), 'Asha1')
    await user.click(continueButton())
    expect((await screen.findAllByRole('alert')).some((node) => node.textContent === 'Special characters are not allowed.')).toBe(true)
    expect(usernames.saveUsername).not.toHaveBeenCalled()
    expect(db.updateProfile).not.toHaveBeenCalled()
  })

  it('a person resuming with a username: it is filled in, says "This is your username" in green, and asks nothing', async () => {
    useFakeDatabase(profile({ username: 'asha_rao', firstName: null }))
    const user = userEvent.setup()
    renderApp()
    await title()
    expect(usernameBox().value).toBe('asha_rao')
    expect(usernameHint().textContent).toBe('This is your username')
    expect(colourOf(usernameHint())).toBe(GREEN)
    await user.type(first(), 'Asha')
    expect(continueButton().disabled).toBe(false) // no retyping needed
    await new Promise((resolve) => setTimeout(resolve, 700))
    expect(usernames.checkUsername).not.toHaveBeenCalled()
  })

  it('a person resuming with a username can still change it: a different name is checked as usual', async () => {
    useFakeDatabase(profile({ username: 'asha_rao' }))
    const user = userEvent.setup()
    renderApp()
    await title()
    await typeUsername(user, '2') // asha_rao2
    expect(usernameHint().textContent).toBe('Checking @asha_rao2…')
    expect(await screen.findByText('✓ @asha_rao2 is available', {}, { timeout: 3000 })).toBeTruthy()
  })
})


describe('the fields', () => {
  it('first name: given-name, words capitalised, Next on the keyboard', async () => {
    renderApp()
    await title()
    expect(first().getAttribute('autocomplete')).toBe('given-name')
    expect(first().getAttribute('autocapitalize')).toBe('words')
    expect(first().getAttribute('enterkeyhint')).toBe('next')
    expect(first().placeholder).toBe('Jay')
  })

  it('last name: family-name, words capitalised, Next on the keyboard', async () => {
    renderApp()
    await title()
    expect(last().getAttribute('autocomplete')).toBe('family-name')
    expect(last().getAttribute('autocapitalize')).toBe('words')
    expect(last().getAttribute('enterkeyhint')).toBe('next')
    expect(last().placeholder).toBe('Mehta')
  })

  it('date of birth: an "Optional" tag in the label, the help text, and a birthday autofill hint', async () => {
    renderApp()
    await title()
    const label = screen.getByText('Date of birth').closest('label')!
    expect(within(label).getByText('Optional')).toBeTruthy()
    expect(screen.getByText('You can add this later.')).toBeTruthy()
    expect(birthday().type).toBe('date')
    expect(birthday().getAttribute('autocomplete')).toBe('bday')
    expect(birthday().getAttribute('aria-describedby')).toBe('onboarding-birthday-help')
  })

  it('the latest date you can pick keeps the app\'s own rule, 15 years before today (not the design\'s 13)', async () => {
    renderApp()
    await title()
    expect(birthday().max).toBe(latestBirthDate(new Date()))
    const year = new Date().getFullYear()
    expect(Number(birthday().max.slice(0, 4))).toBe(year - 15)
  })

  it('fills in a name Google already gave (here only the last name, so the screen is still needed)', async () => {
    useFakeDatabase(profile({ firstName: null, lastName: 'Rao' }))
    renderApp()
    await title()
    expect(first().value).toBe('')
    expect(last().value).toBe('Rao')
  })
})

describe('the 25-character limit on the names', () => {
  it('stops typing a first name at 25 characters', async () => {
    const user = userEvent.setup()
    renderApp()
    await title()
    await user.type(first(), 'a'.repeat(40))
    expect(first().value).toBe('a'.repeat(25))
  })

  it('stops typing a last name at 25 characters', async () => {
    const user = userEvent.setup()
    renderApp()
    await title()
    await user.type(last(), 'b'.repeat(40))
    expect(last().value).toBe('b'.repeat(25))
  })

  it('lets exactly 25 characters in, with the spaces counted', async () => {
    const user = userEvent.setup()
    renderApp()
    await title()
    const name = `${'x'.repeat(12)} ${'y'.repeat(12)}` // 12 + space + 12 = 25
    await user.type(first(), name)
    expect(first().value).toBe(name)
    await user.type(first(), 'z')
    expect(first().value).toBe(name) // the 26th character is refused
  })

  it('cuts a long paste to 25 characters', async () => {
    const user = userEvent.setup()
    renderApp()
    await title()
    await user.click(first())
    await user.paste('p'.repeat(80))
    expect(first().value).toBe('p'.repeat(25))
  })

  it('does not stop a Hindi name at half: 25 letters with vowel signs fit (50 code points)', async () => {
    const user = userEvent.setup()
    renderApp()
    await title()
    await user.click(first())
    await user.paste('कि'.repeat(25))
    expect(first().value).toBe('कि'.repeat(25))
    await user.paste('कि')
    expect(first().value).toBe('कि'.repeat(25)) // the 26th is refused
  })

  it('refuses a 26th character typed in the middle without pushing the end out', async () => {
    const user = userEvent.setup()
    renderApp()
    await title()
    await user.type(first(), 'a'.repeat(24) + 'Z')
    await user.type(first(), 'q', { initialSelectionStart: 3, initialSelectionEnd: 3 })
    expect(first().value).toBe('a'.repeat(24) + 'Z')
  })

  it('does not change the other name field or what Continue allows', async () => {
    const user = userEvent.setup()
    renderApp()
    await title()
    await user.type(first(), 'a'.repeat(40))
    expect(last().value).toBe('')
    expect((screen.getByRole('button', { name: /continue/i }) as HTMLButtonElement).disabled).toBe(false) // the last name is optional
  })
})

describe('the last name is optional', () => {
  it('has an "Optional" tag in its label, like the date of birth, and the first name has none', async () => {
    renderApp()
    await title()
    const labelOf = (field: HTMLElement) => document.querySelector(`label[for="${field.id}"]`) as HTMLElement
    expect(labelOf(last()).textContent).toBe('Last nameOptional')
    expect(labelOf(birthday()).textContent).toContain('Optional')
    expect(labelOf(first()).textContent).toBe('First name')
  })

  it('is not marked as required for the browser or a screen reader', async () => {
    renderApp()
    await title()
    expect(last().required).toBe(false)
    expect(first().required).toBe(true)
  })

  it('Continue works with a first name alone, and saves the last name as null (the database refuses an empty string)', async () => {
    const user = userEvent.setup()
    renderApp()
    await title()
    await user.type(first(), 'Asha')
    expect(continueButton().disabled).toBe(false)
    await user.click(continueButton())
    expect(db.updateProfile).toHaveBeenCalledTimes(1)
    expect(db.updateProfile).toHaveBeenCalledWith('user-1', { firstName: 'Asha', lastName: null, dateOfBirth: null })
  })

  it('a last name of spaces is saved as null too', async () => {
    const user = userEvent.setup()
    renderApp()
    await title()
    await user.type(first(), 'Asha')
    await user.type(last(), '   ')
    await user.click(continueButton())
    expect(db.updateProfile).toHaveBeenCalledWith('user-1', { firstName: 'Asha', lastName: null, dateOfBirth: null })
  })

  it('leaving the empty last name shows no message and no red border', async () => {
    const user = userEvent.setup()
    renderApp()
    await title()
    await user.click(last())
    await user.tab()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(last().getAttribute('aria-invalid')).toBe('false')
  })

  it('a person with a first name and no last name is not sent back to this screen', async () => {
    useFakeDatabase(profile({ firstName: 'Asha', lastName: null }))
    renderApp()
    // This file's fake already has a saved gym, so a complete profile goes straight to Home.
    expect(await screen.findByRole('button', { name: /show up/i })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'What should we call you?' })).toBeNull()
  })
})

describe('special characters in the names', () => {
  const MESSAGE = 'Special characters are not allowed.'

  it('shows the simple message at once when a digit is typed in the first name, with a red border and role alert', async () => {
    const user = userEvent.setup()
    renderApp()
    await title()
    await user.type(first(), 'Asha1')
    const message = await screen.findByRole('alert')
    expect(message.textContent).toBe(MESSAGE)
    expect(first().getAttribute('aria-invalid')).toBe('true')
    expect(first().getAttribute('aria-describedby')).toBe(message.id)
    expect(getComputedStyle(first()).borderColor.replace(/\s/g, '')).toBe('rgb(240,112,122)')
  })

  it('shows it for the last name too, and only under the last name', async () => {
    const user = userEvent.setup()
    renderApp()
    await title()
    await user.type(first(), 'Asha')
    await user.type(last(), 'Rao!')
    expect((await screen.findByRole('alert')).textContent).toBe(MESSAGE)
    expect(last().getAttribute('aria-invalid')).toBe('true')
    expect(first().getAttribute('aria-invalid')).toBe('false')
  })

  it('shows it for an emoji, for a symbol and for a decorative letter', async () => {
    const user = userEvent.setup()
    renderApp()
    await title()
    for (const bad of [String.fromCodePoint(0x1f600), '★', '@', String.fromCodePoint(0x1d4d0)]) {
      await user.clear(first())
      await user.click(first())
      await user.paste(`Asha${bad}`)
      expect((await screen.findByRole('alert')).textContent).toBe(MESSAGE)
    }
  })

  it('clears the message as soon as the bad character is deleted', async () => {
    const user = userEvent.setup()
    renderApp()
    await title()
    await user.type(first(), 'Asha1')
    expect((await screen.findByRole('alert')).textContent).toBe(MESSAGE)
    await user.type(first(), '{Backspace}')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(first().getAttribute('aria-invalid')).toBe('false')
  })

  it('does not save a name with a special character, and does not call the database', async () => {
    const user = userEvent.setup()
    renderApp()
    await title()
    await user.type(first(), 'Asha1')
    await user.type(last(), 'Rao')
    await user.click(continueButton())
    expect(db.updateProfile).not.toHaveBeenCalled()
    expect((await screen.findByRole('alert')).textContent).toBe(MESSAGE)
  })

  it('does not stop a real name: an apostrophe, a hyphen, spaces, accents and a Hindi name all save', async () => {
    const user = userEvent.setup()
    renderApp()
    await title()
    await user.type(first(), "Mary-Jane O'Brien")
    await user.click(last())
    await user.paste('श्रीनिवासन्')
    expect(screen.queryByRole('alert')).toBeNull()
    await user.click(continueButton())
    expect(db.updateProfile).toHaveBeenCalledWith('user-1', {
      firstName: "Mary-Jane O'Brien",
      lastName: 'श्रीनिवासन्',
      dateOfBirth: null,
    })
  })
})

describe('checking the names', () => {
  it('on leaving an empty first name: a red border, the message, and role alert', async () => {
    const user = userEvent.setup()
    renderApp()
    await title()
    await user.click(first())
    await user.tab()

    const message = await screen.findByRole('alert')
    expect(message.textContent).toBe('Enter your first name')
    expect(first().getAttribute('aria-invalid')).toBe('true')
    expect(getComputedStyle(first()).borderColor.replace(/\s/g, '')).toBe('rgb(240,112,122)')
    expect(first().getAttribute('aria-describedby')).toBe(message.id)
  })

  it('a name of spaces counts as empty', async () => {
    const user = userEvent.setup()
    renderApp()
    await title()
    await user.type(first(), '   ')
    await user.tab()
    expect((await screen.findByRole('alert')).textContent).toBe('Enter your first name')
  })

  it('typing clears the message and the red border', async () => {
    const user = userEvent.setup()
    renderApp()
    await title()
    await user.click(first())
    await user.tab()
    expect((await screen.findByRole('alert')).textContent).toBe('Enter your first name')

    // Typing in First name puts focus back there, which leaves the (still empty) Last name, so its own
    // message is allowed. What matters is that First name's message and red border are gone.
    await user.type(first(), 'A')
    expect(screen.queryByText('Enter your first name')).toBeNull()
    expect(first().getAttribute('aria-invalid')).toBe('false')
    expect(getComputedStyle(first()).borderColor.replace(/\s/g, '')).not.toBe('rgb(240,112,122)')
  })

  it('shows no message and no alert on a fresh screen, or after leaving a filled field', async () => {
    const user = userEvent.setup()
    renderApp()
    await title()
    expect(screen.queryByRole('alert')).toBeNull()
    await user.type(first(), 'Asha')
    await user.tab()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('a message under each name can show at once', async () => {
    const user = userEvent.setup()
    renderApp()
    await title()
    await user.click(first())
    await user.tab() // leaves the empty first name
    await user.type(last(), 'Rao1')
    expect((await screen.findAllByRole('alert')).map((node) => node.textContent)).toEqual(['Enter your first name', 'Special characters are not allowed.'])
  })
})

describe('Enter moves on', () => {
  it('Enter in First name moves to Last name and does not submit', async () => {
    const user = userEvent.setup()
    renderApp()
    await title()
    await user.type(first(), 'Asha')
    await user.type(last(), 'Rao')
    first().focus()
    await user.keyboard('{Enter}')
    expect(document.activeElement).toBe(last())
    expect(db.updateProfile).not.toHaveBeenCalled()
  })

  it('Enter in Last name moves to Date of birth and does not submit', async () => {
    const user = userEvent.setup()
    renderApp()
    await title()
    await user.type(first(), 'Asha')
    await user.type(last(), 'Rao{Enter}')
    expect(document.activeElement).toBe(birthday())
    expect(db.updateProfile).not.toHaveBeenCalled()
  })

  it('Enter while the keyboard is composing text (an IME) does nothing special', async () => {
    renderApp()
    await title()
    first().focus()
    fireEvent.keyDown(first(), { key: 'Enter', isComposing: true })
    expect(document.activeElement).toBe(first())
  })
})

describe('Continue', () => {
  it('is off until the first name has text, and then saves exactly as before', async () => {
    const user = userEvent.setup()
    renderApp()
    await title()

    expect(continueButton().disabled).toBe(true)
    await user.type(last(), 'Rao')
    expect(continueButton().disabled).toBe(true) // a last name alone is not enough
    await user.type(first(), 'Asha')
    expect(continueButton().disabled).toBe(false)

    await user.type(birthday(), '1990-05-17')
    await user.click(continueButton())
    expect(db.updateProfile).toHaveBeenCalledTimes(1)
    expect(db.updateProfile).toHaveBeenCalledWith('user-1', { firstName: 'Asha', lastName: 'Rao', dateOfBirth: '1990-05-17' })
  })

  it('goes off again if the first name is cleared, but not if the last name is', async () => {
    const user = userEvent.setup()
    renderApp()
    await title()
    await user.type(first(), 'Asha')
    await user.type(last(), 'Rao')
    expect(continueButton().disabled).toBe(false)
    await user.clear(last())
    expect(continueButton().disabled).toBe(false)
    await user.clear(first())
    expect(continueButton().disabled).toBe(true)
  })

  it('is 54px tall and pushed to the bottom of the screen', async () => {
    renderApp()
    await title()
    const css = Array.from(document.querySelectorAll('style')).map((style) => style.textContent ?? '').join('\n')
    const button = continueButton()
    const own = Array.from(button.classList).filter((name) => name.startsWith('css-'))
    const rule = own.map((name) => css.match(new RegExp(`\\.${name}\\{[^}]*\\}`))?.[0] ?? '').join(' ')
    expect(rule).toContain('margin-top:auto')
    expect(rule).toContain('min-height:54px')
  })

  it('a form submitted some other way with empty names does nothing: no save and no second wording of the message', async () => {
    renderApp()
    await title()
    fireEvent.submit(first().closest('form')!)
    expect(db.updateProfile).not.toHaveBeenCalled()
    expect(screen.queryByText(/Enter your first name/)).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('still refuses a birthday under the app\'s 15-year limit, using the shared validation, and does not save', async () => {
    const user = userEvent.setup()
    renderApp()
    await title()
    await user.type(first(), 'Asha')
    await user.type(last(), 'Rao')
    fireEvent.change(birthday(), { target: { value: '2999-01-01' } })
    await user.click(continueButton())
    expect(await screen.findByText(/Birthday must be at least 15 years ago/)).toBeTruthy()
    expect(db.updateProfile).not.toHaveBeenCalled()
    expect(birthday().getAttribute('aria-invalid')).toBe('true')
  })

  it('shows the error from a failed save, keeps what was typed, and Try again succeeds', async () => {
    db.updateProfile.mockResolvedValueOnce({ status: 'error', message: "We couldn't save your changes. Please try again." })
    const user = userEvent.setup()
    renderApp()
    await title()
    await user.type(first(), 'Asha')
    await user.type(last(), 'Rao')
    await user.click(continueButton())

    expect((await screen.findByRole('alert')).textContent).toContain("We couldn't save your changes")
    expect(first().value).toBe('Asha')
    expect(last().value).toBe('Rao')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    // Saved this time: on to step 2, the gym.
    expect(await screen.findByRole('heading', { name: 'Where do you work out?' })).toBeTruthy()
  })

  it('ignores a second press while saving', async () => {
    let finish!: (value: unknown) => void
    db.updateProfile.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
    const user = userEvent.setup()
    renderApp()
    await title()
    await user.type(first(), 'Asha')
    await user.type(last(), 'Rao')
    await user.click(continueButton())
    const saving = (await screen.findByRole('button', { name: 'Saving…' })) as HTMLButtonElement
    expect(saving.disabled).toBe(true)
    finish({ status: 'saved', profile: profile({ firstName: 'Asha', lastName: 'Rao' }) })
    await screen.findByRole('heading', { name: 'Where do you work out?' })
    expect(db.updateProfile).toHaveBeenCalledTimes(1)
  })
})

describe('the step routing is unchanged', () => {
  it('a person whose names are saved never sees this screen', async () => {
    useFakeDatabase(profile({ firstName: 'Asha', lastName: 'Rao' }))
    renderApp()
    expect(await screen.findByRole('button', { name: /show up/i })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'What should we call you?' })).toBeNull()
  })

  it('a person with no first name still sees it, even if they have a last name', async () => {
    useFakeDatabase(profile({ firstName: null, lastName: 'Rao' }))
    renderApp()
    expect(await title()).toBeTruthy()
  })

  it('a person with a first name and no last name does not see it (the last name is optional)', async () => {
    useFakeDatabase(profile({ firstName: 'Asha', lastName: null }))
    renderApp()
    expect(await screen.findByRole('button', { name: /show up/i })).toBeTruthy() // this file's fake already has a gym: Home
    expect(screen.queryByRole('heading', { name: 'What should we call you?' })).toBeNull()
  })
})

describe('OnboardingStepHeader and progressPercent', () => {
  it('progress is 33, 66 and 100 for 1, 2 and 3 of 3, and never outside 0 to 100', () => {
    expect([1, 2, 3].map((step) => progressPercent(step, 3))).toEqual([33, 66, 100])
    expect(ONBOARDING_STEP_COUNT).toBe(3)
    expect(progressPercent(0, 3)).toBe(0)
    expect(progressPercent(9, 3)).toBe(100)
    expect(progressPercent(-1, 3)).toBe(0)
    expect(progressPercent(1, 0)).toBe(0)
  })

  it('draws "n of total", the matching bar, and calls onBack', async () => {
    const onBack = vi.fn()
    render(
      <ThemeProvider theme={theme}>
        <OnboardingStepHeader step={2} onBack={onBack} />
      </ThemeProvider>,
    )
    expect(screen.getByText('2 of 3')).toBeTruthy()
    expect(screen.getByTestId('step-progress').style.width || getComputedStyle(screen.getByTestId('step-progress')).width).toBe('66%')
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('hides the bar from screen readers, since the words say the same', () => {
    render(
      <ThemeProvider theme={theme}>
        <OnboardingStepHeader step={1} onBack={() => {}} />
      </ThemeProvider>,
    )
    expect(screen.getByTestId('step-progress').parentElement!.getAttribute('aria-hidden')).toBe('true')
  })
})

describe('layout: the progress bar and the date field (found on a phone)', () => {
  const css = () => Array.from(document.querySelectorAll('style')).map((style) => style.textContent ?? '').join('\n')
  const rulesOf = (node: HTMLElement) =>
    Array.from(node.classList).filter((n) => n.startsWith('css-')).map((n) => css().match(new RegExp(`\\.${n}\\{[^}]*\\}`))?.[0] ?? '').join(' ')

  it('step 1 keeps no room for a back arrow, so the progress bar starts at the left edge of the content', async () => {
    renderApp()
    await title()
    const bar = screen.getByTestId('step-progress').parentElement as HTMLElement
    const row = bar.parentElement as HTMLElement
    // The row holds only the bar and the count: nothing before the bar, not even an empty placeholder.
    expect(Array.from(row.children).map((child) => child === bar || child.textContent === '1 of 3')).toEqual([true, true])
    expect(bar.previousElementSibling).toBeNull()
  })

  it('on the later steps, a missing arrow still keeps its room (the bar does not jump while a save is on its way)', () => {
    const { container, rerender } = render(
      <ThemeProvider theme={theme}>
        <OnboardingStepHeader step={2} onBack={() => {}} />
      </ThemeProvider>,
    )
    const barLeftSibling = () => (container.querySelector('[data-testid="step-progress"]')!.parentElement as HTMLElement).previousElementSibling as HTMLElement
    expect(barLeftSibling().tagName).toBe('BUTTON') // the arrow
    rerender(
      <ThemeProvider theme={theme}>
        <OnboardingStepHeader step={2} />
      </ThemeProvider>,
    )
    // Arrow gone for a moment: an empty 44px placeholder takes its place.
    expect(barLeftSibling().tagName).toBe('DIV')
    expect(rulesOf(barLeftSibling())).toContain('width:44px')
  })

  it('the date field is built so a phone cannot make it wider than the other fields', async () => {
    renderApp()
    await title()
    const rule = rulesOf(birthday()).replace(/\s+/g, '')
    expect(rule).toMatch(/(^|[;{])appearance:none/)
    expect(rule).toContain('-webkit-appearance:none')
    expect(rule).toContain('min-width:0')
    expect(rule).toContain('max-width:100%')
    expect(rule).toContain('width:100%')
    expect(rule).toContain('display:block')
    expect(rule).toContain('min-height:54px')
  })

  it('the name fields do not get those date-only rules', async () => {
    renderApp()
    await title()
    expect(rulesOf(first()).replace(/\s+/g, '')).not.toContain('appearance:none')
    expect(rulesOf(last()).replace(/\s+/g, '')).not.toContain('appearance:none')
  })

  it('the date field is still a date field with the app\'s 15-year limit', async () => {
    renderApp()
    await title()
    expect(birthday().type).toBe('date')
    expect(birthday().max).toBe(latestBirthDate(new Date()))
  })
})
