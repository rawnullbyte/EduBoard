import { useEffect, useRef, useState } from 'react'
import { logPageRotation, logScreenChange, logBorder } from '../logger'
import { DEBUG_HOLD_SECONDS, ROTATE_SECONDS } from '../constants'

export function usePageRotation(pages, paused = false) {
  const [pageIndex, setPageIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const manualPageUntilRef = useRef(0)
  const cycleStartedAtRef = useRef(0)
  const pageCount = pages.length
  const safePageIndex = pageCount > 0 ? Math.min(pageIndex, pageCount - 1) : 0
  const activePage = pages[safePageIndex] ?? pages[0]
  const prevPausedRef = useRef(paused)
  const tickIndexRef = useRef(0)

  // Log mount
  useEffect(() => {
    logPageRotation('MOUNTED', JSON.stringify({ pageCount, rotateSeconds: ROTATE_SECONDS, initialPaused: paused }))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Log pause/resume transitions
  useEffect(() => {
    if (prevPausedRef.current !== paused) {
      prevPausedRef.current = paused
      if (paused) {
        logBorder(
          `⏸️⏸️⏸️ PAGE ROTATION PAUSED (overlay active) — ${pageCount} pages, current #${safePageIndex + 1}`,
          'warning',
        )
      } else {
        logBorder(
          `▶️▶️▶️ PAGE ROTATION RESUMED (overlay hidden) — ${pageCount} pages, resumed #${safePageIndex + 1}`,
          'success',
        )
      }
    }
  }, [paused, pageCount, safePageIndex])

  useEffect(() => {
    cycleStartedAtRef.current = Date.now()
    logPageRotation(`📄 showing page #${safePageIndex + 1}/${pageCount}`, `type=${activePage?.type} id=${activePage?.id}`)
  }, [safePageIndex, pageCount, activePage?.id, activePage?.type])

  useEffect(() => {
    if (pageCount <= 1) {
      logPageRotation(`⏸ only ${pageCount} page(s) — rotation disabled`, '')
      return undefined
    }

    const timer = window.setInterval(() => {
      tickIndexRef.current++

      if (Date.now() < manualPageUntilRef.current) {
        cycleStartedAtRef.current = Date.now()
        if (progress !== 0) setProgress(0)
        if (tickIndexRef.current % 25 === 0) {
          logPageRotation(`⏳ holding manual page (${Math.ceil((manualPageUntilRef.current - Date.now()) / 1000)}s remaining)`, '')
        }
        return
      }

      if (paused) {
        cycleStartedAtRef.current = Date.now()
        if (progress !== 0) setProgress(0)
        return
      }

      const elapsed = Date.now() - cycleStartedAtRef.current
      const nextProgress = Math.min(100, (elapsed / (ROTATE_SECONDS * 1000)) * 100)

      // Log progress milestones
      if (tickIndexRef.current % 50 === 0) {
        logPageRotation(
          `⏩ progress=${nextProgress.toFixed(1)}% elapsed=${(elapsed / 1000).toFixed(1)}s/${ROTATE_SECONDS}s page=#${safePageIndex + 1}/${pageCount}`,
          '',
        )
      }

      if (nextProgress >= 100) {
        const nextIdx = ((safePageIndex + 1) % pageCount)
        logBorder(
          `📄📄📄 PAGE ROTATION: #${safePageIndex + 1} → #${nextIdx + 1}/${pageCount} (timer complete)`,
          'info',
        )
        cycleStartedAtRef.current = Date.now()
        setProgress(0)
        setPageIndex(nextIdx)
        return
      }

      setProgress(nextProgress)
    }, 200)

    return () => {
      window.clearInterval(timer)
      logPageRotation('⏱ rotation interval CLEARED', '')
    }
  }, [pageCount, paused, safePageIndex, progress])

  useEffect(() => {
    globalThis.__boardDebug = {
      pageCount,
      getPageIndex: () => safePageIndex,
      setPageIndex: (nextIndex) => {
        const safeIndex = Math.max(0, Math.min(pageCount - 1, Number(nextIndex) || 0))
        logPageRotation(`🔄 MANUAL page set to #${safeIndex + 1}`, `from #${safePageIndex + 1}`)
        manualPageUntilRef.current = Date.now() + DEBUG_HOLD_SECONDS * 1000
        cycleStartedAtRef.current = Date.now()
        setProgress(0)
        setPageIndex(safeIndex)
      },
      holdRotation: (seconds = DEBUG_HOLD_SECONDS) => {
        const s = Math.max(1, Number(seconds) || DEBUG_HOLD_SECONDS)
        logPageRotation(`⏸ MANUAL hold for ${s}s`, '')
        manualPageUntilRef.current = Date.now() + s * 1000
        cycleStartedAtRef.current = Date.now()
        setProgress(0)
      },
      pages: pages.map((page) => ({ id: page.id, type: page.type })),
    }

    return () => {
      delete globalThis.__boardDebug
    }
  }, [pageCount, pages, safePageIndex])

  return {
    activePage,
    pageCount,
    pageIndex: safePageIndex,
    progress: pageCount <= 1 ? 100 : progress,
  }
}
