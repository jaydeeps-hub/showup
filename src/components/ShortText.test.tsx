// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { theme } from '../app/theme'
import type { Profile } from '../types'

/**
 * The 25-character rule for text a person typed: first and last name wherever they are shown. Typing is not limited
 * (the database allows 100), only what is displayed is cut. The REAL Profile screen is used; only its goal data is faked.
 */

vi.mock('../hooks/useGoalState', () => ({
  useGoalState: () => ({ status: 'ready', goal: { hasGoal: true, currentGoal: 3, pendingGoal: null }, save: vi.fn(), retry: vi.fn() }),
}))
vi.mock('../hooks/useMascot', () => ({ useMascotContent: () => ({ version: 1, images: {}, messages: [] }) }))

const { ShortText } = await import('./ShortText')
const { ManageProfileScreen } = await import('../features/profile/ManageProfileScreen')

const LONG_FIRST = 'Bartholomew-Maximilian Alexander' // 32 characters
const LONG_LAST = 'Featherstonehaugh-Cholmondeley-Smythe' // 37 characters
const CUT = (text: string) => `${Array.from(text).slice(0, 25).join('').trimEnd()}...`

function profile(overrides: Partial<Profile> = {}): Profile {
  return { firstName: 'Asha', lastName: 'Rao', dateOfBirth: '1990-05-17', isAdmin: false, placeSearchMode: 'fitness_only', ...overrides } as Profile
}

function renderProfile(p: Profile) {
  return render(
    <ThemeProvider theme={theme}>
      <ManageProfileScreen profile={p} email="asha@example.com" gym={null} onSave={vi.fn()} onChangeSearchMode={vi.fn()} onChangeGym={vi.fn()} onSignOut={vi.fn()} />
    </ThemeProvider>,
  )
}

afterEach(() => cleanup())

describe('ShortText', () => {
  it('shows text of 25 characters or fewer whole, with nothing extra for a screen reader', () => {
    const { container } = render(<ShortText text="Asha" />)
    expect(container.textContent).toBe('Asha')
    expect(container.querySelectorAll('span')).toHaveLength(1)
    expect(container.querySelector('[aria-hidden]')).toBeNull()
  })

  it('cuts longer text to 25 characters plus "...", hides that from screen readers and gives them the full text once', () => {
    const { container } = render(<ShortText text={LONG_FIRST} />)
    const spans = Array.from(container.querySelectorAll('span'))
    expect(spans[0].textContent).toBe(CUT(LONG_FIRST))
    expect(spans[0].getAttribute('aria-hidden')).toBe('true')
    expect(spans.filter((s) => s.getAttribute('aria-hidden') !== 'true').map((s) => s.textContent)).toEqual([LONG_FIRST])
  })
})

describe('the Profile screen: first and last name', () => {
  it('a short name is shown whole, in the heading and in the two rows', () => {
    renderProfile(profile())
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Asha Rao')
    expect(screen.getByText('Asha', { selector: 'b span' })).toBeTruthy()
    expect(screen.getByText('Rao', { selector: 'b span' })).toBeTruthy()
    expect(screen.queryByText(/\.\.\./)).toBeNull()
  })

  it('cuts a long first name and a long last name in their rows, each by itself', () => {
    renderProfile(profile({ firstName: LONG_FIRST, lastName: LONG_LAST }))
    expect(screen.getByText(CUT(LONG_FIRST), { selector: 'b span' })).toBeTruthy()
    expect(screen.getByText(CUT(LONG_LAST), { selector: 'b span' })).toBeTruthy()
  })

  it('cuts the full name in the heading by the same rule, and keeps the whole name as its tooltip', () => {
    renderProfile(profile({ firstName: LONG_FIRST, lastName: LONG_LAST }))
    const heading = screen.getByRole('heading', { level: 1 })
    const full = `${LONG_FIRST} ${LONG_LAST}`
    expect(heading.getAttribute('title')).toBe(full)
    expect(heading.querySelector('span[aria-hidden="true"]')?.textContent).toBe(CUT(full))
    expect(Array.from(heading.querySelectorAll('span')).filter((s) => s.getAttribute('aria-hidden') !== 'true').map((s) => s.textContent)).toEqual([full])
  })

  it('a row gets a tooltip with the full text only when it was cut', () => {
    renderProfile(profile({ firstName: LONG_FIRST }))
    expect(screen.getByText(CUT(LONG_FIRST), { selector: 'b span' }).closest('b')?.getAttribute('title')).toBe(LONG_FIRST)
    expect(screen.getByText('Rao', { selector: 'b span' }).closest('b')?.hasAttribute('title')).toBe(false)
  })

  it('a name of exactly 25 characters is not cut', () => {
    const exactly = 'Abcdefghijklmnopqrstuvwxy' // 25
    renderProfile(profile({ firstName: exactly }))
    expect(screen.getByText(exactly, { selector: 'b span' })).toBeTruthy()
  })

  it('does not cut what the edit form starts with: the typing fields hold the whole saved names', () => {
    renderProfile(profile({ firstName: LONG_FIRST, lastName: LONG_LAST }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit details' }))
    expect((screen.getByLabelText('First name') as HTMLInputElement).value).toBe(LONG_FIRST)
    expect((screen.getByLabelText('Last name') as HTMLInputElement).value).toBe(LONG_LAST)
  })
})
