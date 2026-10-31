// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '@mui/material/styles'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { theme } from '../../app/theme'
import type { GoalState } from '../../types'

/**
 * The Skip button and the "Skip setting a goal?" sheet on the weekly goal screen, and the standalone mode (opened from
 * Home) that has neither. The REAL screen, picker, sheet and mascot logic are used; only the goal database calls are faked.
 */

vi.mock('../../hooks/useMascot', () => ({ useMascotContent: () => ({ version: 0, images: {}, messages: [] }) }))
const goalApi = vi.hoisted(() => ({ fetchGoalState: vi.fn(), setWeeklyGoal: vi.fn() }))
vi.mock('../../services/goalService', () => goalApi)

const { GoalScreen, GOAL_SAVED_PAUSE_MS } = await import('./GoalScreen')

const noGoal: GoalState = { hasGoal: false, currentGoal: null, pendingGoal: null, pendingFrom: null }

const onBack = vi.fn()
const onSkip = vi.fn()
const onDone = vi.fn()
const onSaved = vi.fn()

function renderOnboarding() {
  return render(
    <ThemeProvider theme={theme}>
      <GoalScreen mode="onboarding" onBack={onBack} onSkip={onSkip} onSaved={onSaved} onDone={onDone} />
    </ThemeProvider>,
  )
}
function renderStandalone() {
  return render(
    <ThemeProvider theme={theme}>
      <GoalScreen onBack={onBack} />
    </ThemeProvider>,
  )
}

const ready = () => screen.findByRole('radiogroup', { name: 'Days per week' })
const skipButton = () => screen.getByRole('button', { name: 'Skip for now' }) as HTMLButtonElement
const sheet = () => screen.queryByRole('dialog', { name: 'Skip setting a goal?' })
const setGoal = () => screen.getByRole('button', { name: 'Set goal' }) as HTMLButtonElement

beforeEach(() => {
  vi.clearAllMocks()
  goalApi.fetchGoalState.mockResolvedValue({ status: 'ok', goal: noGoal })
  goalApi.setWeeklyGoal.mockResolvedValue({ status: 'saved' })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('the Skip for now button', () => {
  it('is under Set goal in onboarding', async () => {
    renderOnboarding()
    await ready()
    expect(skipButton()).toBeTruthy()
    expect(Boolean(setGoal().compareDocumentPosition(skipButton()) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
  })

  it('is a quiet ghost button 48px tall: no fill, not the primary style', async () => {
    renderOnboarding()
    await ready()
    const css = Array.from(document.querySelectorAll('style')).map((style) => style.textContent ?? '').join('\n')
    const rule = Array.from(skipButton().classList).filter((n) => n.startsWith('css-')).map((n) => css.match(new RegExp(`\\.${n}\\{[^}]*\\}`))?.[0] ?? '').join(' ')
    expect(rule).toContain('height:48px')
    expect(skipButton().className).not.toMatch(/MuiButton-contained/)
    expect(skipButton().className).toMatch(/MuiButton-text/)
  })

  it('opens the sheet and saves nothing', async () => {
    const user = userEvent.setup()
    renderOnboarding()
    await ready()
    await user.click(skipButton())

    expect(await screen.findByRole('dialog', { name: 'Skip setting a goal?' })).toBeTruthy()
    expect(goalApi.setWeeklyGoal).not.toHaveBeenCalled()
    expect(onSkip).not.toHaveBeenCalled() // skipping is decided in the sheet, not by this button
  })

  it('is NOT on the screen when it is opened from Home', async () => {
    renderStandalone()
    await ready()
    expect(screen.queryByRole('button', { name: /skip/i })).toBeNull()
  })

  it('is off while the goal is being saved', async () => {
    let finish!: (value: unknown) => void
    goalApi.setWeeklyGoal.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
    const user = userEvent.setup()
    renderOnboarding()
    await ready()
    await user.click(setGoal())
    await screen.findByRole('button', { name: 'Saving…' })
    expect(skipButton().disabled).toBe(true)
    await act(async () => finish({ status: 'saved' }))
  })

  it('stays off after the goal is saved, while the screen waits to move on (a save and a skip must never both happen)', async () => {
    const user = userEvent.setup()
    renderOnboarding()
    await ready()
    await user.click(setGoal())
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(skipButton().disabled).toBe(true)
  })
})

describe('the sheet', () => {
  async function open(user: ReturnType<typeof userEvent.setup>) {
    renderOnboarding()
    await ready()
    await user.click(skipButton())
    return screen.findByRole('dialog', { name: 'Skip setting a goal?' })
  }

  it('has the title "Skip setting a goal?" and the encouraging words', async () => {
    const user = userEvent.setup()
    const dialog = await open(user)
    expect(within(dialog).getByRole('heading', { name: 'Skip setting a goal?' })).toBeTruthy()
    expect(
      within(dialog).getByText(
        'A weekly goal is optional, but it gives every visit a target and makes it easier to stay committed. You can set one anytime from Home.',
      ),
    ).toBeTruthy()
  })

  it('has two buttons: a primary "Set a goal" and a ghost "Skip for now"', async () => {
    const user = userEvent.setup()
    const dialog = await open(user)
    const set = within(dialog).getByRole('button', { name: 'Set a goal' })
    const skip = within(dialog).getByRole('button', { name: 'Skip for now' })
    expect(set.className).toMatch(/MuiButton-contained/)
    expect(skip.className).toMatch(/MuiButton-text/)
    expect(Boolean(set.compareDocumentPosition(skip) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true) // the encouraged one first
  })

  it('is a bottom sheet: the full width, rounded at the top only, on the surface colour, with a top line', async () => {
    const user = userEvent.setup()
    const dialog = await open(user)
    const paper = dialog // the element with the dialog role is the sheet itself
    const css = Array.from(document.querySelectorAll('style')).map((style) => style.textContent ?? '').join('\n')
    const rule = Array.from(paper.classList).filter((n) => n.startsWith('css-')).map((n) => css.match(new RegExp(`\\.${n}\\{[^}]*\\}`))?.[0] ?? '').join(' ').toLowerCase()
    expect(rule).toContain('bottom:0')
    expect(rule).toContain('width:100%')
    expect(rule).toContain('border-radius:24px 24px 0 0')
    expect(rule).toContain('background-color:#0e1522')
    expect(rule).toMatch(/border-top:1px solid #232d42/)
    expect(rule).toContain('padding:24px 24px calc(32px + env(safe-area-inset-bottom, 0px))')
  })

  it('has a dark scrim behind it', async () => {
    const user = userEvent.setup()
    await open(user)
    const backdrop = document.querySelector('.MuiBackdrop-root') as HTMLElement
    const css = Array.from(document.querySelectorAll('style')).map((style) => style.textContent ?? '').join('\n')
    expect(Array.from(backdrop.classList).some((n) => n.startsWith('css-') && css.includes('rgba(0, 0, 0, 0.6)'))).toBe(true)
  })

  it('"Set a goal" closes the sheet and stays on the goal screen, with nothing saved and nobody skipped', async () => {
    const user = userEvent.setup()
    const dialog = await open(user)
    await user.click(within(dialog).getByRole('button', { name: 'Set a goal' }))

    await waitFor(() => expect(sheet()).toBeNull())
    expect(screen.getByRole('heading', { name: 'How often will you show up?' })).toBeTruthy()
    expect(onSkip).not.toHaveBeenCalled()
    expect(goalApi.setWeeklyGoal).not.toHaveBeenCalled()
  })

  it('Escape closes it and stays, the same as "Set a goal"', async () => {
    const user = userEvent.setup()
    await open(user)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(sheet()).toBeNull())
    expect(onSkip).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'How often will you show up?' })).toBeTruthy()
  })

  it('a tap on the dark area closes it and stays', async () => {
    const user = userEvent.setup()
    await open(user)
    await user.click(document.querySelector('.MuiBackdrop-root') as HTMLElement)
    await waitFor(() => expect(sheet()).toBeNull())
    expect(onSkip).not.toHaveBeenCalled()
  })

  it('"Skip for now" closes the sheet, calls onSkip once, and still saves nothing', async () => {
    const user = userEvent.setup()
    const dialog = await open(user)
    await user.click(within(dialog).getByRole('button', { name: 'Skip for now' }))

    expect(onSkip).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(sheet()).toBeNull())
    expect(goalApi.setWeeklyGoal).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('can be opened again after it was closed (nothing is left over)', async () => {
    const user = userEvent.setup()
    const dialog = await open(user)
    await user.click(within(dialog).getByRole('button', { name: 'Set a goal' }))
    await waitFor(() => expect(sheet()).toBeNull())
    await user.click(skipButton())
    expect(await screen.findByRole('dialog', { name: 'Skip setting a goal?' })).toBeTruthy()
  })

  it('puts focus inside while open, and the page behind it cannot be used', async () => {
    const user = userEvent.setup()
    const dialog = await open(user)
    expect(dialog.contains(document.activeElement)).toBe(true)
    // The rest of the page is hidden from assistive technology while the sheet is open.
    expect(screen.queryByRole('button', { name: 'Set goal' })).toBeNull()
  })

  it('the choice made before opening it is kept when it closes', async () => {
    const user = userEvent.setup()
    renderOnboarding()
    await ready()
    await user.click(screen.getAllByRole('radio')[5])
    await user.click(skipButton())
    await user.click(within(await screen.findByRole('dialog', { name: 'Skip setting a goal?' })).getByRole('button', { name: 'Set a goal' }))
    await waitFor(() => expect(sheet()).toBeNull())
    expect(screen.getAllByRole('radio')[5].getAttribute('aria-checked')).toBe('true')
  })
})

describe('the standalone screen, opened from Home', () => {
  it('has a back arrow but no progress bar and no "3 of 3"', async () => {
    renderStandalone()
    await ready()
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy()
    expect(screen.queryByText('3 of 3')).toBeNull()
    expect(screen.queryByTestId('step-progress')).toBeNull()
  })

  it('Back calls onBack', async () => {
    const user = userEvent.setup()
    renderStandalone()
    await ready()
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('still has everything else: the title, the numbers and Set goal', async () => {
    renderStandalone()
    expect(await screen.findByRole('heading', { name: 'How often will you show up?' })).toBeTruthy()
    await ready()
    expect(screen.getAllByRole('radio')).toHaveLength(7)
    expect(setGoal()).toBeTruthy()
  })

  it('stays on screen after saving and shows its own message (it does not move on by itself)', async () => {
    const user = userEvent.setup()
    renderStandalone()
    await ready()
    await user.click(setGoal())
    expect(await screen.findByText(/Goal set/)).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'How often will you show up?' })).toBeTruthy()
    expect(onDone).not.toHaveBeenCalled()
  })
})

describe('onboarding, the progress is still shown', () => {
  it('has the arrow, a full bar and "3 of 3"', async () => {
    renderOnboarding()
    await ready()
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy()
    expect(screen.getByText('3 of 3')).toBeTruthy()
    expect(screen.getByTestId('step-progress').style.width || getComputedStyle(screen.getByTestId('step-progress')).width).toBe('100%')
  })

  it('a goal saved in onboarding still moves on after about 700 ms', async () => {
    renderOnboarding()
    await ready()
    const button = setGoal()
    vi.useFakeTimers()
    fireEvent.click(button)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50)
    })
    expect(onDone).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(GOAL_SAVED_PAUSE_MS)
    })
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})

describe('the mode decides, not which callbacks happen to be given', () => {
  // A caller that passes the onboarding callbacks to the standalone screen by mistake must still get the standalone screen.
  function renderStandaloneWithOnboardingProps() {
    return render(
      <ThemeProvider theme={theme}>
        <GoalScreen mode="standalone" onBack={onBack} onSkip={onSkip} onSaved={onSaved} onDone={onDone} />
      </ThemeProvider>,
    )
  }

  it('standalone never shows Skip, even if an onSkip is passed', async () => {
    renderStandaloneWithOnboardingProps()
    await ready()
    expect(screen.queryByRole('button', { name: /skip/i })).toBeNull()
  })

  it('standalone shows its own message and does not move on, even if onSaved and onDone are passed', async () => {
    const user = userEvent.setup()
    renderStandaloneWithOnboardingProps()
    await ready()
    await user.click(setGoal())
    expect(await screen.findByText(/Goal set/)).toBeTruthy()
    expect(onSaved).not.toHaveBeenCalled()
    await new Promise((resolve) => setTimeout(resolve, GOAL_SAVED_PAUSE_MS + 200))
    expect(onDone).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'How often will you show up?' })).toBeTruthy()
  })

  it('standalone has no progress bar even if the onboarding callbacks are passed', async () => {
    renderStandaloneWithOnboardingProps()
    await ready()
    expect(screen.queryByTestId('step-progress')).toBeNull()
  })
})
