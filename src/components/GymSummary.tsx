import PlaceOutlined from '@mui/icons-material/PlaceOutlined'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import { tokens } from '../design-system/tokens'

interface GymSummaryProps {
  label: string
  name: string
  address: string
}

/** Compact card showing a gym's label, name and address. */
export function GymSummary({ label, name, address }: GymSummaryProps) {
  return (
    <Card>
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 4, p: 4, '&:last-child': { pb: 4 } }}>
        <Box
          aria-hidden
          sx={{
            flexShrink: 0,
            width: 40,
            height: 40,
            borderRadius: `${tokens.radius.sm}px`,
            bgcolor: tokens.color.brandSubtle,
            color: 'primary.light',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <PlaceOutlined sx={{ fontSize: 24 }} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary" component="p">
            {label}
          </Typography>
          <Typography variant="subtitle1" component="p" noWrap title={name}>
            {name}
          </Typography>
          <Typography variant="body2" color="text.secondary" component="p" noWrap title={address}>
            {address}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  )
}
