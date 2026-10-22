import CloseRounded from '@mui/icons-material/CloseRounded'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import Link from '@mui/material/Link'
import ReactMarkdown from 'react-markdown'
import { Loader } from '../../components/Loader'
import type { CmsState } from '../../hooks/useCmsValue'

interface TermsDialogProps {
  open: boolean
  onClose: () => void
  /** The loaded terms. Loaded by the screen that owns this popup, so closing and reopening keeps them. */
  terms: CmsState & { retry: () => void }
}

/**
 * The Terms and Conditions popup. The text is Markdown stored in the Supabase `cms` table
 * (`id = 2`, `content_type = 'tnc'`); nothing is hardcoded. It is fetched the first time the popup
 * opens (see LandingScreen), then kept.
 *
 * MUI's Dialog provides the dialog semantics, focus trapping, Escape to close and backdrop clicks.
 * The Markdown is rendered as React elements, never as raw HTML: `skipHtml` drops any HTML in the
 * text, and react-markdown's default URL handling blocks `javascript:` links.
 */
export function TermsDialog({ open, onClose, terms }: TermsDialogProps) {

  return (
    <Dialog
      open={open}
      onClose={onClose}
      scroll="paper"
      fullWidth
      maxWidth="sm"
      aria-labelledby="terms-title"
      slotProps={{ paper: { sx: { maxHeight: 'min(85dvh, 720px)' } } }}
    >
      <DialogTitle id="terms-title" component="h2" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        Terms and Conditions
        <IconButton aria-label="Close terms and conditions" onClick={onClose} edge="end">
          <CloseRounded />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {terms.status === 'loading' && (
          <Box role="status" sx={{ display: 'flex', alignItems: 'center', gap: 3, color: 'text.secondary', py: 4 }}>
            <Loader />
            Loading the terms…
          </Box>
        )}

        {terms.status === 'error' && (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={terms.retry}>
                Try again
              </Button>
            }
          >
            We couldn't load the Terms and Conditions. Check your connection and try again.
          </Alert>
        )}

        {terms.status === 'not-found' && (
          <Alert severity="warning">The Terms and Conditions are not available right now.</Alert>
        )}

        {terms.status === 'found' && (
          <Box
            sx={{
              color: 'text.primary',
              '& h1, & h2, & h3, & h4': { fontFamily: 'inherit', lineHeight: 1.3, mt: 5, mb: 2 },
              '& h1': { fontSize: '1.375rem' },
              '& h2': { fontSize: '1.125rem' },
              '& h3, & h4': { fontSize: '1rem' },
              '& > :first-child': { mt: 0 },
              '& p': { my: 3, lineHeight: 1.6 },
              '& ul, & ol': { pl: 6, my: 3 },
              '& li': { mb: 1, lineHeight: 1.6 },
              '& hr': { border: 0, borderTop: 1, borderColor: 'divider', my: 5 },
              '& blockquote': { m: 0, pl: 4, borderLeft: 3, borderColor: 'divider', color: 'text.secondary' },
              '& code': { fontSize: '0.9em' },
              '& a': { color: 'primary.light' },
              overflowWrap: 'anywhere',
            }}
          >
            <ReactMarkdown
              skipHtml
              components={{
                // Links in the terms open in a new tab and cannot reach back into this page.
                a: ({ href, children }) => (
                  <Link href={href} target="_blank" rel="noopener noreferrer">
                    {children}
                  </Link>
                ),
              }}
            >
              {terms.value}
            </ReactMarkdown>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  )
}
