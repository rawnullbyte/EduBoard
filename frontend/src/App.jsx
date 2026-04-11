import React, { useState, useEffect, useMemo } from 'react';

// --- Konfigurace ---
const CYCLE_TIME = 10; // Sekund na jednu obrazovku
const REFRESH_INTERVAL = 60; // Sekund pro obnovu dat z API
const ROWS_PER_PAGE = 6;

// Funkce pro výpočet kontrastní barvy textu a stylu buňky
const getLessonStyle = (hexColor) => {
  if (!hexColor) return { backgroundColor: 'rgba(255,255,255,0.05)', color: '#ffffff' };

  const color = hexColor.replace('#', '');
  const r = parseInt(color.substr(0, 2), 16);
  const g = parseInt(color.substr(2, 2), 16);
  const b = parseInt(color.substr(4, 2), 16);

  // Jas podle YIQ (standard pro čitelnost)
  const brightness = ((r * 299) + (g * 587) + (b * 114)) / 1000;

  return {
    backgroundColor: `#${color}`,
    color: brightness >= 128 ? '#1a1a1a' : '#ffffff',
    boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)'
  };
};

const App = () => {
  const [data, setData] = useState({ lookup: {}, timetable: null, events: null });
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());

  const fetchData = async () => {
    try {
      const [resLookup, resTT, resEvents] = await Promise.all([
        fetch('/api/data').then(r => r.json()),
        fetch('/api/timetable').then(r => r.json()),
        fetch('/api/events').then(r => r.json())
      ]);
      setData({ lookup: resLookup, timetable: resTT, events: resEvents });
      setLoading(false);
    } catch (err) {
      console.error("Chyba synchronizace");
    }
  };

  useEffect(() => {
    fetchData();
    const dataTimer = setInterval(fetchData, REFRESH_INTERVAL * 1000);
    const clockTimer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => { clearInterval(dataTimer); clearInterval(clockTimer); };
  }, []);

  const views = useMemo(() => {
    if (!data.timetable) return [];
    const pages = [];
    const classes = data.timetable.classes || [];

    // Stránky rozvrhu
    for (let i = 0; i < classes.length; i += ROWS_PER_PAGE) {
      pages.push({
        type: 'timetable',
        data: classes.slice(i, i + ROWS_PER_PAGE),
        page: Math.floor(i / ROWS_PER_PAGE) + 1,
        total: Math.ceil(classes.length / ROWS_PER_PAGE)
      });
    }
    // Stránka pouze s událostmi
    pages.push({ type: 'pure_events' });

    return pages;
  }, [data]);

  useEffect(() => {
    if (views.length === 0) return;
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          setCurrentIndex((old) => (old + 1) % views.length);
          return 0;
        }
        return prev + (100 / (CYCLE_TIME * 10));
      });
    }, 100);
    return () => clearInterval(timer);
  }, [views.length]);

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-[#020617] text-blue-400 font-light text-3xl tracking-widest">
      NAČÍTÁNÍ SYSTÉMU...
    </div>
  );

  const currentView = views[currentIndex];

  return (
    <div className="h-screen w-screen bg-[#020617] text-slate-100 flex flex-col overflow-hidden font-sans">
      {/* Progress Bar */}
      <div className="w-full h-1.5 bg-slate-900">
        <div className="h-full bg-gradient-to-r from-blue-600 to-cyan-400 transition-all duration-100 ease-linear" style={{ width: `${progress}%` }} />
      </div>

      {/* Header */}
      <header className="px-10 py-6 flex justify-between items-center bg-slate-900/40 border-b border-slate-800">
        <div className="flex flex-col">
          <h1 className="text-4xl font-black uppercase tracking-tighter text-white">
            {currentView.type === 'timetable' ? 'Školní Rozvrh' : 'Dnešní Události'}
          </h1>
          {currentView.type === 'timetable' && (
            <span className="text-blue-400 font-bold text-sm tracking-widest">STRANA {currentView.page} / {currentView.total}</span>
          )}
        </div>

        <div className="flex items-center gap-8">
          <div className="text-right">
            <div className="text-5xl font-mono font-bold text-white leading-none">
              {currentTime.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div className="text-slate-400 text-sm font-medium mt-1 uppercase tracking-widest">
              {currentTime.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 overflow-hidden">
        {currentView.type === 'timetable' ? (
          <Timetable data={data} rows={currentView.data} />
        ) : (
          <PureEvents data={data} />
        )}
      </main>
    </div>
  );
};

const Timetable = ({ data, rows }) => {
  const periods = Object.values(data.lookup.periods.data).sort((a, b) => a.period - b.period);

  return (
    <div className="h-full w-full grid gap-2" style={{
      gridTemplateColumns: `minmax(120px, 1fr) repeat(${periods.length}, 3fr)`,
      gridTemplateRows: `auto repeat(${ROWS_PER_PAGE}, 1fr)`
    }}>
      {/* Header Buňky */}
      <div className="bg-slate-800/60 rounded-xl flex items-center justify-center font-black text-slate-500 text-xs tracking-widest uppercase">Třída</div>
      {periods.map(p => (
        <div key={p.period} className="bg-slate-800/40 rounded-xl flex flex-col items-center justify-center p-2 border border-slate-800">
          <span className="text-2xl font-black text-white leading-none">{p.short}</span>
          <span className="text-[10px] text-blue-400 font-bold mt-1 opacity-80">{p.start} – {p.end}</span>
        </div>
      ))}

      {/* Tělo tabulky */}
      {rows.map((cls) => (
        <React.Fragment key={cls.id}>
          <div className="bg-blue-900/20 rounded-xl flex items-center justify-center text-3xl font-black text-white border border-blue-900/30">
            {data.lookup.classes.data[cls.id]}
          </div>
          {periods.map(p => {
            const lesson = cls.ttitems.find(item => item.uniperiod === p.period);
            if (!lesson) return <div key={p.period} className="bg-slate-900/30 rounded-xl border border-slate-800/20" />;

            const style = getLessonStyle(lesson.colors?.[0]);

            return (
              <div key={p.period} style={style} className="p-3 flex flex-col justify-center overflow-hidden rounded-xl transition-all border border-black/10">
                <div className="text-xl font-black truncate mb-1 leading-none uppercase">
                  {data.lookup.subjects.data[lesson.subjectid]}
                </div>
                <div className="flex flex-col gap-0.5 opacity-90">
                  <span className="text-xs font-bold truncate">🏫 {lesson.classroomids?.map(id => data.lookup.classrooms.data[id]).join(', ')}</span>
                  <span className="text-[10px] font-medium truncate uppercase tracking-tighter">👤 {lesson.teacherids?.map(id => data.lookup.teachers.data[id]).join(', ')}</span>
                </div>
              </div>
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
};

const PureEvents = ({ data }) => {
  const allEvents = data.events?.classes?.flatMap(c =>
    c.ttitems.filter(i => i.type === 'event' || i.name)
  ) || [];

  const uniqueEvents = Array.from(new Map(allEvents.map(item => [item.name, item])).values());

  if (uniqueEvents.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-600">
        <div className="text-9xl mb-6 opacity-20">🗓️</div>
        <p className="text-3xl font-light tracking-widest uppercase">Dnes nejsou plánovány žádné události</p>
      </div>
    );
  }

  return (
    <div className="h-full grid grid-cols-2 gap-8 content-start">
      {uniqueEvents.map((event, idx) => (
        <div key={idx} className="bg-gradient-to-br from-blue-600 to-indigo-700 p-10 rounded-[2rem] shadow-2xl flex flex-col justify-center relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
            <div className="text-9xl">📅</div>
          </div>
          <div className="text-blue-100 text-2xl font-bold uppercase tracking-widest mb-4 flex items-center gap-3">
            <span className="bg-white/20 px-4 py-1 rounded-full">{event.starttime} — {event.endtime}</span>
          </div>
          <h2 className="text-6xl font-black leading-tight text-white drop-shadow-lg">
            {event.name}
          </h2>
          <div className="mt-6 flex gap-4 text-blue-100/80 font-bold uppercase text-sm tracking-widest">
            <span>Třídy: {event.classids?.map(id => data.lookup.classes.data[id]).join(', ') || 'Celá škola'}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

export default App;