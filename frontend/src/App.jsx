import { useState, useEffect, useMemo, useCallback } from 'react'

const CYCLE_TIME = 12
const REFRESH_INTERVAL = 60
const ROWS_PER_PAGE = 4   // 4 classes per page for TV readability

// ─── colour: extract hue for left-border accent only, keep bg near-black ─────
function parseRGB(raw) {
  if (!raw) return null
  const s = raw.trim()
  if (s.startsWith('#')) {
    const h = s.replace('#', '').padEnd(6, '0')
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
  }
  const m = s.match(/rgba?\(([^)]+)\)/)
  if (m) {
    const p = m[1].split(',').map(x => parseFloat(x.trim()))
    return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0]
  }
  return null
}

// Subtle bg: 10% hue blended into near-black
function subtleBg(raw) {
  const c = parseRGB(raw)
  if (!c) return '#1a1d26'
  const [r, g, b] = c
  return `rgb(${Math.round(r * .10 + 18 * .90)},${Math.round(g * .10 + 19 * .90)},${Math.round(b * .10 + 26 * .90)})`
}

// Vivid-ish accent for left border: 70% hue but desaturated toward mid-grey
function accentColor(raw) {
  const c = parseRGB(raw)
  if (!c) return '#3a5f9a'
  const [r, g, b] = c
  // desaturate 30% then clamp brightness so it's visible but not neon
  const avg = (r + g + b) / 3
  const dr = r * .7 + avg * .3, dg = g * .7 + avg * .3, db = b * .7 + avg * .3
  // scale so max channel = 180 (avoids blinding white-ish colours)
  const max = Math.max(dr, dg, db, 1)
  const scale = Math.min(1, 180 / max)
  return `rgb(${Math.round(dr * scale)},${Math.round(dg * scale)},${Math.round(db * scale)})`
}

// ─── lookup helpers ───────────────────────────────────────────────────────────
const getCls = (lu, id) => lu?.classes?.data?.[id] ?? id
const getSubj = (lu, id) => lu?.subjects?.data?.[id] ?? id
const getRoom = (lu, id) => lu?.classrooms?.data?.[id] ?? id
const getTeach = (lu, id) => lu?.teachers?.data?.[id] ?? id
const getPeriods = lu =>
  Object.values(lu?.periods?.data ?? {}).sort((a, b) => Number(a.period) - Number(b.period))

// ─── fetch ────────────────────────────────────────────────────────────────────
async function fetchAll() {
  const [lu, tt, ev, sub] = await Promise.allSettled([
    fetch('/api/data').then(r => { if (!r.ok) throw r.status; return r.json() }),
    fetch('/api/timetable').then(r => { if (!r.ok) throw r.status; return r.json() }),
    fetch('/api/events').then(r => { if (!r.ok) throw r.status; return r.json() }),
    fetch('/api/substitutions').then(r => { if (!r.ok) throw r.status; return r.json() }),
  ])
  return {
    lookup: lu.status === 'fulfilled' ? lu.value : null,
    timetable: tt.status === 'fulfilled' ? tt.value : null,
    events: ev.status === 'fulfilled' ? ev.value : null,
    substitutions: sub.status === 'fulfilled' ? sub.value : null,
  }
}

// ─── tokens ───────────────────────────────────────────────────────────────────
// Pure white on pure black — maximum TV contrast
const C = {
  bg: '#0d0f14',
  bgCard: '#13161f',
  bgCardHi: '#181c28',
  surface: '#1e2235',
  white: '#ffffff',
  bright: '#e8ecff',   // slightly warm white for body
  mid: '#8890b0',   // secondary text — still readable from distance
  dim: '#454a65',   // tertiary / decorative
  blue: '#6fa3e8',   // primary accent
  blueDim: '#2a4a7a',
  red: '#ff6b6b',
  redDim: '#5c1a1a',
  amber: '#ffcc44',
  amberDim: '#4a3000',
  green: '#66cc88',
  border: '#252840',
}

// ─── lesson cell — big, bold, TV-legible ─────────────────────────────────────
function LessonCell({ items, lookup, sub }) {
  const card = items.find(i => i.type === 'card')
  const event = items.find(i => i.type === 'event')

  // empty
  if (!card && !event && !sub) return (
    <div style={{ borderRadius: 12, background: C.bgCard, opacity: .25 }} />
  )

  // substitution overrides the cell
  if (sub) {
    const cancelled = sub.removed || sub.type === 'absence'
    const accent = cancelled ? C.red : C.amber
    const accentDim = cancelled ? C.redDim : C.amberDim
    const color = sub.colors?.[0] ?? card?.colors?.[0]
    return (
      <div style={{
        borderRadius: 12,
        background: subtleBg(color),
        border: `1.5px solid ${accentDim}`,
        borderLeft: `4px solid ${accent}`,
        padding: '10px 14px',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        overflow: 'hidden', gap: 6, position: 'relative',
      }}>
        {/* type badge */}
        <span style={{
          position: 'absolute', top: 6, right: 8,
          fontSize: 13, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase',
          color: accent,
        }}>
          {cancelled ? '✕ ODPADÁ' : '↔ SUP.'}
        </span>

        <div style={{
          fontSize: 'clamp(16px,2.2vw,26px)', fontWeight: 800,
          color: cancelled ? C.mid : C.white,
          textTransform: 'uppercase', letterSpacing: '.04em',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          paddingRight: 100,
          textDecoration: cancelled ? 'line-through' : 'none',
        }}>
          {cancelled
            ? (card ? getSubj(lookup, card.subjectid) : '—')
            : (sub.subjectid ? getSubj(lookup, sub.subjectid) : (card ? getSubj(lookup, card.subjectid) : '—'))
          }
        </div>

        {!cancelled && (
          <div style={{ fontSize: 'clamp(13px,1.6vw,19px)', color: C.mid, fontWeight: 500 }}>
            {[...(sub.teacherids ?? card?.teacherids ?? [])].map(id => getTeach(lookup, id)).join(', ')}
            {' · '}
            {[...(sub.classroomids ?? card?.classroomids ?? [])].map(id => getRoom(lookup, id)).join(', ') || '—'}
          </div>
        )}
      </div>
    )
  }

  // event (no card)
  if (!card) return (
    <div style={{
      borderRadius: 12,
      background: subtleBg(event.colors?.[0]),
      borderLeft: `4px solid ${accentColor(event.colors?.[0])}`,
      border: `1.5px solid ${C.border}`,
      borderLeft: `4px solid ${accentColor(event.colors?.[0])}`,
      padding: '10px 14px',
      display: 'flex', alignItems: 'center', overflow: 'hidden',
    }}>
      <span style={{
        fontSize: 'clamp(13px,1.6vw,18px)', fontWeight: 600, color: C.mid, lineHeight: 1.35,
        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {(event.name ?? '').split(':').pop().trim()}
      </span>
    </div>
  )

  // regular card
  const rooms = (card.classroomids ?? []).map(id => getRoom(lookup, id)).join(', ')
  const teachers = (card.teacherids ?? []).map(id => getTeach(lookup, id)).join(', ')
  const accent = accentColor(card.colors?.[0])

  return (
    <div style={{
      borderRadius: 12,
      background: subtleBg(card.colors?.[0]),
      border: `1.5px solid ${C.border}`,
      borderLeft: `4px solid ${accent}`,
      padding: '10px 14px',
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      overflow: 'hidden', gap: 5,
    }}>
      <div style={{
        fontSize: 'clamp(18px,2.4vw,30px)', fontWeight: 800,
        color: C.white, textTransform: 'uppercase', letterSpacing: '.04em',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        lineHeight: 1.1,
      }}>
        {getSubj(lookup, card.subjectid)}
      </div>
      <div style={{
        fontSize: 'clamp(13px,1.6vw,20px)', color: C.mid, fontWeight: 500,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {[rooms, teachers].filter(Boolean).join('  ·  ')}
      </div>
    </div>
  )
}

// ─── timetable ────────────────────────────────────────────────────────────────
function TimetableView({ rows, lookup, subs }) {
  const periods = getPeriods(lookup)

  const subMap = useMemo(() => {
    const map = {}
      ; (subs?.classes ?? []).forEach(cls => {
        ; (cls.ttitems ?? []).forEach(item => {
          if (item.changed || item.removed || item.type === 'absence') {
            if (!map[cls.id]) map[cls.id] = {}
            map[cls.id][String(item.uniperiod)] = item
          }
        })
      })
    return map
  }, [subs])

  return (
    <div style={{
      flex: 1, display: 'grid', gap: 8, overflow: 'hidden',
      gridTemplateColumns: `160px repeat(${periods.length},1fr)`,
      gridTemplateRows: `52px repeat(${rows.length},1fr)`,
    }}>
      {/* corner */}
      <div style={{ borderRadius: 12, background: C.bgCard }} />

      {/* period headers */}
      {periods.map(p => (
        <div key={p.period} style={{
          background: C.surface, borderRadius: 12,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
        }}>
          <span style={{ fontSize: 'clamp(18px,2.5vw,32px)', fontWeight: 900, color: C.blue, lineHeight: 1 }}>
            {p.short}
          </span>
          <span style={{ fontSize: 'clamp(11px,1.3vw,15px)', color: C.mid, lineHeight: 1.3, textAlign: 'center', fontWeight: 500 }}>
            {p.start}–{p.end}
          </span>
        </div>
      ))}

      {/* class rows */}
      {rows.map(row => (
        <div key={row.id} style={{ display: 'contents' }}>
          <div style={{
            borderRadius: 12, background: C.surface,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 'clamp(20px,2.8vw,38px)', fontWeight: 900,
            color: C.white, letterSpacing: '-.01em',
          }}>
            {getCls(lookup, row.id)}
          </div>
          {periods.map(p => {
            const pStr = String(p.period)
            const items = (row.ttitems ?? []).filter(i => String(i.uniperiod) === pStr)
            return (
              <LessonCell
                key={p.period}
                items={items}
                lookup={lookup}
                sub={subMap[row.id]?.[pStr] ?? null}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}

// ─── substitutions view ───────────────────────────────────────────────────────
function SubstitutionsView({ subs, lookup }) {
  const periods = getPeriods(lookup)
  const periodMap = Object.fromEntries(periods.map(p => [String(p.period), p]))

  const items = useMemo(() => {
    const out = []
      ; (subs?.classes ?? []).forEach(cls => {
        ; (cls.ttitems ?? []).forEach(item => {
          if (item.changed || item.removed || ['absence', 'substitution'].includes(item.type)) {
            out.push({ ...item, _classId: cls.id })
          }
        })
      })
    return out.sort((a, b) => Number(a.uniperiod) - Number(b.uniperiod))
  }, [subs])

  if (!items.length) return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, opacity: .4 }}>
      <span style={{ fontSize: 52 }}>✓</span>
      <span style={{ fontSize: 'clamp(18px,2.5vw,28px)', color: C.mid, fontWeight: 600 }}>Dnes žádné suplování</span>
    </div>
  )

  const cols = '80px 140px 1fr 1fr 120px 120px'

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* header */}
      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, padding: '0 20px' }}>
        {['Hod.', 'Třída', 'Předmět', 'Učitel', 'Učebna', 'Stav'].map(h => (
          <span key={h} style={{ fontSize: 'clamp(12px,1.4vw,16px)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: C.dim }}>
            {h}
          </span>
        ))}
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden' }}>
        {items.map((item, i) => {
          const cancelled = item.removed || item.type === 'absence'
          const period = periodMap[String(item.uniperiod)]
          const accent = cancelled ? C.red : C.amber
          const accentDim = cancelled ? C.redDim : C.amberDim
          const classIds = [item._classId, ...(item.classids ?? [])].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i)

          return (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: cols, gap: 12,
              background: C.bgCardHi,
              borderRadius: 12,
              border: `1.5px solid ${accentDim}`,
              borderLeft: `5px solid ${accent}`,
              padding: '14px 20px', alignItems: 'center',
            }}>
              <span style={{ fontSize: 'clamp(20px,2.5vw,30px)', fontWeight: 900, color: C.blue, fontVariantNumeric: 'tabular-nums' }}>
                {period?.short ?? item.uniperiod}
              </span>
              <span style={{ fontSize: 'clamp(16px,2vw,24px)', fontWeight: 800, color: C.white }}>
                {classIds.map(id => getCls(lookup, id)).join(', ')}
              </span>
              <span style={{
                fontSize: 'clamp(16px,2vw,24px)', fontWeight: 800, color: C.white,
                textTransform: 'uppercase', letterSpacing: '.03em',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                textDecoration: cancelled ? 'line-through' : 'none',
              }}>
                {item.subjectid ? getSubj(lookup, item.subjectid) : '—'}
              </span>
              <span style={{ fontSize: 'clamp(14px,1.8vw,21px)', fontWeight: 600, color: C.mid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {(item.teacherids ?? []).map(id => getTeach(lookup, id)).join(', ') || '—'}
              </span>
              <span style={{ fontSize: 'clamp(14px,1.8vw,21px)', fontWeight: 600, color: C.mid }}>
                {(item.classroomids ?? []).map(id => getRoom(lookup, id)).join(', ') || '—'}
              </span>
              <span style={{
                fontSize: 'clamp(13px,1.6vw,18px)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em',
                color: accent, background: accentDim,
                padding: '5px 12px', borderRadius: 8, textAlign: 'center',
              }}>
                {cancelled ? 'Odpadá' : item.type === 'substitution' ? 'Sup.' : 'Změna'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── events view ──────────────────────────────────────────────────────────────
function EventsView({ events, lookup }) {
  const seen = new Set()
  const unique = (events?.classes ?? [])
    .flatMap(c => (c.ttitems ?? []).filter(i => i.type === 'event' && i.name))
    .filter(e => { const k = e.name + '|' + (e.starttime ?? ''); if (seen.has(k)) return false; seen.add(k); return true })

  if (!unique.length) return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, opacity: .4 }}>
      <span style={{ fontSize: 52 }}>📅</span>
      <span style={{ fontSize: 'clamp(18px,2.5vw,28px)', color: C.mid, fontWeight: 600 }}>Dnes nejsou žádné události</span>
    </div>
  )

  return (
    <div style={{
      flex: 1, display: 'grid', gap: 14, alignContent: 'start', overflow: 'hidden',
      gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))',
    }}>
      {unique.map((ev, i) => {
        const classNames = (ev.classids ?? []).map(id => getCls(lookup, id)).filter(Boolean)
        const accent = accentColor(ev.colors?.[0])
        return (
          <div key={i} style={{
            background: C.bgCardHi,
            borderRadius: 16,
            border: `1.5px solid ${C.border}`,
            borderLeft: `5px solid ${accent || C.blue}`,
            padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            {ev.starttime && ev.endtime && (
              <span style={{
                display: 'inline-block', background: C.surface,
                color: C.blue, fontSize: 'clamp(14px,1.7vw,19px)', fontWeight: 700,
                padding: '5px 14px', borderRadius: 24, width: 'fit-content', letterSpacing: '.03em',
              }}>
                {ev.starttime} – {ev.endtime}
              </span>
            )}
            <div style={{ fontSize: 'clamp(18px,2.2vw,26px)', fontWeight: 700, color: C.white, lineHeight: 1.3 }}>
              {ev.name}
            </div>
            <div style={{ fontSize: 'clamp(14px,1.7vw,19px)', color: C.mid, fontWeight: 500 }}>
              {classNames.length ? `Třídy: ${classNames.join(', ')}` : 'Celá škola'}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── app ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [data, setData] = useState(null)
  const [viewIdx, setViewIdx] = useState(0)
  const [progress, setProgress] = useState(0)
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const load = useCallback(() => { fetchAll().then(setData).catch(console.error) }, [])
  useEffect(() => { load(); const t = setInterval(load, REFRESH_INTERVAL * 1000); return () => clearInterval(t) }, [load])

  const views = useMemo(() => {
    if (!data?.timetable) return []
    const classes = (data.timetable.classes ?? []).filter(c => c.id !== 'global')
    const pages = []
    for (let i = 0; i < classes.length; i += ROWS_PER_PAGE) {
      pages.push({ type: 'timetable', rows: classes.slice(i, i + ROWS_PER_PAGE), page: Math.floor(i / ROWS_PER_PAGE) + 1, total: Math.ceil(classes.length / ROWS_PER_PAGE) })
    }
    const hasSubs = (data.substitutions?.classes ?? []).some(c => (c.ttitems ?? []).some(i => i.changed || i.removed || ['absence', 'substitution'].includes(i.type)))
    if (hasSubs) pages.push({ type: 'substitutions' })
    pages.push({ type: 'events' })
    return pages
  }, [data])

  useEffect(() => { if (views.length) { setViewIdx(0); setProgress(0) } }, [views.length])

  useEffect(() => {
    if (!views.length) return
    const timer = setInterval(() => {
      setProgress(p => {
        const next = p + 100 / (CYCLE_TIME * 10)
        if (next >= 100) { setViewIdx(i => (i + 1) % views.length); return 0 }
        return next
      })
    }, 100)
    return () => clearInterval(timer)
  }, [views.length])

  const view = views[viewIdx] ?? null
  const titles = { timetable: 'Školní rozvrh', substitutions: 'Suplování', events: 'Dnešní události' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: C.bg, color: C.white, overflow: 'hidden', fontFamily: "'DM Sans','Segoe UI',system-ui,sans-serif" }}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        html,body,#root{height:100%;overflow:hidden}
        button{cursor:pointer;border:none;background:transparent}
        @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>

      {/* progress bar */}
      <div style={{ height: 4, background: C.surface, flexShrink: 0 }}>
        <div style={{ height: '100%', background: C.blue, width: `${progress}%`, transition: 'width 100ms linear' }} />
      </div>

      {/* app bar */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '14px 24px', background: C.bgCard, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 'clamp(18px,2.5vw,28px)', fontWeight: 800, color: C.white, letterSpacing: '-.02em', lineHeight: 1 }}>
            {titles[view?.type] ?? '…'}
          </span>
          {view?.type === 'timetable' && (
            <span style={{ fontSize: 'clamp(11px,1.3vw,15px)', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.blue }}>
              Strana {view.page} / {view.total}
            </span>
          )}
        </div>

        {/* indicator dots */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {views.map((_, i) => (
            <button key={i} onClick={() => { setViewIdx(i); setProgress(0) }} style={{
              width: i === viewIdx ? 24 : 8, height: 8, borderRadius: 4,
              background: i === viewIdx ? C.blue : C.dim,
              transition: 'width .25s,background .25s', flexShrink: 0,
            }} aria-label={`Strana ${i + 1}`} />
          ))}
        </div>

        {/* clock */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 'clamp(28px,4vw,48px)', fontWeight: 200, fontVariantNumeric: 'tabular-nums', lineHeight: 1, color: C.white, letterSpacing: '-.02em' }}>
            {now.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          <div style={{ fontSize: 'clamp(12px,1.4vw,16px)', color: C.mid, marginTop: 4, textTransform: 'capitalize', fontWeight: 500 }}>
            {now.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>
      </header>

      {/* main */}
      <main style={{ flex: 1, overflow: 'hidden', padding: 16, display: 'flex', flexDirection: 'column' }}>
        {!data && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, color: C.mid }}>
            <div style={{ width: 48, height: 48, border: `4px solid ${C.surface}`, borderTopColor: C.blue, borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
            <span style={{ fontSize: 'clamp(16px,2vw,22px)', fontWeight: 600 }}>Načítání dat…</span>
          </div>
        )}
        {data && view?.type === 'timetable' && <TimetableView rows={view.rows} lookup={data.lookup} subs={data.substitutions} />}
        {data && view?.type === 'substitutions' && <SubstitutionsView subs={data.substitutions} lookup={data.lookup} />}
        {data && view?.type === 'events' && <EventsView events={data.events} lookup={data.lookup} />}
      </main>
    </div>
  )
}