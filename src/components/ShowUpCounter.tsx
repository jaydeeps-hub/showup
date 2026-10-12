import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

interface ShowUpCounterProps {
  count: number
}

export function ShowUpCounter({ count }: ShowUpCounterProps) {
  return (
    <Box sx={{ textAlign: 'center' }} aria-live="polite">
      <Typography component="p" variant="h2" sx={{ fontWeight: 700, lineHeight: 1 }}>
        {count}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        Total Showups (verified gym visits)
      </Typography>
    </Box>
  )
}
