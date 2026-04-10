import { useState, useEffect, useMemo, Fragment } from "react";

// ── utils ─────────────────────────────────────────────────────────────────────

const fmt = (t) => t?.slice(0, 5) ?? "";

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function useLiveClock() {
  const [t, setT] = useState(nowHHMM());
  useEffect(() => {
    const id = setInterval(() => setT(nowHHMM()), 15000);
    return () => clearInterval(id);
  }, []);
  return t;
}

function readableColor(hex) {
  if (!hex?.startsWith("#")) return "#1a1a2e";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (lum > 0.35) {
    const factor = Math.max(0.25, 0.55 - lum * 0.4);
    return `rgb(${Math.round(r * factor)},${Math.round(g * factor)},${Math.round(b * factor)})`;
  }
  return hex;
}

function lightBg(hex) {
  if (!hex?.startsWith("#")) return "#f0f0f0";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},0.12)`;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const PAGE_DURATION = 10000;
const CLASSES_PER_PAGE = 5;

// ── build grid ────────────────────────────────────────────────────────────────

function buildGrid(timetable) {
  const grid = {};
  for (const cls of timetable?.classes ?? []) {
    const cid = cls.id;
    grid[cid] = {};
    const byPeriod = {};
    for (const item of cls.ttitems ?? []) {
      const p = String(item.uniperiod);
      if (!byPeriod[p]) byPeriod[p] = [];
      byPeriod[p].push(item);
    }
    for (const [period, items] of Object.entries(byPeriod)) {
      const seenEvents = new Set();
      const visible = items.filter((i) => {
        if (i.removed) return false;
        if (i.type === "event") {
          const key = i.eventid ?? i.name;
          if (seenEvents.has(key)) return false;
          seenEvents.add(key);
        }
        return true;
      });
      if (visible.length) grid[cid][period] = visible;
    }
  }
  return grid;
}

// ── MiniClock ─────────────────────────────────────────────────────────────────

function MiniClock() {
  const [display, setDisplay] = useState("");
  const [dateStr, setDateStr] = useState("");

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setDisplay(d.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" }));
      setDateStr(d.toLocaleDateString("cs-CZ", { weekday: "short", day: "numeric", month: "short" }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{
      display: "flex",
      alignItems: "baseline",
      gap: "0.5vw",
      background: "#f5f5f5",
      padding: "0.4vw 1vw",
      borderRadius: "1.5vw",
    }}>
      <div style={{
        fontSize: "1.2vw",
        fontWeight: 700,
        color: "#111",
        letterSpacing: "-0.01em"
      }}>
        {display}
      </div>
      <div style={{
        fontSize: "0.7vw",
        color: "#888"
      }}>
        {dateStr}
      </div>
    </div>
  );
}

// ── TimetableChunk ────────────────────────────────────────────────────────────

function TimetableChunk({ classChunk, grid, data }) {
  const clock = useLiveClock();
  const { subjects = {}, teachers = {}, classrooms = {}, periods = {} } = data;

  const periodList = Object.entries(periods.data ?? {})
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .filter(([pid]) => classChunk.some(([cid]) => (grid[cid]?.[pid] ?? []).length > 0));

  const activePeriod = periodList.find(([, p]) => clock >= p.start && clock < p.end)?.[0];

  return (
    <div style={{
      background: "#fff",
      borderRadius: "1vw",
      border: "0.1vw solid #e8e8e8",
      overflow: "hidden",
      height: "100%",
      display: "flex",
      flexDirection: "column"
    }}>
      <div style={{ overflowX: "auto", overflowY: "visible", flex: 1, display: "flex", flexDirection: "column" }}>
        <table style={{
          width: "100%",
          minWidth: "80vw",
          borderCollapse: "collapse",
          fontSize: "0.9vw",
          height: "100%"
        }}>
          <colgroup>
            <col style={{ width: "8vw", minWidth: "8vw" }} />
            {periodList.map(([pid]) => <col key={pid} style={{ minWidth: "10vw" }} />)}
          </colgroup>
          <thead>
            <tr style={{ background: "#fafafa" }}>
              <th style={TH(true)}>Třída</th>
              {periodList.map(([pid, p]) => {
                const active = pid === activePeriod;
                return (
                  <th key={pid} style={{ ...TH(false), background: active ? "#eef1ff" : "#fafafa" }}>
                    <span style={{
                      fontWeight: 700,
                      color: active ? "#3b4ef8" : "#444",
                      fontSize: "0.9vw"
                    }}>{p.short}.</span>
                    <br />
                    <span style={{
                      fontSize: "0.7vw",
                      color: active ? "#6b7aff" : "#ccc",
                      fontWeight: 400
                    }}>{p.start}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody style={{ height: "calc(100% - 40px)" }}>
            {classChunk.map(([cid, cname], ri) => (
              <tr key={cid} style={{
                background: ri % 2 === 0 ? "#fff" : "#fafafa",
                height: `${100 / CLASSES_PER_PAGE}%`
              }}>
                <td style={{
                  ...TD(true),
                  fontWeight: 700,
                  fontSize: "0.85vw",
                  color: "#111",
                  position: "sticky",
                  left: 0,
                  background: ri % 2 === 0 ? "#fff" : "#fafafa",
                  zIndex: 1,
                  verticalAlign: "middle"
                }}>{cname}</td>
                {periodList.map(([pid]) => {
                  const items = grid[cid]?.[pid] ?? [];
                  const active = pid === activePeriod;
                  return (
                    <td key={pid} style={{
                      ...TD(false),
                      background: active ? "#f5f7ff" : undefined,
                      verticalAlign: "middle",
                      padding: "0.5vw 0.3vw",
                      height: "100%"
                    }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.3vw", justifyContent: "center" }}>
                        {items.map((item, i) => {
                          const isEvent = item.type === "event";
                          const sub = item.subjectid ? subjects.data?.[item.subjectid] : null;
                          const tch = (item.teacherids ?? [])
                            .map((id) => teachers.data?.[id]).filter(Boolean).join(", ");
                          const room = (item.classroomids ?? [])
                            .map((id) => classrooms.data?.[id]).filter(Boolean).join(", ");
                          const grp = (item.groupnames ?? []).filter((g) => g?.trim()).join(", ");
                          const rawColor = item.colors?.[0];
                          const fg = readableColor(rawColor ?? (isEvent ? "#c47a00" : "#2244bb"));
                          const bg = lightBg(rawColor ?? (isEvent ? "#FFA500" : "#4060ee"));

                          return (
                            <div key={i} style={{
                              background: bg,
                              borderLeft: `0.2vw solid ${fg}`,
                              borderRadius: "0 0.3vw 0.3vw 0",
                              padding: "0.4vw 0.6vw",
                            }}>
                              <div style={{
                                fontWeight: 700,
                                color: fg,
                                fontSize: "0.75vw",
                                lineHeight: 1.3,
                                wordBreak: "break-word"
                              }}>
                                {isEvent
                                  ? (item.name ?? "Událost").replace(/^(Školní událost|Písemná práce|Jiná událost):\s*/i, "")
                                  : (sub ?? "—")}
                              </div>
                              {!isEvent && tch && (
                                <div style={{
                                  fontSize: "0.65vw",
                                  color: "#555",
                                  lineHeight: 1.3
                                }}>{tch}</div>
                              )}
                              {!isEvent && room && (
                                <div style={{
                                  fontSize: "0.65vw",
                                  color: "#888"
                                }}>{room}</div>
                              )}
                              {grp && (
                                <div style={{
                                  fontSize: "0.6vw",
                                  color: "#aaa",
                                  fontStyle: "italic"
                                }}>{grp}</div>
                              )}
                              {item.changed && (
                                <div style={{
                                  fontSize: "0.6vw",
                                  color: "#d97706",
                                  fontWeight: 700
                                }}>↺ změna</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── EventsPage ────────────────────────────────────────────────────────────────

function EventsPage({ data, events }) {
  const clock = useLiveClock();
  const { teachers = {}, subjects = {}, classrooms = {}, classes = {} } = data;

  const items = events?.ttitems ?? [];
  const seen = new Set();
  const deduped = items
    .filter((ev) => {
      const key = ev.eventid ?? `${ev.name}|${ev.uniperiod}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (a.starttime ?? "").localeCompare(b.starttime ?? ""));

  if (!deduped.length) {
    return (
      <div style={{
        padding: "4vw",
        textAlign: "center",
        color: "#bbb",
        fontSize: "1vw"
      }}>
        Dnes žádné události.
      </div>
    );
  }

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(35vw, 1fr))",
      gap: "1vw",
      height: "100%",
      overflowY: "auto",
      alignContent: "start"
    }}>
      {deduped.map((ev, i) => {
        const sub = ev.subjectid ? subjects.data?.[ev.subjectid] : null;
        const tch = (ev.teacherids ?? []).map((id) => teachers.data?.[id]).filter(Boolean).join(", ");
        const room = (ev.classroomids ?? []).map((id) => classrooms.data?.[id]).filter(Boolean).join(", ");
        const cls = (ev.classids ?? []).map((id) => classes.data?.[id]).filter(Boolean).join(", ");
        const isNow = clock >= fmt(ev.starttime) && clock < fmt(ev.endtime);

        const rawColor = ev.colors?.[0];
        const fg = readableColor(rawColor ?? "#c47a00");
        const bg = lightBg(rawColor ?? "#FFA500");

        const typePrefix = (ev.name ?? "").match(/^(Školní událost|Písemná práce|Jiná událost)/i)?.[0] ?? "Událost";
        const name = (ev.name ?? "Událost").replace(/^(Školní událost|Písemná práce|Jiná událost):\s*/i, "");

        return (
          <div key={i} style={{
            background: bg,
            border: isNow ? `0.15vw solid ${fg}` : "0.1vw solid rgba(0,0,0,0.07)",
            borderLeft: `0.3vw solid ${fg}`,
            borderRadius: "0.8vw",
            padding: "1vw 1.2vw",
            display: "grid",
            gridTemplateColumns: "7vw 1fr",
            gap: "0 1vw",
            alignItems: "start",
          }}>
            <div style={{ textAlign: "center", paddingTop: 0 }}>
              <div style={{
                fontSize: "1.2vw",
                fontWeight: 800,
                color: "#111",
                letterSpacing: "-0.01em"
              }}>
                {fmt(ev.starttime)}
              </div>
              <div style={{
                fontSize: "0.7vw",
                color: "#bbb"
              }}>– {fmt(ev.endtime)}</div>
              {isNow && (
                <div style={{
                  marginTop: "0.3vw",
                  fontSize: "0.65vw",
                  fontWeight: 700,
                  color: fg,
                  background: "#fff",
                  borderRadius: "0.3vw",
                  padding: "0.2vw 0.4vw",
                  border: `0.1vw solid ${fg}`,
                  display: "inline-block",
                }}>
                  NYNÍ
                </div>
              )}
            </div>
            <div>
              <div style={{
                fontSize: "0.65vw",
                fontWeight: 700,
                color: fg,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: "0.2vw"
              }}>
                {typePrefix}
              </div>
              <div style={{
                fontWeight: 700,
                fontSize: "1vw",
                color: "#111",
                lineHeight: 1.35,
                marginBottom: "0.3vw"
              }}>
                {name}
              </div>
              <div style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.2vw 1vw",
                fontSize: "0.75vw",
                color: "#444"
              }}>
                {sub && <span><span style={{ color: "#666" }}>předmět </span>{sub}</span>}
                {cls && <span><span style={{ color: "#666" }}>třídy </span>{cls}</span>}
                {tch && <span><span style={{ color: "#666" }}>učitel </span>{tch}</span>}
                {room && <span><span style={{ color: "#666" }}>učebna </span>{room}</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── style helpers ─────────────────────────────────────────────────────────────

function TH(left = false) {
  return {
    padding: "0.8vw 0.5vw",
    textAlign: left ? "left" : "center",
    fontWeight: 600,
    color: "#888",
    borderBottom: "0.15vw solid #eee",
    fontSize: "0.8vw",
    whiteSpace: "nowrap",
  };
}

function TD(left = false) {
  return {
    padding: "0.6vw 0.4vw",
    textAlign: left ? "left" : "center",
    borderBottom: "0.1vw solid #f2f2f2",
  };
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [data, setData] = useState(null);
  const [events, setEvents] = useState(null);
  const [timetable, setTimetable] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pageIdx, setPageIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [d, e, t] = await Promise.all([
          fetch("/api/data").then((r) => r.json()),
          fetch("/api/events").then((r) => r.json()),
          fetch("/api/timetable").then((r) => r.json()),
        ]);
        setData(d);
        setEvents(e?.r ?? e);
        setTimetable(t);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, []);

  const { grid, pages } = useMemo(() => {
    if (!data || !timetable) return { classList: [], grid: {}, pages: [] };

    const g = buildGrid(timetable);
    const cl = Object.entries(data.classes?.data ?? {})
      .sort((a, b) => {
        // Sort by numeric value extracted from class name
        const numA = parseInt(a[1].replace(/\D/g, '')) || 0;
        const numB = parseInt(b[1].replace(/\D/g, '')) || 0;
        return numA - numB;
      });

    const chunks = chunk(cl, CLASSES_PER_PAGE);
    const ps = chunks.map((ch, i) => ({
      type: "timetable",
      label: `${ch[0]?.[1]} - ${ch[ch.length - 1]?.[1]}`,
      classChunk: ch,
    }));
    ps.push({ type: "events", label: "Události" });

    return { classList: cl, grid: g, pages: ps };
  }, [data, timetable]);

  // Auto flip
  useEffect(() => {
    if (paused || pages.length === 0) return;

    setProgress(0);
    const start = Date.now();

    const tickId = setInterval(() => {
      const elapsed = Date.now() - start;
      const newProgress = Math.min((elapsed / PAGE_DURATION) * 100, 100);
      setProgress(newProgress);
    }, 100);

    const flipId = setTimeout(() => {
      setPageIdx((p) => (p + 1) % pages.length);
    }, PAGE_DURATION);

    return () => {
      clearInterval(tickId);
      clearTimeout(flipId);
    };
  }, [pageIdx, paused, pages.length]);

  const pickPage = (i) => {
    setPageIdx(i);
    setPaused(true);
    setTimeout(() => setPaused(false), 30000);
  };

  const current = pages[pageIdx];

  if (loading) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        fontSize: "1.2vw",
        color: "#bbb"
      }}>
        Načítání…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        padding: "2vw"
      }}>
        <div style={{
          background: "#fff3f3",
          border: "0.1vw solid #fca5a5",
          borderRadius: "0.8vw",
          padding: "1.2vw 1.6vw",
          color: "#b91c1c",
          fontSize: "0.9vw",
        }}>
          Chyba připojení: {error}
        </div>
      </div>
    );
  }

  if (!data || !current) {
    return null;
  }

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; margin: 0; padding: 0; }
        body { 
          background: #f0f2f4; 
          font-family: system-ui, -apple-system, sans-serif; 
          color: #111;
        }
        @keyframes fadein { 
          from { opacity: 0; transform: translateY(0.3vw); } 
          to { opacity: 1; transform: translateY(0); } 
        }
        .page { animation: fadein 0.3s ease; height: 100%; }
        
        button, [role="button"] {
          cursor: pointer;
          transition: all 0.2s ease;
        }
        button:hover {
          transform: scale(1.02);
          opacity: 0.9;
        }
        
        ::-webkit-scrollbar {
          width: 0.8vw;
          height: 0.8vw;
        }
        ::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 0.5vw;
        }
        ::-webkit-scrollbar-thumb {
          background: #c1c1c1;
          border-radius: 0.5vw;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: #a8a8a8;
        }
      `}</style>

      <div style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "hidden"
      }}>
        {/* PAGE TABS BAR with clock */}
        <div style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5vw",
          flexWrap: "wrap",
          padding: "0.8vw 1.5vw",
          background: "#fff",
          borderBottom: "0.1vw solid #e5e5e5",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.3vw", flexWrap: "wrap" }}>
            {pages.map((p, i) => {
              const active = i === pageIdx;
              const isEvents = p.type === "events";
              return (
                <Fragment key={i}>
                  {isEvents && i > 0 && (
                    <span style={{
                      width: "0.1vw",
                      height: "1.5vw",
                      background: "#e5e5e5",
                      display: "inline-block",
                      margin: "0 0.5vw"
                    }} />
                  )}
                  <button onClick={() => pickPage(i)} style={{
                    padding: "0.5vw 1.2vw",
                    borderRadius: "0.6vw",
                    border: "none",
                    cursor: "pointer",
                    background: active ? "#111" : "transparent",
                    color: active ? "#fff" : "#888",
                    fontWeight: active ? 600 : 400,
                    fontSize: "0.85vw",
                    fontFamily: "inherit",
                    transition: "all 0.2s ease",
                  }}>
                    {p.label}
                  </button>
                </Fragment>
              );
            })}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "1vw" }}>
            {!paused && pages.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.8vw" }}>
                <span style={{
                  fontSize: "0.7vw",
                  color: "#ddd"
                }}>auto</span>
                <div style={{
                  width: "6vw",
                  height: "0.25vw",
                  background: "#eee",
                  borderRadius: "1vw",
                  overflow: "hidden"
                }}>
                  <div style={{
                    width: `${progress}%`,
                    height: "100%",
                    background: "#111",
                    borderRadius: "1vw",
                    transition: "width 0.1s linear",
                  }} />
                </div>
              </div>
            )}
            <MiniClock />
          </div>
        </div>

        {/* CONTENT */}
        <div style={{
          flex: 1,
          overflow: "hidden",
          padding: "1.2vw 1.5vw",
          minHeight: 0
        }}>
          <div className="page" key={pageIdx} style={{ height: "100%" }}>
            {current.type === "timetable" && (
              <TimetableChunk
                classChunk={current.classChunk}
                grid={grid}
                data={data}
              />
            )}
            {current.type === "events" && (
              <EventsPage data={data} events={events} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}