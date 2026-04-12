import { startTransition, useEffect, useMemo, useRef, useState } from 'react'

import { fetchBoardPayload, getPeriods, collectTimetableRows, collectEvents, buildPages } from '../boardData'
import { REFRESH_SECONDS } from '../constants'

export function useBoardData() {
  const [payload, setPayload] = useState(null)
  const [loading, setLoading] = useState(true)
  const inFlightRef = useRef(false)
  const hasPayloadRef = useRef(false)

  useEffect(() => {
    hasPayloadRef.current = Boolean(payload)
  }, [payload])

  useEffect(() => {
    let cancelled = false

    const loadBoard = async (isBackgroundRefresh = false) => {
      if (inFlightRef.current) return
      inFlightRef.current = true

      if (!cancelled && !(hasPayloadRef.current || isBackgroundRefresh)) {
        setLoading(true)
      }

      try {
        const next = await fetchBoardPayload()

        if (!next.lookup || !next.timetable) {
          throw new Error(next.issues[0] ?? 'Nepodařilo se načíst rozvrh.')
        }

        if (!cancelled) {
          startTransition(() => {
            setPayload(next)
          })
          hasPayloadRef.current = true
        }
      } catch (loadError) {
        console.error(loadError)
      } finally {
        inFlightRef.current = false
        if (!cancelled) setLoading(false)
      }
    }

    loadBoard(false)

    const refreshTimer = window.setInterval(() => {
      loadBoard(true)
    }, REFRESH_SECONDS * 1000)

    return () => {
      cancelled = true
      window.clearInterval(refreshTimer)
    }
  }, [])

  const periods = useMemo(() => getPeriods(payload?.lookup), [payload?.lookup])
  const timetableRows = useMemo(
    () => collectTimetableRows(payload?.timetable, payload?.lookup, periods),
    [payload?.timetable, payload?.lookup, periods],
  )
  const events = useMemo(
    () => collectEvents(payload?.events, payload?.timetable, payload?.lookup),
    [payload?.events, payload?.timetable, payload?.lookup],
  )
  const pages = useMemo(() => buildPages(timetableRows, events), [timetableRows, events])

  return {
    loading,
    hasBoardData: Boolean(payload?.lookup && payload?.timetable),
    pages,
    periods,
  }
}
