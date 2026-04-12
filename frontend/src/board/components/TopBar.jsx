import AppBar from '@mui/material/AppBar'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

export default function TopBar({ pageTitle, clockLabel, dateParts }) {
  return (
    <AppBar
      position="static"
      color="transparent"
      elevation={0}
      sx={(currentTheme) => ({
        bgcolor: currentTheme.board.topBarBg,
        border: 1,
        borderColor: 'divider',
        boxShadow: 'none',
        borderRadius: '18px',
        overflow: 'hidden',
        backgroundImage: `linear-gradient(180deg, ${currentTheme.board.topBarOverlay}, ${currentTheme.board.transparent})`,
      })}
    >
      <Box
        sx={{
          minHeight: { xs: 84, md: 96 },
          px: 2.5,
          py: 0.9,
          display: 'grid',
          gridTemplateColumns: 'minmax(220px,1fr) auto minmax(220px,1fr)',
          alignItems: 'center',
          gap: 2,
        }}
      >
        <Stack spacing={0.2} sx={{ minWidth: 0 }}>
          <Typography variant="h4" sx={{ fontSize: { xs: '2rem', md: '2.35rem' }, fontWeight: 900, letterSpacing: '-0.04em' }}>
            {pageTitle}
          </Typography>
        </Stack>

        <Typography
          variant="h2"
          sx={{
            fontSize: { xs: '4rem', md: '4.9rem' },
            lineHeight: 0.82,
            textAlign: 'center',
            fontWeight: 900,
            letterSpacing: '-0.06em',
          }}
        >
          {clockLabel}
        </Typography>

        <Stack spacing={0.25} sx={{ alignItems: 'flex-end' }}>
          <Typography sx={{ fontSize: { xs: '1.4rem', md: '1.85rem' }, lineHeight: 1, fontWeight: 800 }}>
            {dateParts.weekday}
          </Typography>
          <Typography sx={{ fontSize: { xs: '0.98rem', md: '1.18rem' }, color: 'text.secondary', lineHeight: 1, fontWeight: 700 }}>
            {dateParts.fullDate}
          </Typography>
        </Stack>
      </Box>
    </AppBar>
  )
}
