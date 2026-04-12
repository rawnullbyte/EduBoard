import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

function getEntrySizing(entry, dense = false) {
  const total = entry.title.length + entry.kicker.length + (entry.metaLines ?? []).join('').length

  if (entry.type === 'event') {
    return {
      kicker: dense ? '0.54rem' : '0.6rem',
      title: total > 34 ? (dense ? '0.76rem' : '0.96rem') : dense ? '0.82rem' : '1.06rem',
      meta: dense ? '0.74rem' : '0.9rem',
      clamp: dense ? 2 : 4,
    }
  }

  if (dense || total > 42) {
    return {
      kicker: '0.56rem',
      title: total > 64 ? '1.06rem' : '1.22rem',
      meta: '0.88rem',
      clamp: 2,
    }
  }

  if (total > 28) {
    return {
      kicker: '0.58rem',
      title: '1.38rem',
      meta: '0.96rem',
      clamp: 2,
    }
  }

  return {
    kicker: '0.62rem',
    title: '1.7rem',
    meta: '1rem',
    clamp: 2,
  }
}

function getLessonPaperSx(currentTheme, tone) {
  if (tone === 'event') {
    return {
      bgcolor: currentTheme.board.lessonEventBg,
      borderColor: currentTheme.board.lessonEventBorder,
    }
  }

  if (tone === 'changed') {
    return {
      bgcolor: currentTheme.board.lessonChangedBg,
      borderColor: currentTheme.board.lessonChangedBorder,
    }
  }

  return {
    bgcolor: currentTheme.board.lessonDefaultBg,
    borderColor: currentTheme.board.lessonDefaultBorder,
  }
}

function getSplitEntrySizing(entry) {
  const meta = (entry.metaLines ?? []).filter(Boolean).join(' / ')
  const total = entry.title.length + entry.kicker.length + meta.length

  if (total > 26) {
    return {
      kicker: '0.48rem',
      title: '0.94rem',
      meta: '0.56rem',
    }
  }

  if (total > 18) {
    return {
      kicker: '0.5rem',
      title: '1.04rem',
      meta: '0.6rem',
    }
  }

  return {
    kicker: '0.52rem',
    title: '1.14rem',
    meta: '0.64rem',
  }
}

function CardStatusRail({ tone }) {
  if (!tone || tone === 'default' || tone === 'empty') return null

  return (
    <Box
      sx={(currentTheme) => ({
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: 7,
        bgcolor: tone === 'event' ? currentTheme.palette.success.main : currentTheme.palette.warning.main,
      })}
    />
  )
}

function LessonEntry({ entry, dense = false }) {
  const sizing = getEntrySizing(entry, dense)

  return (
    <Stack spacing={0.28} sx={{ minWidth: 0, minHeight: 0, justifyContent: 'flex-start', flex: 1, overflow: 'hidden' }}>
      {entry.kicker && (
        <Typography
          variant="overline"
          sx={(currentTheme) => ({
            fontSize: sizing.kicker,
            color: currentTheme.board.lessonKicker,
            lineHeight: 1.15,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          })}
        >
          {entry.kicker}
        </Typography>
      )}

      <Typography
        variant="h5"
        sx={{
          fontSize: sizing.title,
          lineHeight: 1.12,
          pt: '0.12em',
          pb: '0.03em',
          fontWeight: 800,
          overflowWrap: 'anywhere',
          wordBreak: 'break-word',
          display: '-webkit-box',
          overflow: 'hidden',
          WebkitBoxOrient: 'vertical',
          WebkitLineClamp: sizing.clamp,
        }}
      >
        {entry.title}
      </Typography>

      {(entry.metaLines ?? []).length > 0 && (
        <Stack spacing={0.1} sx={{ minHeight: 0 }}>
          {entry.metaLines.slice(0, 2).map((line, index) => (
            <Typography
              key={`${line}-${index}`}
              sx={(currentTheme) => ({
                fontSize: sizing.meta,
                lineHeight: 1.12,
                color: currentTheme.palette.text.secondary,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              })}
            >
              {line}
            </Typography>
          ))}
        </Stack>
      )}
    </Stack>
  )
}

function SplitLessonEntry({ entry }) {
  const sizing = getSplitEntrySizing(entry)
  const compactMeta = (entry.metaLines ?? []).filter(Boolean).join(' / ')

  return (
    <Stack
      spacing={0.04}
      sx={{
        flex: 1,
        width: '100%',
        minWidth: 0,
        minHeight: 0,
        alignItems: 'flex-start',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {entry.kicker && (
        <Typography
          variant="overline"
          sx={(currentTheme) => ({
            fontSize: sizing.kicker,
            lineHeight: 1.02,
            color: currentTheme.board.lessonKicker,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            width: '100%',
          })}
        >
          {entry.kicker}
        </Typography>
      )}

      <Typography
        variant="h6"
        sx={{
          fontSize: sizing.title,
          lineHeight: 1.06,
          pt: '0.05em',
          pb: '0.02em',
          fontWeight: 800,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          width: '100%',
        }}
      >
        {entry.title}
      </Typography>

      {compactMeta && (
        <Typography
          sx={(currentTheme) => ({
            fontSize: sizing.meta,
            lineHeight: 1.02,
            color: currentTheme.palette.text.secondary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            width: '100%',
          })}
        >
          {compactMeta}
        </Typography>
      )}
    </Stack>
  )
}

export default function LessonCard({ cell }) {
  if (!cell || cell.layout === 'blank') {
    return (
      <Paper
        sx={(currentTheme) => ({
          position: 'relative',
          height: '100%',
          borderRadius: '8px',
          bgcolor: currentTheme.board.lessonEmptyBg,
          borderColor: currentTheme.board.lessonEmptyBorder,
        })}
      />
    )
  }

  const denseEntry = cell.entries.length > 1

  return (
    <Paper
      sx={(currentTheme) => ({
        ...getLessonPaperSx(currentTheme, cell.tone),
        position: 'relative',
        height: '100%',
        borderRadius: '8px',
        px: cell.layout === 'split' ? 0.9 : 1.35,
        pt: cell.layout === 'split' ? 0.85 : 1.2,
        pb: cell.layout === 'split' ? 0.78 : 1.05,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      })}
    >
      {cell.layout === 'split' ? (
        <Stack sx={{ flex: 1, minHeight: 0, justifyContent: 'stretch', gap: 0.14, overflow: 'hidden' }}>
          {cell.entries.map((entry, index) => (
            <Box
              key={`${entry.kicker}-${entry.title}-${index}`}
              sx={(currentTheme) => ({
                flex: 1,
                display: 'flex',
                alignItems: 'stretch',
                minHeight: 0,
                pt: index === 0 ? 0 : 0.16,
                borderTop: index === 0 ? 0 : `1px solid ${currentTheme.board.lessonSplitDivider}`,
                overflow: 'hidden',
              })}
            >
              <SplitLessonEntry entry={entry} />
            </Box>
          ))}
        </Stack>
      ) : (
        <Stack spacing={denseEntry ? 0.18 : 0.5} sx={{ flex: 1, minHeight: 0, justifyContent: 'flex-start' }}>
          {cell.entries.map((entry, index) => (
            <LessonEntry key={`${entry.title}-${index}`} entry={entry} dense={denseEntry} />
          ))}
        </Stack>
      )}

      <CardStatusRail tone={cell.tone} />
    </Paper>
  )
}
