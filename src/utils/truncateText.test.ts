import { describe, expect, it } from 'vitest'
import { GYM_NAME_MAX_CHARACTERS, TRUNCATION_MARK, truncateText } from './truncateText'

describe('truncateText', () => {
  it('limits a gym name to 25 characters, with "..." to show it was cut', () => {
    expect(GYM_NAME_MAX_CHARACTERS).toBe(25)
    expect(TRUNCATION_MARK).toBe('...')
  })

  it('leaves a short name exactly as it is', () => {
    expect(truncateText('Iron Gym')).toBe('Iron Gym')
    expect(truncateText('')).toBe('')
    expect(truncateText('A')).toBe('A')
  })

  it('leaves a name of exactly 25 characters whole: only a LONGER name is cut', () => {
    const name = 'Anytime Fitness Bandra We' // 25
    expect(Array.from(name)).toHaveLength(25)
    expect(truncateText(name)).toBe(name)
  })

  it('cuts a name of 26 characters to 25 and adds the dots', () => {
    const name = 'Anytime Fitness Bandra Wes' // 26
    expect(Array.from(name)).toHaveLength(26)
    expect(truncateText(name)).toBe('Anytime Fitness Bandra We...')
  })

  it('counts spaces as characters', () => {
    // 12 words of "ab" with single spaces between them is 12*2 + 11 = 35 characters.
    const name = Array(12).fill('ab').join(' ')
    expect(name).toHaveLength(35)
    expect(truncateText(name)).toBe(`${name.slice(0, 25)}...`)
    // Without counting spaces the limit would have let more of it through.
    expect(truncateText(name).replace('...', '')).toHaveLength(25)
  })

  it('does not leave a space before the dots when the cut lands just after one', () => {
    // 24 letters, then a space as the 25th character, then more: the cut part ends in a space.
    const name = `${'a'.repeat(24)} bcdef`
    expect(Array.from(name).slice(0, 25).join('').endsWith(' ')).toBe(true) // the case under test
    expect(truncateText(name)).toBe(`${'a'.repeat(24)}...`)
    expect(truncateText(name)).not.toMatch(/\s\.\.\.$/)
  })

  it('a real-looking name: the cut falls on a letter, so nothing is trimmed', () => {
    // "Iron Works Fitness Center" is exactly 25 characters, so the extra word is what gets cut off.
    expect(truncateText('Iron Works Fitness Center Mumbai')).toBe('Iron Works Fitness Center...')
  })

  it('counts the space between words, as in "Limitless Fitness": 25 characters including those spaces, then the dots', () => {
    // "Limitless" (9) + space (10) + "Fitness" (17) + space (18) + "Studio" (24) + space (25): the 25th character is a space.
    const name = 'Limitless Fitness Studio Bandra West'
    expect(Array.from(name).slice(0, 25).join('')).toBe('Limitless Fitness Studio ')
    expect(truncateText(name)).toBe('Limitless Fitness Studio...')
    // One more letter before the cut shows the spaces really are counted: the next word starts at character 26.
    expect(truncateText('Limitless Fitness Studios Bandra West')).toBe('Limitless Fitness Studios...')
    // A name that is 25 characters with its spaces is shown whole, with no dots.
    expect(truncateText('Limitless Fitness Studios')).toBe('Limitless Fitness Studios')
  })

  it('drops several spaces before the dots, not just one', () => {
    const name = `${'a'.repeat(22)}    bbbb` // the cut at 25 ends in spaces
    expect(truncateText(name)).toBe(`${'a'.repeat(22)}...`)
  })

  it('works on a name that is all spaces beyond the limit', () => {
    expect(truncateText(`${'a'.repeat(10)}${' '.repeat(30)}`)).toBe(`${'a'.repeat(10)}...`)
  })

  it('never cuts a character in half: a character made of two code units counts as one', () => {
    // "𝐆" (mathematical bold G) is one character but two UTF-16 code units. 26 of them must show 25 whole ones.
    const name = '𝐆'.repeat(26)
    expect(name.length).toBe(52)
    const out = truncateText(name)
    expect(out).toBe(`${'𝐆'.repeat(25)}...`)
    expect(Array.from(out.replace('...', ''))).toHaveLength(25)
    // No half of a character (a lone surrogate) is left in the output.
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(out)).toBe(false)
  })

  it('does not cut an emoji in half', () => {
    const name = `${'a'.repeat(24)}🏋️‍♀️ and more`
    const out = truncateText(name)
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(out)).toBe(false)
    expect(out.endsWith('...')).toBe(true)
  })

  it('keeps accented letters whole, whether written as one character or as letter plus accent', () => {
    expect(truncateText('Café Fitness Club Gym Hall')).toBe('Café Fitness Club Gym Hal...')
    expect(truncateText('Café Gym')).toBe('Café Gym') // short: untouched, accent intact
  })

  it('never splits a letter from its accent or its vowel sign: they count as one character', () => {
    // "e" + combining acute accent is two code points but one character on screen.
    const e = 'é' // written with an explicit combining accent, so this really is two code points
    expect(Array.from(e)).toHaveLength(2)
    expect(truncateText(e.repeat(26))).toBe(`${e.repeat(25)}...`) // 52 code points, 26 characters
    expect(truncateText(e.repeat(25))).toBe(e.repeat(25)) // 25 characters: whole
    // Devanagari "कि" (consonant + vowel sign) is one character: 26 of them keep 25 whole, none left dangling.
    const hindi = 'कि'.repeat(26)
    expect(truncateText(hindi)).toBe(`${'कि'.repeat(25)}...`)
    expect(truncateText('कि'.repeat(25))).toBe('कि'.repeat(25))
  })

  it('counts an emoji with its skin tone or joined parts as one character and keeps it whole', () => {
    const family = '👨‍👩‍👧' // one character made of three people joined together
    expect(truncateText(family.repeat(26))).toBe(`${family.repeat(25)}...`)
    expect(truncateText('👍🏽'.repeat(25))).toBe('👍🏽'.repeat(25))
  })

  it('works for text that is not English', () => {
    const name = '健身房健身房健身房健身房健身房健身房健身房健身房健身房健身房' // 30 characters
    expect(Array.from(name)).toHaveLength(30)
    expect(truncateText(name)).toBe(`${Array.from(name).slice(0, 25).join('')}...`)
  })

  it('takes a different limit when given one', () => {
    expect(truncateText('Iron Gym Andheri', 8)).toBe('Iron Gym...')
    expect(truncateText('Iron Gym', 8)).toBe('Iron Gym')
  })

  it('copes with a limit of zero without throwing', () => {
    expect(truncateText('abc', 0)).toBe('...')
  })

  it('the shortened text, including the dots, is never more than 3 over the limit', () => {
    for (const length of [26, 27, 40, 100, 500]) {
      const out = truncateText('x'.repeat(length))
      expect(Array.from(out).length).toBeLessThanOrEqual(GYM_NAME_MAX_CHARACTERS + TRUNCATION_MARK.length)
      expect(out.endsWith('...')).toBe(true)
    }
  })

  it('does not change the text it is given', () => {
    const name = 'a'.repeat(40)
    truncateText(name)
    expect(name).toHaveLength(40)
  })
})
