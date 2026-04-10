import React, { useState, useEffect, useMemo } from 'react';

// --- Constants & Config ---
const CYCLE_TIME = 10; // Seconds per view
const REFRESH_INTERVAL = 60; // Seconds to fetch new data
const ROWS_PER_PAGE = 5;

const App = () => {
  const [data, setData] = useState({ lookup: {}, timetable: null, events: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0); // Index for rotation
  const [currentTime, setCurrentTime] = useState(new Date());

  // --- Data Fetching ---
  const fetchData = async () => {
    try {
      const [resLookup, resTT, resEvents] = await Promise.all([
        fetch('/api/data').then(r => r.json()),
        fetch('/api/timetable').then(r => r.json()),
        fetch('/api/events').then(r => r.json())
      ]);

      setData({
        lookup: resLookup,
        timetable: resTT,
        events: resEvents
      });
      setLoading(false);
    } catch (err) {
      console.error("Fetch error:", err);
      setError("Failed to sync with EduPage");
    }
  };

  useEffect(() => {
    fetchData();
    const dataTimer = setInterval(fetchData, REFRESH_INTERVAL * 1000);
    const clockTimer = setInterval(() => setCurrentTime(new Date()), 10000); // Update clock every 10s
    return () => { clearInterval(dataTimer); clearInterval(clockTimer); };
  }, []);

  // --- View Rotation Logic ---
  const views = useMemo(() => {
    if (!data.timetable || !data.events) return [];

    const ttPages = [];
    const ttClasses = data.timetable.classes || [];
    for (let i = 0; i < ttClasses.length; i += ROWS_PER_PAGE) {
      ttPages.push({
        type: 'timetable',
        data: ttClasses.slice(i, i + ROWS_PER_PAGE),
        page: Math.floor(i / ROWS_PER_PAGE) + 1,
        total: Math.ceil(ttClasses.length / ROWS_PER_PAGE)
      });
    }
    return [...ttPages, { type: 'events' }];
  }, [data]);

  useEffect(() => {
    if (views.length === 0) return;

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          setCurrentIndex((old) => (old + 1) % views.length);
          return 0;
        }
        return prev + (100 / (CYCLE_TIME * 10)); // Updates every 100ms
      });
    }, 100);

    return () => clearInterval(timer);
  }, [views.length]);

  if (loading) return (
    <div className="h-screen w-screen flex items-center justify-center bg-slate-50 text-[2vw] font-bold text-slate-900">
      Initializing Dashboard...
    </div>
  );

  if (error) return (
    <div className="h-screen w-screen flex items-center justify-center bg-red-50 text-red-600 text-[2vw]">
      ⚠️ {error}
    </div>
  );

  const currentView = views[currentIndex];

  return (
    <div className="h-screen w-screen bg-[#f1f5f9] overflow-hidden flex flex-col font-sans text-[#0f172a]">
      {/* Progress Bar */}
      <div className="w-full h-[0.8vh] bg-slate-200">
        <div
          className="h-full bg-blue-600 transition-all duration-100 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Header */}
      <header className="h-[10vh] flex justify-between items-center px-[2vw] bg-white shadow-sm">
        <h1 className="text-[2.2vw] font-bold">
          {currentView.type === 'timetable' ? 'School Timetable' : 'Upcoming Events'}
        </h1>
        <div className="flex items-center gap-[2vw]">
          {currentView.type === 'timetable' && (
            <span className="text-[1vw] text-slate-500 font-medium bg-slate-100 px-[1vw] py-[0.5vh] rounded-[0.5vw]">
              Page {currentView.page} of {currentView.total}
            </span>
          )}
          <div className="text-[1.8vw] font-mono font-bold">
            {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-[1.5vw] overflow-hidden">
        {currentView.type === 'timetable' ? (
          <Timetable data={data} rows={currentView.data} currentTime={currentTime} />
        ) : (
          <Events data={data} />
        )}
      </main>
    </div>
  );
};

// --- Sub-Components ---

const Timetable = ({ data, rows, currentTime }) => {
  const periods = Object.values(data.lookup.periods.data).sort((a, b) => a.period - b.period);
  const currentHM = `${currentTime.getHours().toString().padStart(2, '0')}:${currentTime.getMinutes().toString().padStart(2, '0')}`;

  const getActivePeriod = (start, end) => (currentHM >= start && currentHM <= end);

  return (
    <div
      className="h-full grid bg-white rounded-[0.8vw] shadow-md overflow-hidden border border-[#e2e8f0] min-h-0"
      style={{
        // Using auto for header and 1fr for rows ensures they fill 100% of the parent exactly
        gridTemplateColumns: `minmax(8vw, auto) repeat(${periods.length}, minmax(0, 1fr))`,
        gridTemplateRows: `auto repeat(${ROWS_PER_PAGE}, 1fr)`
      }}
    >
      {/* Header Row - Use py to control height naturally */}
      <div className="bg-slate-50 border-b border-r border-slate-200 flex items-center justify-center font-bold text-[0.8vw] text-slate-500 py-[1vh]">
        Class
      </div>
      {periods.map(p => (
        <div key={p.period} className="bg-slate-50 border-b border-r border-slate-200 flex flex-col items-center justify-center py-[1vh]">
          <span className="text-[0.9vw] font-bold text-slate-900">{p.short}</span>
          <span className="text-[0.6vw] text-slate-500">{p.start} - {p.end}</span>
        </div>
      ))}

      {/* Class Rows */}
      {rows.map((cls, rowIndex) => (
        <React.Fragment key={cls.id}>
          <div className={`border-r border-b border-slate-100 flex items-center justify-center font-bold text-[1vw] ${rowIndex % 2 === 0 ? 'bg-white' : 'bg-[#fafbfc]'}`}>
            {data.lookup.classes.data[cls.id]}
          </div>

          {periods.map(p => {
            const lesson = cls.ttitems.find(item => item.uniperiod === p.period);
            const isActive = getActivePeriod(p.start, p.end);

            if (!lesson) return <div key={p.period} className={`border-r border-b border-slate-100 ${isActive ? 'bg-[#eef2ff]' : ''}`} />;

            return (
              <div
                key={p.period}
                style={{
                  gridColumnEnd: `span ${lesson.durationperiods || 1}`,
                  backgroundColor: lesson.colors?.[0] ? `${lesson.colors[0]}22` : 'white',
                  borderLeft: isActive ? '0.3vw solid #4f46e5' : ''
                }}
                className={`border-r border-b border-slate-100 p-[0.8vh] flex flex-col justify-center overflow-hidden relative ${isActive ? 'bg-[#eef2ff]' : ''}`}
              >
                <div className="flex justify-between items-start leading-tight">
                  <span className="text-[0.85vw] font-bold truncate" style={{ color: lesson.colors?.[0] || '#0f172a' }}>
                    {data.lookup.subjects.data[lesson.subjectid]}
                  </span>
                </div>
                <div className="text-[0.7vw] text-slate-600 truncate leading-tight">
                  {lesson.teacherids?.map(id => data.lookup.teachers.data[id]).join(', ')}
                </div>
                <div className="text-[0.65vw] text-slate-400 truncate mt-1">
                  {lesson.classroomids?.map(id => data.lookup.classrooms.data[id]).join(', ')}
                </div>
              </div>
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
};

const Events = ({ data }) => {
  const eventItems = data.events.classes.flatMap(c => c.ttitems.filter(i => i.type === 'event'));

  return (
    <div className="grid grid-cols-3 gap-[1.5vw] h-full overflow-hidden">
      {eventItems.length > 0 ? eventItems.map((event, idx) => (
        <div key={idx} className="bg-white p-[1.5vw] rounded-[0.8vw] shadow-md border border-slate-200 flex flex-col gap-[1vh]">
          <div className="flex justify-between items-start">
            <h3 className="text-[1.2vw] font-bold text-slate-900">{event.name}</h3>
            <span className="bg-green-100 text-green-700 text-[0.7vw] px-[0.6vw] py-[0.2vh] rounded-full font-bold">LIVE</span>
          </div>
          <div className="text-[0.9vw] text-blue-600 font-medium">
            {event.starttime} - {event.endtime}
          </div>
          <div className="mt-auto border-t border-slate-100 pt-[1vh]">
            <p className="text-[0.7vw] text-slate-500">Teachers: {event.teacherids?.map(id => data.lookup.teachers.data[id]).join(', ')}</p>
            <p className="text-[0.7vw] text-slate-500">Classes: {event.classids?.map(id => data.lookup.classes.data[id]).join(', ')}</p>
          </div>
        </div>
      )) : (
        <div className="col-span-3 flex items-center justify-center text-slate-400 text-[1.5vw]">
          No events scheduled for today.
        </div>
      )}
    </div>
  );
};

export default App;