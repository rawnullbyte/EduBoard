import Box from '@mui/material/Box'

export default function AccentRail({ progress = 0 }) {
  return (
    <Box
      sx={(currentTheme) => ({
        position: 'relative',
        height: 4,
        overflow: 'hidden',
        borderRadius: '999px',
        bgcolor: currentTheme.board.railTrack,
        '&::after': {
          content: '""',
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: `${progress}%`,
          transition: 'width 180ms linear',
          background: currentTheme.board.railFill,
          boxShadow: `0 0 16px ${currentTheme.board.railGlow}`,
        },
      })}
    />
  )
}
