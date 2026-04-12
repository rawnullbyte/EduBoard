import { useState, useEffect, useMemo, useCallback } from 'react'

// ─── config ───────────────────────────────────────────────────────────────────
const CYCLE_TIME = 12
const REFRESH_INTERVAL = 60
const ROWS_PER_PAGE = 6

// ─── colour utilities ─────────────────────────────────────────────────────────

function parseRGBA(raw) {
  if (!raw) return null
  const s = raw.trim()
  if (s.startsWith('#')) {
    const h = s.replace('#', '')
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h.padEnd(6, '0')
    return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16), 1]
  }
  const m = s.match(/rgba?\(([^)]+)\)/)
  if (m) {
    const p = m[1].split(',').map(x => parseFloat(x.trim()))
    return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, p[3] ?? 1]
  }
  return null
}

// Very subtle hue tint blended toward the dark surface — readable, not garish
function cellBg(raw) {
  const c = parseRGBA(raw)
  if (!c) return null
  const [r, g, b] = c
  // blend 12% colour into the dark card background
  return `rgb(${Math.round(r * .12 + 22 * .88)},${Math.round(g * .12 + 26 * .88)},${Math.round(b * .12 + 36 * .88)})`
}

// Left-border accent — 45% saturation so it's visible but not neon
function cellAccent(raw) {
  const c = parseRGBA(raw)
  if (!c) return null
  const [r, g, b] = c
  return `rgb(${Math.round(r * .45 + 22 * .55)},${Math.round(g * .45 + 26 * .55)},${Math.round(b * .45 + 36 * .55)})`
}

// ─── design tokens ────────────────────────────────────────────────────────────
const t = {
  bg: '#0f1117',
  bgCard: '#171a24',
  bgCardHi: '#1c2032',
  surface: '#242840',
  surfaceVar: '#2a2e46',
  primary: '#82aadf',
  primaryDim: '#3d5c87',
  outline: '#353a55',
  outlineVar: '#272b40',
  onSurface: '#dde0ef',
  onSurfaceMid: '#7b82a0',
  onSurfaceDim: '#474d68',
  error: '#ef9a9a',
  errorDim: 'rgba(120,40,40,0.6)',
  warn: '#f0c070',
  warnDim: 'rgba(100,70,0,0.6)',
  r: { sm: 8, md: 10, lg: 14, xl: 18 },
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

// ─── shared style fragments ───────────────────────────────────────────────────
const S = {
  app: {
    display: 'flex', flexDirection: 'column', height: '100vh',
    background: t.bg, color: t.onSurface, overflow: 'hidden',
    fontFamily: "'DM Sans','Segoe UI',system-ui,sans-serif",
  },
  progressTrack: { height: 3, background: t.outline, flexShrink: 0 },
  progressFill: (pct) => ({ height: '100%', background: t.primary, width: `${pct}%`, transition: 'width 100ms linear' }),
  appBar: {
    display: 'flex', alignItems: 'center', gap: 14, padding: '9px 16px',
    background: t.bgCard, borderBottom: `1px solid ${t.outline}`, flexShrink: 0,
  },
  cell: (color) => ({
    borderRadius: t.r.md,
    background: cellBg(color) ?? t.bgCardHi,
    borderLeft: `3px solid ${cellAccent(color) ?? t.primaryDim}`,
    padding: '5px 8px',
    display: 'flex', flexDirection: 'column', justifyContent: 'center',
    overflow: 'hidden', gap: 2,
  }),
  subjectText: {
    fontSize: 'clamp(9px,1.3vw,14px)', fontWeight: 700,
    textTransform: 'uppercase', color: t.onSurface,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    lineHeight: 1.2, letterSpacing: '.02em',
  },
  metaText: {
    fontSize: 9, color: t.onSurfaceMid,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.4,
  },
}

// ─── lesson cell ──────────────────────────────────────────────────────────────
function LessonCell({ items, lookup, sub }) {
  const card = items.find(i => i.type === 'card')
  const event = items.find(i => i.type === 'event')

  if (!card && !event && !sub) return (
    <div style={{ borderRadius: t.r.md, background: t.bgCard, opacity: .3 }} />
  )

  // ── substitution ──
  if (sub) {
    const cancelled = sub.removed || sub.type === 'absence'
    const color = sub.colors?.[0] ?? card?.colors?.[0]
    return (
      <div style={{ ...S.cell(color), position: 'relative' }}>
        <span style={{
          position: 'absolute', top: 3, right: 4,
          fontSize: 8, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase',
          background: cancelled ? t.errorDim : t.warnDim,
          color: cancelled ? t.error : t.warn,
          padding: '1px 5px', borderRadius: 4,
        }}>
          {cancelled ? 'Odpadá' : 'Sup.'}
        </span>
        <div style={{ ...S.subjectText, paddingRight: 30, color: cancelled ? t.onSurfaceMid : t.onSurface }}>
          {cancelled
            ? (card ? getSubj(lookup, card.subjectid) : '–')
            : (sub.subjectid ? getSubj(lookup, sub.subjectid) : (card ? getSubj(lookup, card.subjectid) : '–'))
          }
        </div>
        {!cancelled && (
          <div style={S.metaText}>
            {[...(sub.teacherids ?? card?.teacherids ?? [])].map(id => getTeach(lookup, id)).join(', ')}
            {(sub.classroomids ?? card?.classroomids ?? []).length > 0 &&
              ' · ' + (sub.classroomids ?? card?.classroomids ?? []).map(id => getRoom(lookup, id)).join(', ')}
          </div>
        )}
      </div>
    )
  }

  // ── event only ──
  if (!card) return (
    <div style={{
      borderRadius: t.r.md,
      background: cellBg(event.colors?.[0]) ?? t.surface,
      borderLeft: `3px solid ${cellAccent(event.colors?.[0]) ?? t.primaryDim}`,
      padding: '4px 7px', display: 'flex', alignItems: 'center', overflow: 'hidden',
    }}>
      <span style={{ fontSize: 9, color: t.onSurfaceMid, lineHeight: 1.3 }}>
        {(event.name ?? '').split(':').pop().trim()}
      </span>
    </div>
  )

  // ── regular card ──
  const rooms = (card.classroomids ?? []).map(id => getRoom(lookup, id)).join(', ')
  const teachers = (card.teacherids ?? []).map(id => getTeach(lookup, id)).join(', ')
  return (
    <div style={S.cell(card.colors?.[0])}>
      <div style={S.subjectText}>{getSubj(lookup, card.subjectid)}</div>
      <div style={S.metaText}>
        {[rooms, teachers].filter(Boolean).join(' · ')}
      </div>
    </div>
  )
}

// ─── timetable view ───────────────────────────────────────────────────────────
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
      flex: 1, display: 'grid', gap: 5, overflow: 'hidden',
      gridTemplateColumns: `minmax(44px,60px) repeat(${periods.length},1fr)`,
      gridTemplateRows: `38px repeat(${rows.length},1fr)`,
    }}>
      <div style={{ borderRadius: t.r.md, background: t.bgCard }} />

      {periods.map(p => (
        <div key={p.period} style={{
          background: t.surface, borderRadius: t.r.md,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '3px 2px', gap: 1,
        }}>
          <span style={{ fontSize: 'clamp(11px,1.5vw,16px)', fontWeight: 700, color: t.primary, lineHeight: 1 }}>
            {p.short}
          </span>
          <span style={{ fontSize: 9, color: t.onSurfaceDim, lineHeight: 1.3, textAlign: 'center' }}>
            {p.start}<br />{p.end}
          </span>
        </div>
      ))}

      {rows.map(row => (
        <div key={row.id} style={{ display: 'contents' }}>
          <div style={{
            borderRadius: t.r.md, background: t.surface,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 'clamp(10px,1.4vw,15px)', fontWeight: 700, color: t.primary, letterSpacing: '-.01em',
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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, opacity: .4 }}>
      <svg width="36" height="36" viewBox="0 0 24 24" fill={t.onSurfaceMid}>
        <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" />
      </svg>
      <span style={{ fontSize: 14, color: t.onSurfaceMid }}>Dnes žádné suplování</span>
    </div>
  )

  const cols = 'minmax(36px,44px) minmax(0,1fr) minmax(0,1.2fr) minmax(0,1fr) minmax(0,1fr) 70px'

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 6, padding: '2px 10px' }}>
        {['Hod.', 'Třída', 'Předmět', 'Učitel', 'Učebna', 'Typ'].map(h => (
          <span key={h} style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: t.onSurfaceDim }}>
            {h}
          </span>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map((item, i) => {
          const cancelled = item.removed || item.type === 'absence'
          const period = periodMap[String(item.uniperiod)]
          return (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: cols, gap: 6,
              background: cellBg(item.colors?.[0]) ?? t.bgCardHi,
              borderRadius: t.r.md,
              borderLeft: `3px solid ${cancelled ? t.error : (cellAccent(item.colors?.[0]) ?? t.warn)}`,
              padding: '7px 10px', alignItems: 'center',
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: t.primary, fontVariantNumeric: 'tabular-nums' }}>
                {period?.short ?? item.uniperiod}
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: t.onSurface, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {[item._classId, ...(item.classids ?? [])].filter(Boolean)
                  .filter((v, i, a) => a.indexOf(v) === i)
                  .map(id => getCls(lookup, id)).join(', ')}
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: t.onSurface, textTransform: 'uppercase', letterSpacing: '.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.subjectid ? getSubj(lookup, item.subjectid) : '–'}
              </span>
              <span style={{ fontSize: 12, color: t.onSurfaceMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {(item.teacherids ?? []).map(id => getTeach(lookup, id)).join(', ') || '–'}
              </span>
              <span style={{ fontSize: 12, color: t.onSurfaceMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {(item.classroomids ?? []).map(id => getRoom(lookup, id)).join(', ') || '–'}
              </span>
              <span style={{
                fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em',
                color: cancelled ? t.error : t.warn,
                background: cancelled ? t.errorDim : t.warnDim,
                padding: '3px 8px', borderRadius: 6, textAlign: 'center',
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
    .filter(e => {
      const key = e.name + '|' + (e.starttime ?? '')
      if (seen.has(key)) return false
      seen.add(key); return true
    })

  if (!unique.length) return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, opacity: .4 }}>
      <svg width="36" height="36" viewBox="0 0 24 24" fill={t.onSurfaceMid}>
        <path d="M19 3h-1V1h-2v2H8V1H6v2H5C3.9 3 3 3.9 3 5v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 18H5V8h14v13zM7 10h5v5H7z" />
      </svg>
      <span style={{ fontSize: 14, color: t.onSurfaceMid }}>Dnes nejsou žádné události</span>
    </div>
  )

  return (
    <div style={{
      flex: 1, display: 'grid', gap: 10, alignContent: 'start', overflow: 'hidden',
      gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))',
    }}>
      {unique.map((ev, i) => {
        const classNames = (ev.classids ?? []).map(id => getCls(lookup, id)).filter(Boolean)
        return (
          <div key={i} style={{
            background: cellBg(ev.colors?.[0]) ?? t.bgCardHi,
            borderRadius: t.r.lg,
            borderLeft: `3px solid ${cellAccent(ev.colors?.[0]) ?? t.primaryDim}`,
            padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            {ev.starttime && ev.endtime && (
              <span style={{
                display: 'inline-block', background: t.surface,
                color: t.primary, fontSize: 11, fontWeight: 700,
                padding: '3px 10px', borderRadius: 20, width: 'fit-content', letterSpacing: '.03em',
              }}>
                {ev.starttime} – {ev.endtime}
              </span>
            )}
            <div style={{ fontSize: 'clamp(13px,1.7vw,16px)', fontWeight: 600, color: t.onSurface, lineHeight: 1.35 }}>
              {ev.name}
            </div>
            <div style={{ fontSize: 11, color: t.onSurfaceMid }}>
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
    const tick = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(tick)
  }, [])

  const load = useCallback(() => { fetchAll().then(setData).catch(console.error) }, [])
  useEffect(() => {
    load()
    const t = setInterval(load, REFRESH_INTERVAL * 1000)
    return () => clearInterval(t)
  }, [load])

  const views = useMemo(() => {
    if (!data?.timetable) return []
    const classes = (data.timetable.classes ?? []).filter(c => c.id !== 'global')
    const pages = []
    for (let i = 0; i < classes.length; i += ROWS_PER_PAGE) {
      pages.push({
        type: 'timetable',
        rows: classes.slice(i, i + ROWS_PER_PAGE),
        page: Math.floor(i / ROWS_PER_PAGE) + 1,
        total: Math.ceil(classes.length / ROWS_PER_PAGE),
      })
    }
    const hasSubs = (data.substitutions?.classes ?? []).some(c =>
      (c.ttitems ?? []).some(i => i.changed || i.removed || ['absence', 'substitution'].includes(i.type))
    )
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
    <div style={S.app}>
      <style>{`* { box-sizing:border-box; margin:0; padding:0 }
        html,body,#root { height:100%; overflow:hidden }
        button { cursor:pointer; border:none; background:transparent }
        @keyframes spin { to { transform:rotate(360deg) } }`}
      </style>

      <div style={S.progressTrack}>
        <div style={S.progressFill(progress)} />
      </div>

      <header style={S.appBar}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 'clamp(14px,1.9vw,20px)', fontWeight: 600, color: t.onSurface, letterSpacing: '-.01em', lineHeight: 1.2 }}>
            {titles[view?.type] ?? '…'}
          </span>
          {view?.type === 'timetable' && (
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: t.primary, marginTop: 2 }}>
              Strana {view.page} / {view.total}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          {views.map((v, i) => (
            <button
              key={i}
              onClick={() => { setViewIdx(i); setProgress(0) }}
              style={{
                width: i === viewIdx ? 20 : 7, height: 7, borderRadius: 4,
                background: i === viewIdx ? t.primary : t.outlineVar,
                transition: 'width .25s, background .25s', flexShrink: 0,
              }}
              aria-label={`Přejít na ${i + 1}`}
            />
          ))}
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 'clamp(20px,2.8vw,34px)', fontWeight: 300, fontVariantNumeric: 'tabular-nums', lineHeight: 1, color: t.onSurface, letterSpacing: '-.02em' }}>
            {now.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          <div style={{ fontSize: 10, color: t.onSurfaceMid, marginTop: 3, textTransform: 'capitalize' }}>
            {now.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>
      </header>

      <main style={{ flex: 1, overflow: 'hidden', padding: 10, display: 'flex', flexDirection: 'column' }}>
        {!data && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, color: t.onSurfaceMid, fontSize: 13 }}>
            <div style={{ width: 38, height: 38, border: `3px solid ${t.outline}`, borderTopColor: t.primary, borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
            Načítání dat…
          </div>
        )}
        {data && view?.type === 'timetable' && <TimetableView rows={view.rows} lookup={data.lookup} subs={data.substitutions} />}
        {data && view?.type === 'substitutions' && <SubstitutionsView subs={data.substitutions} lookup={data.lookup} />}
        {data && view?.type === 'events' && <EventsView events={data.events} lookup={data.lookup} />}
      </main>
    </div>
  )
}