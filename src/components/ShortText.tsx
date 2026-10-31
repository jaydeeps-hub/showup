import Box from '@mui/material/Box'
import { truncateText } from '../utils/truncateText'

/** Hidden on screen but still read out by a screen reader. */
const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const

/**
 * Text a person typed (a first or last name) or that Google provided (a gym name), cut for display by the 25-character
 * rule: 25 characters or fewer is shown whole; longer is cut to 25 (spaces count) and ends with "...".
 *
 * Only what is SHOWN is cut. When it was cut, the shortened text is hidden from screen readers and the full text is
 * put in the page for them instead, so the text is read once and never as half a name. Give the element around it
 * `title={text}` so a mouse user can see the full text too. Nothing is cut in a text field the person is typing in, and
 * nothing saved changes.
 */
export function ShortText({ text }: { text: string }) {
  const shown = truncateText(text)
  const cut = shown !== text
  return (
    <>
      <span aria-hidden={cut ? true : undefined}>{shown}</span>
      {cut && <Box component="span" sx={VISUALLY_HIDDEN}>{text}</Box>}
    </>
  )
}
