import { useMemo } from 'react'
import { getPageTitle } from './board/boardData'
import AccentRail from './board/components/AccentRail'
import EmptyPage from './board/components/EmptyPage'
import EventsPage from './board/components/EventsPage'
import SubstitutionsPage from './board/components/SubstitutionsPage'
import TimetablePage from './board/components/TimetablePage'
import TopBar from './board/components/TopBar'
import { useBoardClock } from './board/hooks/useBoardClock'
import { useBoardData } from './board/hooks/useBoardData'
import { usePageRotation } from './board/hooks/usePageRotation'

export default function App() {
  const { loading, hasBoardData, pages, periods, timetable } = useBoardData()
  const { activePage, progress } = usePageRotation(pages)
  const { now, clockLabel, dateParts } = useBoardClock()
  const pageTitle = getPageTitle(activePage)
  const activePageKey = activePage?.id ?? 'empty'

  const showOverlay = useMemo(() => {
    if (loading && !hasBoardData) return false
    if (!timetable || !timetable.classes) return false

    const allItems = timetable.classes.flatMap((cls) => cls.ttitems || [])
    if (allItems.length === 0) return true

    const h = now.getHours().toString().padStart(2, '0')
    const m = now.getMinutes().toString().padStart(2, '0')
    const nowStr = `${h}:${m}`

    const isInClass = allItems.some((item) => item.starttime <= nowStr && nowStr < item.endtime)

    const startTimes = allItems.map((item) => item.starttime).filter(Boolean)
    const endTimes = allItems.map((item) => item.endtime).filter(Boolean)

    if (startTimes.length === 0 || endTimes.length === 0) return true

    const schoolStart = startTimes.reduce((a, b) => (a < b ? a : b))
    const schoolEnd = endTimes.reduce((a, b) => (a > b ? a : b))

    const isSchoolTime = nowStr >= schoolStart && nowStr < schoolEnd

    return !(isSchoolTime && !isInClass)
  }, [timetable, now, loading, hasBoardData])

  return (
    <div className="board-shell">
      {showOverlay && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'black',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        />
      )}
      <div className="board-surface">
        <TopBar pageTitle={pageTitle} clockLabel={clockLabel} dateParts={dateParts} />
      </div>

      <AccentRail progress={progress} />

      <section className="board-surface" style={{ minHeight: 0, minWidth: 0, overflow: 'hidden', padding: 'clamp(0.5rem, 0.8vw, 1rem)' }}>
        <div key={activePageKey} style={{ height: '100%', animation: 'fadeIn 220ms ease-out' }}>
          {loading && !hasBoardData ? (
            <EmptyPage title="Načítám Přehled" copy="Připravuji rozvrh a školní akce." />
          ) : !hasBoardData ? (
            <EmptyPage title="Přehled Není Dostupný" copy="Nepodařilo se načíst data pro obrazovku." />
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
    </div>
  )
}
