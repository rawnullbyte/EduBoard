import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

export default function EmptyPage({ title, copy }) {
  return (
    <Paper
      sx={(currentTheme) => ({
        height: '100%',
        borderRadius: '12px',
        bgcolor: currentTheme.board.emptyPageBg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      })}
    >
      <Stack spacing={1.4} sx={{ textAlign: 'center' }}>
        <Typography variant="h3">{title}</Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: '1.3rem' }}>{copy}</Typography>
      </Stack>
    </Paper>
  )
}
