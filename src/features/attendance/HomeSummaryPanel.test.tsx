// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '@mui/material/styles'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { theme } from '../../app/theme'
import type { HomeSummaryState } from '../../hooks/useHomeSummary'
import type { HomeSummary } from '../../types'
import { HomeSummaryTop, KpiCards } from './HomeSummaryPanel'

/**
 * The cards at the top of Home. Without a weekly goal ("weeks in a row" means nothing), the second card becomes a "Set a
 * weekly goal" button of the same size. Rendered with hand-built states, so no database is involved.
 */

const TODAY = '2026-10-28'

function summary(overrides: Partial<HomeSummary> = {}): HomeSummary {
  return { weeksInARow: 2, bestWeeksInARow: 4, goalDays: 3, showupDaysThisWeek: 1, passesLeft: 3, totalShowups: 12, ...overrides }
}
function ready(overrides: Partial<HomeSummary> = {}, activePauses: string[] = []): HomeSummaryState & { retry: () => void } {
  return { status: 'ready', summary: summary(overrides), pause: { activePauses }, retry: vi.fn() }
}

/** `options.onSetGoal` is a handler by default; pass `{ onSetGoal: undefined }` to render with none. */
function renderTop(state: HomeSummaryState & { retry: () => void }, options: { onSetGoal?: (() => void) | undefined } = { onSetGoal: vi.fn() }) {
  return render(
    <ThemeProvider theme={theme}>
      <HomeSummaryTop state={state} today={TODAY} onSetGoal={options.onSetGoal} />
    </ThemeProvider>,
  )
}

const card = () => screen.getByRole('button', { name: /set a weekly goal/i }) as HTMLButtonElement
/** The CSS rules MUI generated for an element, as text. */
function rulesOf(node: HTMLElement) {
  const css = Array.from(document.querySelectorAll('style')).map((style) => style.textContent ?? '').join('\n')
  return Array.from(node.classList).filter((n) => n.startsWith('css-')).map((n) => css.match(new RegExp(`\\.${n}\\{[^}]*\\}`))?.[0] ?? '').join(' ')
}

afterEach(() => cleanup())

describe('with no weekly goal, the card becomes a button', () => {
  it('says "Set a weekly goal" and "Add a target ›" instead of "weeks in a row"', () => {
    renderTop(ready({ goalDays: null, weeksInARow: 0 }))
    expect(card().textContent).toBe('Set a weekly goalAdd a target ›')
    expect(screen.queryByText(/in a row/)).toBeNull()
  })

  it('replaces the card, keeping total showups beside it', () => {
    renderTop(ready({ goalDays: null, weeksInARow: 0, totalShowups: 47 }))
    expect(screen.getByText('47')).toBeTruthy()
    expect(screen.getByText('Total showups')).toBeTruthy()
  })

  it('is a real button (so Enter and Space work), not a div pretending to be one', () => {
    renderTop(ready({ goalDays: null }))
    expect(card().tagName).toBe('BUTTON')
    expect(card().type).toBe('button')
  })

  it('opens the goal screen when pressed', async () => {
    const onSetGoal = vi.fn()
    const user = userEvent.setup()
    renderTop(ready({ goalDays: null }), { onSetGoal })
    await user.click(card())
    expect(onSetGoal).toHaveBeenCalledTimes(1)
  })

  it('works from the keyboard: Enter and Space', async () => {
    const onSetGoal = vi.fn()
    const user = userEvent.setup()
    renderTop(ready({ goalDays: null }), { onSetGoal })
    card().focus()
    await user.keyboard('{Enter}')
    await user.keyboard(' ')
    expect(onSetGoal).toHaveBeenCalledTimes(2)
  })

  it('can be reached with Tab', async () => {
    const user = userEvent.setup()
    renderTop(ready({ goalDays: null }))
    await user.tab()
    expect(document.activeElement).toBe(card())
  })

  it('has a visible focus ring', () => {
    renderTop(ready({ goalDays: null }))
    expect(rulesOf(card()) + document.head.innerHTML).toMatch(/focus-visible/)
    const css = Array.from(document.querySelectorAll('style')).map((style) => style.textContent ?? '').join('\n')
    expect(css).toMatch(/:focus-visible\{outline:2px solid #8FA6FF/)
  })

  it('is shown but cannot be pressed when there is nothing for it to do', () => {
    renderTop(ready({ goalDays: null }), { onSetGoal: undefined })
    expect(card().disabled).toBe(true)
  })

  it('has the design\'s look: soft blue fill, a dashed 1.5px border, the heading font at 16px, the hint at 13px', () => {
    renderTop(ready({ goalDays: null }))
    const rule = rulesOf(card()).toLowerCase()
    expect(rule).toContain('background-color:#17234f')
    expect(rule).toContain('border:1.5px dashed #5c78e6')
    expect(rule).toContain('border-radius:18px')
    expect(rulesOf(screen.getByText('Set a weekly goal')).toLowerCase()).toContain('font-size:16px')
    const hint = rulesOf(screen.getByText('Add a target ›')).toLowerCase()
    expect(hint).toContain('font-size:13px')
    expect(hint).toContain('color:#c3cce8')
  })

  it('is the same size as the card it replaces: same flex share, radius and padding', () => {
    const withGoal = renderTop(ready({ goalDays: 3 }))
    const weeks = screen.getByText('weeks in a row').parentElement as HTMLElement
    const weeksRule = rulesOf(weeks)
    withGoal.unmount()

    renderTop(ready({ goalDays: null }))
    const noGoalRule = rulesOf(card())
    for (const part of ['flex:1', 'border-radius:18px', 'padding:12px 14px']) {
      expect(weeksRule).toContain(part)
      expect(noGoalRule).toContain(part)
    }
  })

  it('is the ONLY control for it: no second full-width "Set your weekly goal" button below', () => {
    renderTop(ready({ goalDays: null }))
    expect(screen.queryByRole('button', { name: /set your weekly goal/i })).toBeNull()
    expect(screen.getAllByRole('button', { name: /goal/i })).toHaveLength(1)
  })

  it('shows no week-progress block ("This week") without a goal', () => {
    renderTop(ready({ goalDays: null }))
    expect(screen.queryByText('This week')).toBeNull()
    expect(screen.queryByRole('img', { name: /done|paused/i })).toBeNull()
  })

  it('shows for a person who has never had a goal and for one who skipped it: both are just "no goal"', () => {
    renderTop(ready({ goalDays: null, weeksInARow: 0, totalShowups: 0 }))
    expect(card()).toBeTruthy()
  })
})

describe('with a weekly goal, nothing changes', () => {
  it('shows "weeks in a row" and no button', () => {
    renderTop(ready({ goalDays: 3, weeksInARow: 4 }))
    expect(screen.getByText('4')).toBeTruthy()
    expect(screen.getByText('weeks in a row')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /set a weekly goal/i })).toBeNull()
  })

  it('says "week in a row" for exactly one (as the design does)', () => {
    renderTop(ready({ goalDays: 3, weeksInARow: 1 }))
    expect(screen.getByText('week in a row')).toBeTruthy()
    expect(screen.queryByText('weeks in a row')).toBeNull()
  })

  it('says "weeks in a row" for zero too: a person WITH a goal who has not built a streak yet', () => {
    renderTop(ready({ goalDays: 3, weeksInARow: 0 }))
    expect(screen.getByText('weeks in a row')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /set a weekly goal/i })).toBeNull()
  })

  it('still shows the week block with its count', () => {
    renderTop(ready({ goalDays: 3, showupDaysThisWeek: 2 }))
    expect(screen.getByText('This week')).toBeTruthy()
    expect(screen.getByText('2 of 3 days')).toBeTruthy()
  })

  it('still shows "Paused" for a paused week', () => {
    renderTop(ready({ goalDays: 3 }, ['2026-10-26']))
    expect(screen.getAllByText('Paused').length).toBeGreaterThan(0)
  })
})

describe('while the numbers load, or fail to load', () => {
  it('shows the usual placeholder card while loading, never the button (no goal is only known once the numbers are)', () => {
    renderTop({ status: 'loading', retry: vi.fn() })
    expect(screen.queryByRole('button', { name: /set a weekly goal/i })).toBeNull()
    expect(screen.getByText('weeks in a row')).toBeTruthy()
    expect(screen.getByText('Loading your week…')).toBeTruthy()
  })

  it('shows the error with Retry and no cards when the numbers cannot be loaded', () => {
    renderTop({ status: 'error', message: 'offline', retry: vi.fn() })
    expect(screen.getByText('offline')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /set a weekly goal/i })).toBeNull()
  })

  it('turns from the placeholder into the button when the numbers arrive with no goal', () => {
    const view = renderTop({ status: 'loading', retry: vi.fn() })
    expect(screen.queryByRole('button', { name: /set a weekly goal/i })).toBeNull()
    view.rerender(
      <ThemeProvider theme={theme}>
        <HomeSummaryTop state={ready({ goalDays: null })} today={TODAY} onSetGoal={vi.fn()} />
      </ThemeProvider>,
    )
    expect(card()).toBeTruthy()
  })
})

describe('KpiCards on its own', () => {
  it('shows a dash in the first card while there are no numbers', () => {
    render(
      <ThemeProvider theme={theme}>
        <KpiCards totalShowups={null} weeksInARow={null} />
      </ThemeProvider>,
    )
    expect(screen.getAllByText('–')).toHaveLength(2)
  })
})
