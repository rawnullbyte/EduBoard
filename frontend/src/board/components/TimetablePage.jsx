import { Fragment } from 'react'

import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'

import { CLASSES_PER_PAGE } from '../constants'
import LessonCard from './LessonCard'

export default function TimetablePage({ rows, periods }) {
  const paddedRows = [...rows]

  while (paddedRows.length < CLASSES_PER_PAGE) paddedRows.push(null)

  return (
    <Paper
      sx={(currentTheme) => ({
        width: '100%',
        height: '100%',
        p: 0.5,
        borderRadius: '12px',
        bgcolor: currentTheme.board.timetablePageBg,
        borderColor: currentTheme.board.timetablePageBorder,
      })}
    >
      <Paper
        component="div"
        sx={(currentTheme) => ({
          display: 'grid',
          gridTemplateColumns: `minmax(120px, 10vw) repeat(${periods.length}, minmax(0, 1fr))`,
          gridTemplateRows: `minmax(78px, 9vh) repeat(${CLASSES_PER_PAGE}, minmax(0, 1fr))`,
          gap: 0.5,
          width: '100%',
          height: '100%',
          bgcolor: currentTheme.board.transparent,
          border: 0,
        })}
      >
        <Paper
          sx={(currentTheme) => ({
            borderRadius: '8px',
            bgcolor: currentTheme.board.timetableHeaderBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          })}
        >
          <Typography variant="overline" sx={{ fontSize: '0.9rem', color: 'text.secondary' }}>
            Třída
          </Typography>
        </Paper>

        {periods.map((period) => (
          <Paper
            key={period.period}
            sx={(currentTheme) => ({
              borderRadius: '8px',
              bgcolor: currentTheme.board.timetableHeaderBg,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              px: 0.5,
            })}
          >
            <Typography variant="h5" sx={{ fontSize: '1.7rem', color: 'primary.main', lineHeight: 0.9 }}>
              {period.short}
            </Typography>
            <Typography
              sx={{
                mt: 0.15,
                fontSize: '0.82rem',
                lineHeight: 1.02,
                color: 'text.secondary',
                textAlign: 'center',
                fontWeight: 800,
              }}
            >
              {period.start}
              <br />
              {period.end}
            </Typography>
          </Paper>
        ))}

        {paddedRows.map((row, rowIndex) => (
          <Fragment key={row?.id ?? `empty-row-${rowIndex}`}>
            <Paper
              sx={(currentTheme) => ({
                borderRadius: '8px',
                bgcolor: row ? currentTheme.board.timetableRowBg : currentTheme.board.timetableEmptyRowBg,
                borderColor: row ? currentTheme.board.timetableRowBorder : currentTheme.board.timetableEmptyRowBorder,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                px: 1,
              })}
            >
              <Typography
                variant="h4"
                sx={(currentTheme) => ({
                  fontSize: '2.6rem',
                  fontWeight: 900,
                  color: row ? currentTheme.palette.primary.main : currentTheme.palette.text.disabled,
                  lineHeight: 0.88,
                  letterSpacing: '-0.03em',
                  textAlign: 'center',
                })}
              >
                {row?.name ?? '—'}
              </Typography>
            </Paper>

            {periods.map((period) => (
              <LessonCard
                key={`${row?.id ?? `empty-${rowIndex}`}-${period.period}`}
                cell={row?.cells?.[String(period.period)] ?? null}
              />
            ))}
          </Fragment>
        ))}
      </Paper>
    </Paper>
  )
}
