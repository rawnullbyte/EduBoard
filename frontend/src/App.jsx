import Box from '@mui/material/Box'
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'

import { getPageTitle } from './board/boardData'
import AccentRail from './board/components/AccentRail'
import EmptyPage from './board/components/EmptyPage'
import EventsPage from './board/components/EventsPage'
import TimetablePage from './board/components/TimetablePage'
import TopBar from './board/components/TopBar'
import { useBoardClock } from './board/hooks/useBoardClock'
import { useBoardData } from './board/hooks/useBoardData'
import { usePageRotation } from './board/hooks/usePageRotation'
import theme from './board/theme'

export default function App() {
  const { loading, hasBoardData, pages, periods } = useBoardData()
  const { activePage, progress } = usePageRotation(pages)
  const { clockLabel, dateParts } = useBoardClock()
  const pageTitle = getPageTitle(activePage)

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />

      <Box
        sx={{
          width: '100%',
          height: '100%',
          display: 'grid',
          gridTemplateRows: 'auto 4px minmax(0, 1fr)',
          overflow: 'hidden',
          p: 1,
          gap: 1,
        }}
      >
        <TopBar pageTitle={pageTitle} clockLabel={clockLabel} dateParts={dateParts} />

        <AccentRail progress={progress} />

        <Box
          sx={{
            minHeight: 0,
            minWidth: 0,
            overflow: 'hidden',
          }}
        >
          {loading && !hasBoardData ? (
            <EmptyPage title="Načítám Přehled" copy="Připravuji rozvrh a školní akce." />
          ) : !hasBoardData ? (
            <EmptyPage title="Přehled Není Dostupný" copy="Nepodařilo se načíst data pro obrazovku." />
          ) : (
            activePage?.type === 'timetable' ? (
              <TimetablePage rows={activePage.rows ?? []} periods={periods} />
            ) : activePage?.type === 'events' ? (
              <EventsPage events={activePage.events ?? []} />
            ) : (
              <EmptyPage title="Bez Dat" copy="Pro tuto stránku není co zobrazit." />
            )
          )}
        </Box>
      </Box>
    </ThemeProvider>
  )
}
