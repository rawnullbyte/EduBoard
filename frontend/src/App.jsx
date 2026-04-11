import React, { useEffect, useMemo, useState } from 'react';

const CYCLE_TIME = 10;
const REFRESH_INTERVAL = 60;
const ROWS_PER_PAGE = 6;
const EMPTY_DATA = {
  lookup: {},
  timetable: { classes: [] },
  events: { classes: [] },
};

const getLessonStyle = (hexColor) => {
  if (!hexColor) {
    return { backgroundColor: 'rgba(255,255,255,0.05)', color: '#ffffff' };
  }

  const color = hexColor.replace('#', '');
  const r = parseInt(color.slice(0, 2), 16);
  const g = parseInt(color.slice(2, 4), 16);
  const b = parseInt(color.slice(4, 6), 16);
  const brightness = ((r * 299) + (g * 587) + (b * 114)) / 1000;

  return {
    backgroundColor: `#${color}`,
    color: brightness >= 128 ? '#1a1a1a' : '#ffffff',
    boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)',
  };
};

const joinMappedValues = (ids, table) =>
  (ids ?? [])
    .map((id) => table?.[id])
    .filter(Boolean)
    .join(', ');

const EmptyState = ({ title, subtitle }) => (
  <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center px-8">
    <div className="text-8xl mb-6 opacity-20">🗂️</div>
    <p className="text-3xl font-light tracking-widest uppercase">{title}</p>
    {subtitle ? (
      <p className="mt-4 text-sm uppercase tracking-[0.3em] text-slate-600">{subtitle}</p>
    ) : null}
  </div>
);

const App = () => {
  const [data, setData] = useState(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());

  const fetchData = async () => {
    try {
      const [lookup, timetable, events] = await Promise.all([
        fetch('/api/data').then((response) => response.json()),
        fetch('/api/timetable').then((response) => response.json()),
        fetch('/api/events').then((response) => response.json()),
      ]);

      setData({
        lookup: lookup ?? {},
        timetable: timetable ?? { classes: [] },
        events: events ?? { classes: [] },
      });
      setError(lookup?.error || timetable?.error || events?.error || '');
    } catch (err) {
      console.error('Data refresh failed', err);
      setError('Nepodarilo se nacist data z EduBoard serveru.');
      setData(EMPTY_DATA);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const dataTimer = setInterval(fetchData, REFRESH_INTERVAL * 1000);
    const clockTimer = setInterval(() => setCurrentTime(new Date()), 1000);

    return () => {
      clearInterval(dataTimer);
      clearInterval(clockTimer);
    };
  }, []);

  const views = useMemo(() => {
    const pages = [];
    const classes = data.timetable?.classes ?? [];

    for (let index = 0; index < classes.length; index += ROWS_PER_PAGE) {
      pages.push({
        type: 'timetable',
        data: classes.slice(index, index + ROWS_PER_PAGE),
        page: Math.floor(index / ROWS_PER_PAGE) + 1,
        total: Math.ceil(classes.length / ROWS_PER_PAGE),
      });
    }

    pages.push({ type: 'pure_events' });
    return pages;
  }, [data.timetable]);

  useEffect(() => {
    setCurrentIndex((prev) => {
      if (views.length === 0) {
        return 0;
      }
      return prev % views.length;
    });
    setProgress(0);
  }, [views.length]);

  useEffect(() => {
    if (views.length <= 1) {
      return undefined;
    }

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

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#020617] text-blue-400 font-light text-3xl tracking-widest">
        NACITANI SYSTEMU...
      </div>
    );
  }

  const currentView = views[currentIndex] ?? { type: 'pure_events' };

  return (
    <div className="h-screen w-screen bg-[#020617] text-slate-100 flex flex-col overflow-hidden font-sans">
      <div className="w-full h-1.5 bg-slate-900">
        <div
          className="h-full bg-gradient-to-r from-blue-600 to-cyan-400 transition-all duration-100 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>

      <header className="px-10 py-6 flex justify-between items-center bg-slate-900/40 border-b border-slate-800">
        <div className="flex flex-col gap-2">
          <div className="flex flex-col">
            <h1 className="text-4xl font-black uppercase tracking-tighter text-white">
              {currentView.type === 'timetable' ? 'Skolni Rozvrh' : 'Dnesni Udalosti'}
            </h1>
            {currentView.type === 'timetable' ? (
              <span className="text-blue-400 font-bold text-sm tracking-widest">
                STRANA {currentView.page} / {currentView.total}
              </span>
            ) : null}
          </div>

          {error ? (
            <div className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1 text-xs font-bold uppercase tracking-[0.2em] text-amber-200">
              Omezeny rezim: {error}
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-8">
          <div className="text-right">
            <div className="text-5xl font-mono font-bold text-white leading-none">
              {currentTime.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div className="text-slate-400 text-sm font-medium mt-1 uppercase tracking-widest">
              {currentTime.toLocaleDateString('cs-CZ', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </div>
          </div>
        </div>
      </header>

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
  const lookup = data.lookup ?? {};
  const periods = Object.values(lookup.periods?.data ?? {}).sort(
    (left, right) => (left.period ?? 0) - (right.period ?? 0),
  );
  const classMap = lookup.classes?.data ?? {};
  const subjectMap = lookup.subjects?.data ?? {};
  const classroomMap = lookup.classrooms?.data ?? {};
  const teacherMap = lookup.teachers?.data ?? {};

  if (periods.length === 0 || rows.length === 0) {
    return (
      <EmptyState
        title="Rozvrh neni k dispozici"
        subtitle="EduBoard ceka na data z EduPage"
      />
    );
  }

  return (
    <div
      className="h-full w-full grid gap-2"
      style={{
        gridTemplateColumns: `minmax(120px, 1fr) repeat(${periods.length}, 3fr)`,
        gridTemplateRows: `auto repeat(${ROWS_PER_PAGE}, 1fr)`,
      }}
    >
      <div className="bg-slate-800/60 rounded-xl flex items-center justify-center font-black text-slate-500 text-xs tracking-widest uppercase">
        Trida
      </div>
      {periods.map((period) => (
        <div
          key={period.period}
          className="bg-slate-800/40 rounded-xl flex flex-col items-center justify-center p-2 border border-slate-800"
        >
          <span className="text-2xl font-black text-white leading-none">{period.short}</span>
          <span className="text-[10px] text-blue-400 font-bold mt-1 opacity-80">
            {period.start} - {period.end}
          </span>
        </div>
      ))}

      {rows.map((classRow) => (
        <React.Fragment key={classRow.id}>
          <div className="bg-blue-900/20 rounded-xl flex items-center justify-center text-3xl font-black text-white border border-blue-900/30">
            {classMap[classRow.id] || classRow.id || '-'}
          </div>

          {periods.map((period) => {
            const lesson = classRow.ttitems.find((item) => item.uniperiod === period.period);
            if (!lesson) {
              return (
                <div
                  key={period.period}
                  className="bg-slate-900/30 rounded-xl border border-slate-800/20"
                />
              );
            }

            const style = getLessonStyle(lesson.colors?.[0]);
            const classroomNames = joinMappedValues(lesson.classroomids, classroomMap);
            const teacherNames = joinMappedValues(lesson.teacherids, teacherMap);

            return (
              <div
                key={period.period}
                style={style}
                className="p-3 flex flex-col justify-center overflow-hidden rounded-xl transition-all border border-black/10"
              >
                <div className="text-xl font-black truncate mb-1 leading-none uppercase">
                  {subjectMap[lesson.subjectid] || lesson.name || 'Neznamy predmet'}
                </div>
                <div className="flex flex-col gap-0.5 opacity-90">
                  <span className="text-xs font-bold truncate">
                    Ucebna: {classroomNames || '-'}
                  </span>
                  <span className="text-[10px] font-medium truncate uppercase tracking-tighter">
                    Ucitel: {teacherNames || '-'}
                  </span>
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
  const classMap = data.lookup?.classes?.data ?? {};
  const allEvents =
    data.events?.classes?.flatMap((entry) =>
      (entry.ttitems ?? []).filter((item) => item.type === 'event' || item.name),
    ) ?? [];

  const uniqueEvents = Array.from(
    new Map(
      allEvents.map((item) => [
        item.eventid ?? `${item.name || 'event'}:${item.starttime || ''}:${item.endtime || ''}`,
        item,
      ]),
    ).values(),
  );

  if (uniqueEvents.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-600">
        <div className="text-9xl mb-6 opacity-20">🗓️</div>
        <p className="text-3xl font-light tracking-widest uppercase">
          Dnes nejsou planovany zadne udalosti
        </p>
      </div>
    );
  }

  return (
    <div className="h-full grid grid-cols-2 gap-8 content-start">
      {uniqueEvents.map((event) => (
        <div
          key={event.eventid ?? `${event.name}:${event.starttime}:${event.endtime}`}
          className="bg-gradient-to-br from-blue-600 to-indigo-700 p-10 rounded-[2rem] shadow-2xl flex flex-col justify-center relative overflow-hidden group"
        >
          <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
            <div className="text-9xl">📅</div>
          </div>

          <div className="text-blue-100 text-2xl font-bold uppercase tracking-widest mb-4 flex items-center gap-3">
            <span className="bg-white/20 px-4 py-1 rounded-full">
              {event.starttime || '--:--'} - {event.endtime || '--:--'}
            </span>
          </div>

          <h2 className="text-6xl font-black leading-tight text-white drop-shadow-lg">
            {event.name || 'Udalost bez nazvu'}
          </h2>

          <div className="mt-6 flex gap-4 text-blue-100/80 font-bold uppercase text-sm tracking-widest">
            <span>
              Tridy: {joinMappedValues(event.classids, classMap) || 'Cela skola'}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};

export default App;
