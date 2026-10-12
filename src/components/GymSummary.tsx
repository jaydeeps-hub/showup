import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'

interface GymSummaryProps {
  label: string
  name: string
  address: string
}

/** Compact card showing a gym's label, name and address. */
export function GymSummary({ label, name, address }: GymSummaryProps) {
  return (
    <Card>
      <CardContent sx={{ '&:last-child': { pb: 2 } }}>
        <Typography variant="overline" color="primary" sx={{ lineHeight: 1.5 }}>
          {label}
        </Typography>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          {name}
        </Typography>
        <Typography variant="body2" color="text.secondary" noWrap title={address}>
          {address}
        </Typography>
      </CardContent>
    </Card>
  )
}
