import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

interface ShowUpCounterProps {
  count: number
}

/** The running total. The number updates instantly; screen readers are told when it changes. */
export function ShowUpCounter({ count }: ShowUpCounterProps) {
  return (
    <Box sx={{ textAlign: 'center' }} aria-live="polite">
      <Typography component="p" variant="display">
        {count}
      </Typography>
      <Typography component="p" variant="subtitle2" sx={{ mt: 1 }}>
        Total Showups
      </Typography>
      <Typography component="p" variant="caption" color="text.secondary">
        Visits verified at your gym
      </Typography>
    </Box>
  )
}
