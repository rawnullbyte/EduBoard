import { useEffect, useMemo, useState } from 'react'
import { logClockTick, logBorder } from '../logger'
import { formatClock, formatDateParts } from '../formatters'

export function useBoardClock() {
  const [now, setNow] = useState(new Date())
  let tickCount = 0

  logBorder('⏰ useBoardClock MOUNTED', 'big')

  useEffect(() => {
    logClockTick('⏱ 1s clock interval started', '')

    const timer = window.setInterval(() => {
      tickCount++
      const t = new Date()
      setNow(t)

      // Log every 15 seconds (not every second to avoid spam)
      if (tickCount % 15 === 0) {
        logClockTick(
          `🕐 ${formatClock(t)} — ${t.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}`,
          `tick#${tickCount} ISO=${t.toISOString()}`,
        )
      }
    }, 1000)

    return () => {
      window.clearInterval(timer)
      logClockTick('⏱ clock interval CLEARED', '')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const dateParts = useMemo(() => formatDateParts(now), [now])

  return {
    now,
    clockLabel: formatClock(now),
    dateParts,
  }
}
