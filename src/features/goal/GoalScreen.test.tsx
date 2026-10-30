// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '@mui/material/styles'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { theme } from '../../app/theme'
import type { GoalState, MascotContent, MascotMessage } from '../../types'

/**
 * The weekly goal screen (Phase 10e), using the REAL screen, picker, mascot row and mascot logic. Faked: the mascot
 * content (so a test chooses what was loaded) and the two goal database calls.
 */

const mascot = vi.hoisted(() => ({ content: null as unknown as MascotContent }))
vi.mock('../../hooks/useMascot', () => ({ useMascotContent: () => mascot.content }))

const goalApi = vi.hoisted(() => ({ fetchGoalState: vi.fn(), setWeeklyGoal: vi.fn() }))
vi.mock('../../services/goalService', () => goalApi)

const { GoalScreen } = await import('./GoalScreen')
const { BUNDLED_MASCOT_CONTENT } = await import('../../services/mascotStore')
const { DEFAULT_GOAL_MASCOT_MESSAGES } = await import('../../config/mascotDefaults')

const BUBBLE = 'Pick a number you can keep. Rest days are part of the plan.'

const noGoal: GoalState = { hasGoal: false, currentGoal: null, pendingGoal: null, pendingFrom: null }
const goalOf = (days: number): GoalState => ({ hasGoal: true, currentGoal: days, pendingGoal: null, pendingFrom: null })

/** The seven goal rows as the database returns them, with ids and (optionally) edited words. */
function goalRows(overrides: Record<string, Partial<MascotMessage>> = {}): MascotMessage[] {
  return DEFAULT_GOAL_MASCOT_MESSAGES.map((row, index) => ({ ...row, id: 100 + index, ...overrides[row.key] }))
}

/** Loaded mascot content with real pictures. */
function loaded(messages: MascotMessage[], expressions = ['smile', 'lift', 'sleep']): MascotContent {
  const images: MascotContent['images'] = {}
  for (const name of expressions) images[name] = { kind: 'expression', url: `https://cdn.example.com/${name}.png`, alt: null, width: 180, height: 250, v: 4 }
  return { version: 5, images, messages }
}

const onBack = vi.fn()
function renderScreen() {
  return render(
    <ThemeProvider theme={theme}>
      <GoalScreen onBack={onBack} />
    </ThemeProvider>,
  )
}

const title = () => screen.findByRole('heading', { name: 'How often will you show up?' })
const radios = () => screen.getAllByRole('radio') as HTMLButtonElement[]
const selected = () => radios().find((radio) => radio.getAttribute('aria-checked') === 'true')
const big = () => screen.getByText(/^[1-7]$/, { selector: 'p' })
const setGoalButton = () => screen.getByRole('button', { name: 'Set goal' }) as HTMLButtonElement
const mascotImage = () => document.querySelector('img[aria-hidden="true"]') as HTMLImageElement | null
/** The caption is the paragraph right under the big number. */
const caption = () => big().nextElementSibling as HTMLElement

beforeEach(() => {
  vi.clearAllMocks()
  mascot.content = loaded(goalRows())
  goalApi.fetchGoalState.mockResolvedValue({ status: 'ok', goal: noGoal })
  goalApi.setWeeklyGoal.mockResolvedValue({ status: 'saved' })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('the top of the screen', () => {
  it('has a back arrow, a full progress bar, and "3 of 3", and no tab bar', async () => {
    renderScreen()
    await title()
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy()
    expect(screen.getByText('3 of 3')).toBeTruthy()
    expect(screen.getByTestId('step-progress').style.width || getComputedStyle(screen.getByTestId('step-progress')).width).toBe('100%')
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull()
  })

  it('Back calls onBack', async () => {
    const user = userEvent.setup()
    renderScreen()
    await title()
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('has the title "How often will you show up?"', async () => {
    renderScreen()
    expect(await title()).toBeTruthy()
  })

  it('has no Skip button here (that is a later step)', async () => {
    renderScreen()
    await title()
    expect(screen.queryByRole('button', { name: /skip/i })).toBeNull()
  })
})

describe('the selected number', () => {
  it('starts on 3 for someone with no goal', async () => {
    renderScreen()
    await title()
    await screen.findByRole('radiogroup', { name: 'Days per week' })
    expect(selected()?.textContent).toBe('3')
    expect(big().textContent).toBe('3')
  })

  it('starts on the saved goal', async () => {
    goalApi.fetchGoalState.mockResolvedValue({ status: 'ok', goal: goalOf(5) })
    renderScreen()
    await screen.findByRole('radiogroup')
    expect(selected()?.textContent).toBe('5')
    expect(big().textContent).toBe('5')
  })

  it('starts on a pending goal when there is one (a change that applies from next Monday)', async () => {
    goalApi.fetchGoalState.mockResolvedValue({ status: 'ok', goal: { hasGoal: true, currentGoal: 3, pendingGoal: 6, pendingFrom: '2026-11-02' } })
    renderScreen()
    await screen.findByRole('radiogroup')
    expect(selected()?.textContent).toBe('6')
  })

  it('shows what the number means in words, under the big number', async () => {
    goalApi.fetchGoalState.mockResolvedValue({ status: 'ok', goal: goalOf(3) })
    renderScreen()
    await screen.findByRole('radiogroup')
    expect(caption().textContent).toBe('Steady')
  })
})

describe('the seven buttons', () => {
  it('are a radiogroup labelled "Days per week" with the numbers 1 to 7', async () => {
    renderScreen()
    const group = await screen.findByRole('radiogroup', { name: 'Days per week' })
    expect(within(group).getAllByRole('radio').map((radio) => radio.textContent)).toEqual(['1', '2', '3', '4', '5', '6', '7'])
  })

  it('exactly one is checked, and pressing another moves the check, the big number and the caption', async () => {
    const user = userEvent.setup()
    renderScreen()
    await screen.findByRole('radiogroup')
    expect(radios().filter((radio) => radio.getAttribute('aria-checked') === 'true')).toHaveLength(1)

    await user.click(radios()[0])
    expect(selected()?.textContent).toBe('1')
    expect(big().textContent).toBe('1')
    expect(caption().textContent).toBe('A gentle start')
    expect(radios().filter((radio) => radio.getAttribute('aria-checked') === 'true')).toHaveLength(1)
  })

  it('the selected one has the accent fill and the others do not', async () => {
    renderScreen()
    await screen.findByRole('radiogroup')
    const css = Array.from(document.querySelectorAll('style')).map((style) => style.textContent ?? '').join('\n')
    const ruleOf = (node: HTMLElement) =>
      Array.from(node.classList).filter((name) => name.startsWith('css-')).map((name) => css.match(new RegExp(`\\.${name}\\{[^}]*\\}`))?.[0] ?? '').join(' ')
    expect(ruleOf(selected()!).toLowerCase()).toContain('background-color:#2b50d9')
    const other = radios().find((radio) => radio !== selected())!
    expect(ruleOf(other).toLowerCase()).toContain('background-color:#0e1522')
  })

  it('are at least 48px to tap', async () => {
    renderScreen()
    await screen.findByRole('radiogroup')
    const css = Array.from(document.querySelectorAll('style')).map((style) => style.textContent ?? '').join('\n')
    for (const radio of radios()) {
      const rule = Array.from(radio.classList).filter((name) => name.startsWith('css-')).map((name) => css.match(new RegExp(`\\.${name}\\{[^}]*\\}`))?.[0] ?? '').join(' ')
      const height = Number(/(?:^|[;{ ])height:(\d+)px/.exec(rule)?.[1])
      expect(height).toBeGreaterThanOrEqual(48)
    }
  })
})

describe('the mascot row, from the goal_N row for the selected number', () => {
  const faces: [number, string][] = [[1, 'smile'], [2, 'smile'], [3, 'smile'], [4, 'smile'], [5, 'lift'], [6, 'lift'], [7, 'sleep']]
  for (const [days, face] of faces) {
    it(`${days}: the ${face} picture, the bubble, and the caption`, async () => {
      const user = userEvent.setup()
      renderScreen()
      await screen.findByRole('radiogroup')
      await user.click(radios()[days - 1])
      expect(mascotImage()!.src).toBe(`https://cdn.example.com/${face}.png?v=4`)
      expect(screen.getByText(BUBBLE)).toBeTruthy()
      expect(caption().textContent).toBe(DEFAULT_GOAL_MASCOT_MESSAGES[days - 1].label)
    })
  }

  it('puts the picture on the left of the bubble, 80px tall, and hides the picture from screen readers', async () => {
    renderScreen()
    await screen.findByRole('radiogroup')
    const image = mascotImage()!
    const bubble = screen.getByText(BUBBLE)
    expect(Boolean(image.compareDocumentPosition(bubble) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
    expect(image.getAttribute('alt')).toBe('')
    const css = Array.from(document.querySelectorAll('style')).map((style) => style.textContent ?? '').join('\n')
    const rule = Array.from(image.classList).filter((n) => n.startsWith('css-')).map((n) => css.match(new RegExp(`\\.${n}\\{[^}]*\\}`))?.[0] ?? '').join(' ')
    expect(rule).toContain('height:80px')
  })

  it('uses whatever the database says, so edited words appear without a new release', async () => {
    mascot.content = loaded(goalRows({ goal_3: { message: 'Three is a fine number.', label: 'The sweet spot', expression: 'lift' } }))
    renderScreen()
    await screen.findByRole('radiogroup')
    expect(screen.getByText('Three is a fine number.')).toBeTruthy()
    expect(caption().textContent).toBe('The sweet spot')
    expect(mascotImage()!.src).toBe('https://cdn.example.com/lift.png?v=4')
  })

  it('shows no caption, and keeps its space, when the row has none', async () => {
    mascot.content = loaded(goalRows({ goal_3: { label: null } }))
    renderScreen()
    await screen.findByRole('radiogroup')
    expect(caption().textContent).toBe('')
    expect(screen.getByText(BUBBLE)).toBeTruthy()
  })

  it('shows the words without a picture when no picture exists, and does not break', async () => {
    mascot.content = { version: 0, images: {}, messages: [...DEFAULT_GOAL_MASCOT_MESSAGES] }
    renderScreen()
    await screen.findByRole('radiogroup')
    expect(mascotImage()).toBeNull()
    expect(screen.getByText(BUBBLE)).toBeTruthy()
  })

  it('skips a row whose face has no picture while pictures are loaded, as Home does', async () => {
    mascot.content = loaded(
      [...goalRows({ goal_3: { expression: 'cheer', message: 'no cheer picture' } }), { ...goalRows()[2], id: 900, priority: 99, message: 'second choice' }],
      ['smile', 'lift', 'sleep'],
    )
    renderScreen()
    await screen.findByRole('radiogroup')
    expect(screen.queryByText('no cheer picture')).toBeNull()
    expect(screen.getByText('second choice')).toBeTruthy()
  })
})

describe('when the mascot content has not loaded', () => {
  it('uses the bundled words and captions (the bundled content has no pictures)', async () => {
    mascot.content = BUNDLED_MASCOT_CONTENT
    const user = userEvent.setup()
    renderScreen()
    await screen.findByRole('radiogroup')
    expect(screen.getByText(BUBBLE)).toBeTruthy()
    expect(caption().textContent).toBe('Steady')
    expect(mascotImage()).toBeNull()
    await user.click(radios()[5])
    expect(caption().textContent).toBe('Nearly every day')
  })

  it('uses the bundled goal rows when old saved content has only Home rows', async () => {
    mascot.content = loaded([{ id: 1, key: 'in_progress', locale: 'en', priority: 150, expression: 'smile', message: 'a home line' }])
    renderScreen()
    await screen.findByRole('radiogroup')
    expect(screen.getByText(BUBBLE)).toBeTruthy()
    expect(screen.queryByText('a home line')).toBeNull()
    expect(caption().textContent).toBe('Steady')
  })
})

describe('7 is a nudge, not a limit', () => {
  it('shows the gentle caption for 7, and 7 can still be selected', async () => {
    const user = userEvent.setup()
    renderScreen()
    await screen.findByRole('radiogroup')
    await user.click(radios()[6])
    expect(selected()?.textContent).toBe('7')
    expect(big().textContent).toBe('7')
    expect(caption().textContent).toBe('Are you sure? Rest days are important too.')
    expect(radios()[6].disabled).toBe(false)
  })

  it('and 7 can be saved', async () => {
    const user = userEvent.setup()
    renderScreen()
    await screen.findByRole('radiogroup')
    await user.click(radios()[6])
    await user.click(setGoalButton())
    expect(goalApi.setWeeklyGoal).toHaveBeenCalledTimes(1)
    expect(goalApi.setWeeklyGoal).toHaveBeenCalledWith(7)
  })

  it('a goal of 7 that is already saved opens on 7', async () => {
    goalApi.fetchGoalState.mockResolvedValue({ status: 'ok', goal: goalOf(7) })
    renderScreen()
    await screen.findByRole('radiogroup')
    expect(selected()?.textContent).toBe('7')
    expect(setGoalButton().disabled).toBe(false)
  })
})

describe('Set goal and the help text', () => {
  it('has the help text', async () => {
    renderScreen()
    expect(await screen.findByText('Days per week. You can change this later in Profile.')).toBeTruthy()
  })

  it('saves the selected number through set_weekly_goal and then tells the person', async () => {
    const user = userEvent.setup()
    renderScreen()
    await screen.findByRole('radiogroup')
    await user.click(radios()[3])
    await user.click(setGoalButton())
    expect(goalApi.setWeeklyGoal).toHaveBeenCalledWith(4)
    expect(await screen.findByRole('alert')).toBeTruthy()
  })

  it('shows an error toast when saving fails, and the choice stays', async () => {
    goalApi.setWeeklyGoal.mockResolvedValue({ status: 'error', message: 'Please sign in again to change your goal.' })
    const user = userEvent.setup()
    renderScreen()
    await screen.findByRole('radiogroup')
    await user.click(radios()[1])
    await user.click(setGoalButton())
    expect(await screen.findByText('Please sign in again to change your goal.')).toBeTruthy()
    expect(selected()?.textContent).toBe('2')
  })

  it('ignores a second press while saving, and turns the number buttons off meanwhile', async () => {
    let finish!: (value: unknown) => void
    goalApi.setWeeklyGoal.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
    const user = userEvent.setup()
    renderScreen()
    await screen.findByRole('radiogroup')
    await user.click(setGoalButton())
    const saving = (await screen.findByRole('button', { name: 'Saving…' })) as HTMLButtonElement
    expect(saving.disabled).toBe(true)
    expect(radios().every((radio) => radio.disabled)).toBe(true)
    finish({ status: 'saved' })
    await screen.findByRole('button', { name: 'Set goal' })
    expect(goalApi.setWeeklyGoal).toHaveBeenCalledTimes(1)
  })

  it('is 60px tall and pushed to the bottom of the screen', async () => {
    renderScreen()
    await screen.findByRole('radiogroup')
    const css = Array.from(document.querySelectorAll('style')).map((style) => style.textContent ?? '').join('\n')
    const rule = Array.from(setGoalButton().classList).filter((n) => n.startsWith('css-')).map((n) => css.match(new RegExp(`\\.${n}\\{[^}]*\\}`))?.[0] ?? '').join(' ')
    expect(rule).toContain('margin-top:auto')
    expect(rule).toContain('height:60px')
    expect(rule).toContain('min-height:60px')
  })

  it('shows the "changes on" note when a change is waiting', async () => {
    goalApi.fetchGoalState.mockResolvedValue({ status: 'ok', goal: { hasGoal: true, currentGoal: 3, pendingGoal: 5, pendingFrom: '2026-11-02' } })
    renderScreen()
    expect(await screen.findByRole('status')).toBeTruthy()
  })
})

describe('loading and errors', () => {
  it('shows a loading line, and no numbers yet, while the goal loads', async () => {
    goalApi.fetchGoalState.mockReturnValue(new Promise(() => {}))
    renderScreen()
    await title()
    expect(screen.getByText('Loading your goal…')).toBeTruthy()
    expect(screen.queryByRole('radiogroup')).toBeNull()
  })

  it('shows the error with Retry, and Retry loads again', async () => {
    goalApi.fetchGoalState.mockResolvedValueOnce({ status: 'error', message: "We couldn't reach the server. Check your connection and try again." })
    const user = userEvent.setup()
    renderScreen()
    expect(await screen.findByText(/couldn't reach the server/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('radiogroup')).toBeTruthy()
  })
})
