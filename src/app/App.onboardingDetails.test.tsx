// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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
    createdAt: '2026-10-17T10:00:00Z',
    updatedAt: '2026-10-17T10:00:00Z',
    ...overrides,
  }
}

function useFakeDatabase(initial: Profile) {
  let stored = initial
  db.fetchProfile.mockImplementation(async () => ({ status: 'found', profile: stored }))
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
const first = () => screen.getByLabelText('First name') as HTMLInputElement
const last = () => screen.getByLabelText('Last name') as HTMLInputElement
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

  it('fills in names Google already gave', async () => {
    useFakeDatabase(profile({ firstName: 'Asha' }))
    renderApp()
    await title()
    expect(first().value).toBe('Asha')
    expect(last().value).toBe('')
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

  it('on leaving an empty last name: the message "Enter your last name"', async () => {
    const user = userEvent.setup()
    renderApp()
    await title()
    await user.click(last())
    await user.tab()
    expect((await screen.findByRole('alert')).textContent).toBe('Enter your last name')
    expect(last().getAttribute('aria-invalid')).toBe('true')
    expect(first().getAttribute('aria-invalid')).toBe('false') // only the field that was left
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

  it('both messages can show at once', async () => {
    const user = userEvent.setup()
    renderApp()
    await title()
    await user.click(first())
    await user.tab()
    await user.tab()
    expect((await screen.findAllByRole('alert')).map((node) => node.textContent)).toEqual(['Enter your first name', 'Enter your last name'])
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
  it('is off until both names have text, and then saves exactly as before', async () => {
    const user = userEvent.setup()
    renderApp()
    await title()

    expect(continueButton().disabled).toBe(true)
    await user.type(first(), 'Asha')
    expect(continueButton().disabled).toBe(true)
    await user.type(last(), 'Rao')
    expect(continueButton().disabled).toBe(false)

    await user.type(birthday(), '1990-05-17')
    await user.click(continueButton())
    expect(db.updateProfile).toHaveBeenCalledTimes(1)
    expect(db.updateProfile).toHaveBeenCalledWith('user-1', { firstName: 'Asha', lastName: 'Rao', dateOfBirth: '1990-05-17' })
  })

  it('goes off again if a name is cleared', async () => {
    const user = userEvent.setup()
    renderApp()
    await title()
    await user.type(first(), 'Asha')
    await user.type(last(), 'Rao')
    expect(continueButton().disabled).toBe(false)
    await user.clear(last())
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

  it('a person with only one name still sees it', async () => {
    useFakeDatabase(profile({ firstName: 'Asha' }))
    renderApp()
    expect(await title()).toBeTruthy()
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
