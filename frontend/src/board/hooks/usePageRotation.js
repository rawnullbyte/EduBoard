import { useEffect, useRef, useState } from 'react'

import { DEBUG_HOLD_SECONDS, ROTATE_SECONDS } from '../constants'

export function usePageRotation(pages) {
  const [pageIndex, setPageIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const manualPageUntilRef = useRef(0)
  const cycleStartedAtRef = useRef(0)
  const pageCount = pages.length
  const safePageIndex = pageCount > 0 ? Math.min(pageIndex, pageCount - 1) : 0
  const activePage = pages[safePageIndex] ?? pages[0]

  useEffect(() => {
    cycleStartedAtRef.current = Date.now()
  }, [safePageIndex, pageCount])

  useEffect(() => {
    if (pageCount <= 1) return undefined

    const timer = window.setInterval(() => {
      if (Date.now() < manualPageUntilRef.current) {
        cycleStartedAtRef.current = Date.now()
        setProgress(0)
        return
      }

      const elapsed = Date.now() - cycleStartedAtRef.current
      const nextProgress = Math.min(100, (elapsed / (ROTATE_SECONDS * 1000)) * 100)

      if (nextProgress >= 100) {
        cycleStartedAtRef.current = Date.now()
        setProgress(0)
        setPageIndex((currentIndex) => ((currentIndex < pageCount ? currentIndex : 0) + 1) % pageCount)
        return
      }

      setProgress(nextProgress)
    }, 200)

    return () => window.clearInterval(timer)
  }, [pageCount])

  useEffect(() => {
    globalThis.__boardDebug = {
      pageCount,
      getPageIndex: () => safePageIndex,
      setPageIndex: (nextIndex) => {
        const safeIndex = Math.max(0, Math.min(pageCount - 1, Number(nextIndex) || 0))
        manualPageUntilRef.current = Date.now() + DEBUG_HOLD_SECONDS * 1000
        cycleStartedAtRef.current = Date.now()
        setProgress(0)
        setPageIndex(safeIndex)
      },
      holdRotation: (seconds = DEBUG_HOLD_SECONDS) => {
        manualPageUntilRef.current = Date.now() + Math.max(1, Number(seconds) || DEBUG_HOLD_SECONDS) * 1000
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
