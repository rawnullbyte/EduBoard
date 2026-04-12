import { useEffect, useMemo, useState } from 'react'

import { formatClock, formatDateParts } from '../formatters'

export function useBoardClock() {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date())
    }, 1000)

    return () => window.clearInterval(timer)
  }, [])

  const dateParts = useMemo(() => formatDateParts(now), [now])

  return {
    clockLabel: formatClock(now),
    dateParts,
  }
}
