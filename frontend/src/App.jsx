import { useEffect, useRef } from 'react'
import { getPageTitle } from './board/boardData'
import AccentRail from './board/components/AccentRail'
import EmptyPage from './board/components/EmptyPage'
import ErrorBoundary from './board/components/ErrorBoundary'
import EventsPage from './board/components/EventsPage'
import SubstitutionsPage from './board/components/SubstitutionsPage'
import TimetablePage from './board/components/TimetablePage'
import TopBar from './board/components/TopBar'
import { useBoardClock } from './board/hooks/useBoardClock'
import { useBoardData } from './board/hooks/useBoardData'
import { usePageRotation } from './board/hooks/usePageRotation'
import { useScreenState } from './board/hooks/useScreenState'
import { logBorder, logScreenState, logScreenChange, logError } from './board/logger'

export default function App() {
  const { loading, hasBoardData, pages, periods, timetable } = useBoardData()
  const { showOverlay } = useScreenState(timetable, loading, hasBoardData)
  const { activePage, progress, pageIndex, pageCount } = usePageRotation(pages, showOverlay)
  const { clockLabel, dateParts } = useBoardClock()
  const pageTitle = getPageTitle(activePage)
  const activePageKey = activePage?.id ?? 'empty'
  const prevOverlayRef = useRef(showOverlay)
  const renderCountRef = useRef(0)

  renderCountRef.current++

  if (renderCountRef.current === 1) {
    logBorder('🚀 EduBoard APP MOUNTED', 'big')
    logScreenState('First render', JSON.stringify({
      loading,
      hasBoardData,
      pagesCount: pages.length,
      periodsCount: periods.length,
      hasTimetable: Boolean(timetable),
    }))
  }

  useEffect(() => {
    if (prevOverlayRef.current !== showOverlay) {
      prevOverlayRef.current = showOverlay
      if (showOverlay) {
        logBorder(
          `🔲🔲🔲 App RERENDER — overlay ON (pageRotation paused, content hidden) [render #${renderCountRef.current}]`,
          'warning',
        )
      } else {
        logBorder(
          `🟢🟢🟢 App RERENDER — overlay OFF (pageRotation resumed, content visible) [render #${renderCountRef.current}]`,
          'success',
        )
      }
    }
  }, [showOverlay])

  useEffect(() => {
    logScreenChange(
      `📄 page changed to "${pageTitle}" (#${pageIndex + 1}/${pageCount})`,
      `key=${activePageKey} type=${activePage?.type}`,
    )
  }, [activePageKey, pageTitle, pageIndex, pageCount, activePage?.type])

  return (
    <div className="board-shell">
      <div className={`board-overlay${showOverlay ? '' : ' hidden'}`}>
        {showOverlay && <div className="board-overlay-indicator" />}
      </div>

      {!showOverlay && (
        <>
          <div className="board-surface">
            <TopBar pageTitle={pageTitle} clockLabel={clockLabel} dateParts={dateParts} />
          </div>

          <AccentRail progress={progress} />

          <ErrorBoundary>
            <section
              className="board-surface"
              style={{
                minHeight: 0,
                minWidth: 0,
                overflow: 'hidden',
                padding: 'clamp(0.5rem, 0.8vw, 1rem)',
              }}
            >
              <div
                key={activePageKey}
                style={{ height: '100%', animation: 'fadeIn 220ms ease-out' }}
              >
                {loading && !hasBoardData ? (
                  <EmptyPage title="Načítám Přehled" copy="Připravuji rozvrh a školní akce." />
                ) : !hasBoardData ? (
                  <EmptyPage
                    title="Přehled Není Dostupný"
                    copy="Nepodařilo se načíst data pro obrazovku."
                  />
                ) : activePage?.type === 'timetable' ? (
                  <TimetablePage rows={activePage.rows ?? []} periods={periods} />
                ) : activePage?.type === 'events' ? (
                  <EventsPage events={activePage.events ?? []} />
                ) : activePage?.type === 'substitutions' ? (
                  <SubstitutionsPage substitutions={activePage.substitutions ?? []} />
                ) : (
                  <EmptyPage title="Bez Dat" copy="Pro tuto stránku není co zobrazit." />
                )}
              </div>
            </section>
          </ErrorBoundary>
        </>
      )}
    </div>
  )
}
