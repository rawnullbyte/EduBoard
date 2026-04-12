import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

function normalizeInlineText(value) {
  return String(value ?? '')
    .replace(/\s*\n\s*/g, ', ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getEventPageConfig(count) {
  const showcase = count === 1
  const large = count <= 2
  const medium = count <= 4

  return {
    showcase,
    large,
    medium,
    columns: showcase
      ? 'minmax(0, 1fr)'
      : count === 2
        ? 'repeat(2, minmax(0, 1fr))'
        : count <= 4
          ? 'repeat(2, minmax(0, 1fr))'
          : 'repeat(3, minmax(0, 1fr))',
    rows: count <= 2 ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))',
    cardPx: showcase ? 2.6 : large ? 2.7 : 2.2,
    cardPy: showcase ? 2.3 : large ? 2.15 : 1.9,
    chipFont: showcase ? '1.08rem' : large ? '1rem' : '0.92rem',
    titleFont: showcase ? 'clamp(2.4rem, 4vw, 4.2rem)' : large ? 'clamp(1.7rem, 2.1vw, 2.2rem)' : medium ? '1.7rem' : 'clamp(1.32rem, 1.45vw, 1.54rem)',
    titleClamp: showcase ? 4 : 2,
    bodyFont: showcase ? 'clamp(1.24rem, 1.7vw, 1.7rem)' : large ? '1.15rem' : '0.98rem',
    detailFont: showcase ? 'clamp(1.08rem, 1.35vw, 1.34rem)' : large ? '0.96rem' : '0.82rem',
    labelFont: showcase ? '0.92rem' : large ? '0.76rem' : '0.68rem',
    lineGap: showcase ? 0.35 : large ? 0.55 : 0.42,
    sectionGap: showcase ? 1.15 : large ? 0.9 : 0.62,
    classesClamp: showcase ? null : large ? 4 : 3,
    detailClamp: showcase ? null : 3,
    maxWidth: '100%',
  }
}

function EventInfoBlock({ block, config }) {
  return (
    <Stack
      spacing={config.lineGap}
      sx={{
        minWidth: 0,
        minHeight: 0,
        height: 'auto',
        overflow: 'hidden',
      }}
    >
      <Typography
        variant="overline"
        sx={(currentTheme) => ({
          fontSize: config.labelFont,
          lineHeight: 1,
          color: currentTheme.board.eventLabel,
        })}
      >
        {block.label}
      </Typography>
      <Typography
        sx={{
          fontSize: block.label === 'Třídy' ? config.bodyFont : config.detailFont,
          fontWeight: block.label === 'Třídy' ? 800 : 600,
          lineHeight: 1.16,
          whiteSpace: 'normal',
          overflowWrap: 'anywhere',
          wordBreak: 'break-word',
          ...(block.label === 'Třídy' ? (config.classesClamp ? {
            display: '-webkit-box',
            overflow: 'hidden',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: config.classesClamp,
          } : {}) : (config.detailClamp ? {
            display: '-webkit-box',
            overflow: 'hidden',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: config.detailClamp,
          } : {})),
        }}
      >
        {normalizeInlineText(block.value)}
      </Typography>
    </Stack>
  )
}

function EventCard({ event, config }) {
  const infoBlocks = [
    { label: 'Třídy', value: event.classesLabel },
    { label: 'Učebny', value: event.roomLabel },
    { label: 'Vyučující', value: event.teacherLabel },
  ].filter((block) => block.value)

  return (
    <Paper
      sx={(currentTheme) => ({
        borderRadius: '10px',
        bgcolor: currentTheme.board.eventCardBg,
        borderColor: currentTheme.board.eventCardBorder,
        px: config.cardPx,
        py: config.cardPy,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      })}
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          gridTemplateRows: 'auto minmax(0, 1fr)',
          minHeight: 0,
          height: '100%',
        }}
      >
        <Stack spacing={config.showcase ? 1.35 : 1.15} sx={{ minHeight: 0, maxWidth: config.maxWidth, minWidth: 0 }}>
          <Box
            sx={(currentTheme) => ({
              alignSelf: 'flex-start',
              px: config.showcase ? 1.8 : 1.35,
              py: config.showcase ? 0.78 : 0.62,
              borderRadius: '999px',
              bgcolor: currentTheme.board.eventChipBg,
            })}
          >
            <Typography sx={{ fontSize: config.chipFont, fontWeight: 900 }}>{event.timeLabel}</Typography>
          </Box>

          <Typography
            variant="h4"
            sx={{
              fontSize: config.titleFont,
              lineHeight: 1.02,
              fontWeight: 900,
              letterSpacing: '-0.035em',
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
              display: '-webkit-box',
              overflow: 'hidden',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: config.titleClamp,
            }}
          >
            {event.title}
          </Typography>
        </Stack>

        {config.showcase ? (
          <Stack
            spacing={config.sectionGap}
            sx={{
              minHeight: 0,
              minWidth: 0,
              pt: 1.6,
              justifyContent: 'flex-start',
              overflow: 'hidden',
            }}
          >
            {infoBlocks.map((block) => (
              <EventInfoBlock key={block.label} block={block} config={config} />
            ))}
          </Stack>
        ) : (
          <Stack
            spacing={config.sectionGap}
            sx={{
              minHeight: 0,
              minWidth: 0,
              pt: 1.15,
              justifyContent: 'flex-start',
              overflow: 'hidden',
            }}
          >
            {infoBlocks.map((block) => (
              <EventInfoBlock key={block.label} block={block} config={config} />
            ))}
          </Stack>
        )}
      </Box>
    </Paper>
  )
}

export default function EventsPage({ events }) {
  const config = getEventPageConfig(events.length)

  if (!events.length) {
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
          <Typography variant="h3">Bez akcí</Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: '1.3rem' }}>
            Na dnešní den nejsou zapsané žádné školní události.
          </Typography>
        </Stack>
      </Paper>
    )
  }

  return (
    <Paper
      sx={(currentTheme) => ({
        width: '100%',
        height: '100%',
        p: 0.8,
        borderRadius: '12px',
        bgcolor: currentTheme.board.eventPageBg,
        borderColor: currentTheme.board.eventPageBorder,
      })}
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: config.columns,
          gridTemplateRows: config.rows,
          gap: 1.05,
          width: '100%',
          height: '100%',
        }}
      >
        {events.map((event) => (
          <EventCard key={event.key} event={event} config={config} />
        ))}
      </Box>
    </Paper>
  )
}
