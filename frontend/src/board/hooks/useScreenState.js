import { useEffect, useRef, useState } from 'react'
import { logBorder, logScreenState, logScreenTick, logScreenChange, logError } from '../logger'

export function useScreenState(timetable, loading, hasBoardData) {
  const [showOverlay, setShowOverlay] = useState(false)
  const showOverlayRef = useRef(false)
  const timetableRef = useRef(timetable)
  const loadingRef = useRef(loading)
  const hasDataRef = useRef(hasBoardData)

  logBorder('📟 useScreenState MOUNTED — checking overlay logic every 1s', 'big')
  logScreenState('INITIALIZED', JSON.stringify({
    loading,
    hasBoardData,
    timetableAvailable: Boolean(timetable?.classes),
    classCount: timetable?.classes?.length ?? 0,
  }))

  // Keep refs current so the 1s interval always reads fresh values
  timetableRef.current = timetable
  loadingRef.current = loading
  hasDataRef.current = hasBoardData

  useEffect(() => {
    logScreenState('⏱ Interval started (1s tick)', '')

    const timer = setInterval(() => {
      const t = new Date()
      const timeStr = `${t.getHours().toString().padStart(2, '0')}:${t.getMinutes().toString().padStart(2, '0')}:${t.getSeconds().toString().padStart(2, '0')}`
      const deviceTime = `${t.getHours().toString().padStart(2, '0')}:${t.getMinutes().toString().padStart(2, '0')}`
      const nowHrs = t.getHours() + t.getMinutes() / 60

      // No data loaded yet — show content (no overlay)
      if (loadingRef.current && !hasDataRef.current) {
        logScreenTick(`⌛ loading=true, no data yet — showing content (overlay off) [${timeStr}]`, '')
        if (showOverlayRef.current) {
          logScreenChange('⛔ overlay→off (was on, now data loading)', `time=${deviceTime}`)
          showOverlayRef.current = false
          setShowOverlay(false)
        }
        return
      }

      // No timetable available — show content
      if (!timetableRef.current?.classes) {
        logScreenTick(`⚠️ no timetable.classes — overlay off [${timeStr}]`, `timetable=${Boolean(timetableRef.current)}`)
        if (showOverlayRef.current) {
          logScreenChange('⛔ overlay→off (no timetable data)', `time=${deviceTime}`)
          showOverlayRef.current = false
          setShowOverlay(false)
        }
        return
      }

      const nowStr = deviceTime
      const allItems = timetableRef.current.classes.flatMap((cls) => cls.ttitems ?? [])

      logScreenTick(`⚡ [${timeStr}] checking ${allItems.length} timetable items`, '')

      if (allItems.length === 0) {
        logScreenTick('📭 no ttitems — treating as break (overlay on)', '')
        if (!showOverlayRef.current) {
          logScreenChange('✅ overlay→ON (no ttitems, break time)', `time=${deviceTime}`)
          showOverlayRef.current = true
          setShowOverlay(true)
        }
        return
      }

      const isInClass = allItems.some(
        (item) => item.starttime <= nowStr && nowStr < item.endtime,
      )
      const startTimes = allItems.map((i) => i.starttime).filter(Boolean)
      const endTimes = allItems.map((i) => i.endtime).filter(Boolean)

      if (startTimes.length === 0 || endTimes.length === 0) {
        logScreenTick('⚠️ empty start/end times — overlay on', '')
        if (!showOverlayRef.current) {
          logScreenChange('✅ overlay→ON (missing time boundaries)', `time=${deviceTime}`)
          showOverlayRef.current = true
          setShowOverlay(true)
        }
        return
      }

      const schoolStart = startTimes.reduce((a, b) => (a < b ? a : b))
      const schoolEnd = endTimes.reduce((a, b) => (a > b ? a : b))
      const isSchoolTime = nowStr >= schoolStart && nowStr < schoolEnd
      const next = !(isSchoolTime && !isInClass)

      // Log time comparison every tick
      logScreenTick(
        `⏳ school=${schoolStart}-${schoolEnd} now=${nowStr} inClass=${isInClass} isSchoolTime=${isSchoolTime} overlay=${next}`,
        `deviceHours=${nowHrs.toFixed(2)}`,
      )

      if (next !== showOverlayRef.current) {
        if (next) {
          logScreenChange(
            `✅ overlay→ON (transition)`,
            `time=${deviceTime} school=${schoolStart}-${schoolEnd} inClass=${isInClass} isSchoolTime=${isSchoolTime}`,
          )
          logBorder(
            `🔲🔲🔲 OVERLAY ACTIVATED [${deviceTime}] — ` +
            (isInClass ? 'IN CLASS (showing lesson info)' : 'BREAK / AFTER SCHOOL'),
            'warning',
          )
        } else {
          logScreenChange(
            `⛔ overlay→OFF (transition)`,
            `time=${deviceTime} school=${schoolStart}-${schoolEnd} inClass=${isInClass} isSchoolTime=${isSchoolTime}`,
          )
          logBorder(
            `🟢🟢🟢 OVERLAY DEACTIVATED [${deviceTime}] — content visible`,
            'success',
          )
        }
        showOverlayRef.current = next
        setShowOverlay(next)
      }
    }, 1000)

    return () => {
      clearInterval(timer)
      logScreenState('⏱ Interval CLEARED (unmount)', '')
    }
  }, [])

  return { showOverlay }
}
