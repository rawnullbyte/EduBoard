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
  const { loading, hasBoardData, pages, periods } = useBoardData()
  const { activePage, progress } = usePageRotation(pages)
  const { clockLabel, dateParts } = useBoardClock()
  const pageTitle = getPageTitle(activePage)
  const activePageKey = activePage?.id ?? 'empty'

  return (
    <div className="board-shell">
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
