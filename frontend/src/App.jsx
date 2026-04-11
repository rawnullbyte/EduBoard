import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  Clock as ClockIcon,
  MapPin,
  Sparkles,
  Users,
} from 'lucide-react';
import { useEduBoardData } from './hooks/useEduBoardData';

const CYCLE_TIME = 10;
const ROWS_PER_PAGE = 6;

const getLessonStyle = (hexColor) => {
  if (!hexColor) {
    return {
      backgroundColor: 'rgba(15, 23, 42, 0.85)',
      color: '#cbd5f5',
    };
  }

  const color = hexColor.replace('#', '');
  const r = parseInt(color.slice(0, 2), 16);
  const g = parseInt(color.slice(2, 4), 16);
  const b = parseInt(color.slice(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;

  return {
    backgroundColor: `#${color}`,
    color: brightness >= 128 ? '#1a1a1a' : '#ffffff',
    boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.2)',
  };
};

const joinMappedValues = (ids, table) =>
  (ids ?? [])
    .map((id) => table?.[id])
    .filter(Boolean)
    .join(', ');

const StatusPill = ({ variant = 'ready', label, icon: Icon }) => {
  const variantClasses = {
    ready: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200',
    stale: 'border-amber-400/40 bg-amber-500/10 text-amber-200',
    alert: 'border-rose-500/40 bg-rose-500/10 text-rose-200',
    outline: 'border-white/20 bg-white/5 text-slate-100',
  };

  return (
    <div
      role="status"
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-1 text-xs font-semibold uppercase tracking-[0.5em] ${variantClasses[variant]}`}
    >
      {Icon ? <Icon className="h-4 w-4" /> : null}
      <span>{label}</span>
    </div>
  );
};

const ProgressBar = ({ progress }) => (
  <div className="h-1 w-full bg-white/5">
    <div
      className="h-full bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 transition-all duration-200"
      style={{ width: `${progress}%` }}
    />
  </div>
);

const EmptyState = ({ title, subtitle, icon: Icon }) => (
  <div className="h-full w-full flex flex-col items-center justify-center gap-4 text-center text-slate-300">
    {Icon ? <Icon className="h-20 w-20 text-white/30" /> : <span className="text-5xl">🛠️</span>}
    <p className="text-3xl font-black uppercase tracking-[0.6em]">{title}</p>
    {subtitle ? <p className="text-xs uppercase tracking-[0.4em] text-slate-500">{subtitle}</p> : null}
  </div>
);

const LoadingScene = () => (
  <div className="min-h-screen w-screen bg-slate-950 text-white flex items-center justify-center">
    <div className="text-center">
      <p className="text-xs uppercase tracking-[0.7em] text-slate-400">EduBoard kiosk</p>
      <p className="mt-4 text-5xl font-black uppercase tracking-[0.4em]">NAČÍTÁNÍ</p>
      <p className="mt-2 text-lg font-light uppercase tracking-[0.4em] text-slate-500">Prosím vyčkejte</p>
    </div>
  </div>
);

const App = () => {
  const { data, status, error, stale, lastSuccess } = useEduBoardData();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());

  const rows = useMemo(() => data.timetable?.classes ?? [], [data.timetable]);
  const lookup = useMemo(() => data.lookup ?? {}, [data.lookup]);

  const periods = useMemo(() => {
    const raw = lookup.periods?.data ?? {};
    return Object.values(raw)
      .filter(Boolean)
      .sort((left, right) => (left.period ?? 0) - (right.period ?? 0));
  }, [lookup]);

  const lookupTables = useMemo(
    () => ({
      classes: lookup.classes?.data ?? {},
      subjects: lookup.subjects?.data ?? {},
      classrooms: lookup.classrooms?.data ?? {},
      teachers: lookup.teachers?.data ?? {},
    }),
    [lookup],
  );

  const periodLookup = useMemo(() => {
    const map = new Map();
    periods.forEach((period) => {
      if (period?.period != null) {
        map.set(period.period, period);
      }
    });
    return map;
  }, [periods]);

  const featuredLesson = useMemo(() => {
    const firstRow = rows[0];
    if (!firstRow) {
      return null;
    }
    const items = firstRow.ttitems ?? [];
    return items[0] ?? null;
  }, [rows]);

  const nowLabel = useMemo(() => {
    if (!featuredLesson) {
      return 'Čekáme na rozvrh';
    }
    const subjectName =
      lookupTables.subjects[featuredLesson.subjectid] || featuredLesson.name || 'Neznámý předmět';
    const periodLabel = periodLookup.get(featuredLesson.uniperiod)?.short;
    return periodLabel ? `${subjectName} · ${periodLabel}` : subjectName;
  }, [featuredLesson, lookupTables.subjects, periodLookup]);

  const views = useMemo(() => {
    const pages = [];
    for (let index = 0; index < rows.length; index += ROWS_PER_PAGE) {
      pages.push({
        type: 'timetable',
        data: rows.slice(index, index + ROWS_PER_PAGE),
        page: Math.floor(index / ROWS_PER_PAGE) + 1,
        total: Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE)),
      });
    }
    pages.push({ type: 'events' });
    return pages;
  }, [rows]);

  useEffect(() => {
    if (views.length <= 1) {
      return undefined;
    }

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          setCurrentIndex((value) => (value + 1) % views.length);
          return 0;
        }
        return prev + 100 / (CYCLE_TIME * 10);
      });
    }, 100);

    return () => clearInterval(timer);
  }, [views.length]);

  useEffect(() => {
    const clockTimer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(clockTimer);
  }, []);

  if (status === 'loading' && rows.length === 0) {
    return <LoadingScene />;
  }

  const safeCurrentIndex = views.length ? currentIndex % views.length : 0;
  const currentView = views[safeCurrentIndex] ?? views[0] ?? { type: 'events' };
  const nowTime = currentTime.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
  const nowDate = currentTime.toLocaleDateString('cs-CZ', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const lastUpdatedLabel = lastSuccess
    ? new Date(lastSuccess).toLocaleTimeString('cs-CZ', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'ještě ne';
  const statusLabel = error
    ? 'Omezený režim'
    : stale
    ? 'Data mohou být zastaralá'
    : 'Data v reálném čase';
  const statusVariant = error ? 'alert' : stale ? 'stale' : 'ready';

  return (
    <div className="min-h-screen w-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      {views.length > 1 ? <ProgressBar progress={progress} /> : null}
      <div className="sticky top-0 z-10">
        <div className="px-10 pb-6 pt-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="flex items-center gap-4">
              <CalendarDays className="h-10 w-10 text-cyan-400" />
              <div>
                <p className="text-xs uppercase tracking-[0.6em] text-slate-400">EduBoard Signal</p>
                <p className="text-4xl font-black uppercase tracking-tight">Aurora Learning Hub</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-5xl font-black uppercase tracking-tight">{nowTime}</p>
              <time
                dateTime={currentTime.toISOString()}
                className="text-sm uppercase tracking-[0.5em] text-slate-400"
              >
                {nowDate}
              </time>
            </div>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-2xl font-black uppercase tracking-[0.4em] text-white">
              <Sparkles className="h-7 w-7 text-amber-300" />
              <span aria-live="polite">{nowLabel}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusPill
                variant="outline"
                icon={ClockIcon}
                label={`Aktualizováno ${lastUpdatedLabel}`}
              />
              <StatusPill variant={statusVariant} icon={Users} label={statusLabel} />
              {stale && !error ? (
                <StatusPill
                  variant="stale"
                  icon={AlertTriangle}
                  label="Data mohou být zastaralá"
                />
              ) : null}
            </div>
          </div>
          {error ? (
            <div className="mt-4">
              <StatusPill variant="alert" icon={AlertTriangle} label={error} />
            </div>
          ) : null}
        </div>
      </div>
      <main className="flex-1 px-10 pb-10 pt-6">
        <div className="flex h-full flex-col gap-4">
          {currentView.type === 'timetable' ? (
            <Timetable rows={currentView.data} periods={periods} lookup={lookupTables} />
          ) : (
            <PureEvents data={data} lookup={lookupTables} />
          )}
        </div>
      </main>
    </div>
  );
};

const Timetable = ({ rows, periods, lookup }) => {
  if (!rows.length || !periods.length) {
    return (
      <EmptyState
        icon={Sparkles}
        title="Rozvrh není k dispozici"
        subtitle="EduBoard čeká na data z EduPage"
      />
    );
  }

  const { classes: classMap, subjects: subjectMap, classrooms, teachers } = lookup;

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto pr-2 pb-2">
      {rows.map((classRow) => {
        const lessonMap = (classRow.ttitems ?? []).reduce((acc, item) => {
          if (item?.uniperiod != null) {
            acc[item.uniperiod] = item;
          }
          return acc;
        }, {});

        const classLabel = classMap[classRow.id] || classRow.id || 'Neznámá třída';

        return (
          <article
            key={classRow.id}
            className="rounded-[2.5rem] border border-white/5 bg-slate-900/60 p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-3xl font-black uppercase tracking-tight text-white">{classLabel}</p>
                <p className="text-xs uppercase tracking-[0.5em] text-slate-500">Přehled hodin</p>
              </div>
              <div className="text-right text-xs uppercase tracking-[0.5em] text-slate-500">
                {periods.length} hodin
              </div>
            </div>
            <div className="mt-5 grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
              {periods.map((period) => {
                const lesson = lessonMap[period.period];
                if (!lesson) {
                  return (
                    <div
                      key={`${classRow.id}-${period.period}-empty`}
                      className="min-h-[150px] rounded-2xl border border-white/10 bg-slate-950/40 p-4"
                    >
                      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.5em] text-slate-500">
                        <span>{period.short}</span>
                        <span>
                          {period.start} - {period.end}
                        </span>
                      </div>
                      <div className="mt-4 text-sm font-semibold uppercase tracking-[0.5em] text-slate-400">
                        Volno
                      </div>
                    </div>
                  );
                }

                const style = getLessonStyle(lesson.colors?.[0]);
                const subject = subjectMap[lesson.subjectid] || lesson.name || 'Neznámý předmět';
                const classroomNames = joinMappedValues(lesson.classroomids, classrooms);
                const teacherNames = joinMappedValues(lesson.teacherids, teachers);

                return (
                  <div
                    key={`${classRow.id}-${period.period}`}
                    className="min-h-[160px] rounded-[1.8rem] p-4"
                    style={style}
                  >
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.5em]">
                      <span>{period.short}</span>
                      <span>
                        {period.start} - {period.end}
                      </span>
                    </div>
                    <div className="mt-4 text-2xl font-black uppercase leading-tight tracking-tight">
                      {subject}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-3 text-[10px] uppercase tracking-[0.4em]">
                      <span className="flex items-center gap-2 text-white/90">
                        <MapPin className="h-3 w-3" />
                        {classroomNames || 'Učebna neuvedena'}
                      </span>
                      <span className="flex items-center gap-2 text-white/80">
                        <Users className="h-3 w-3 text-white/80" />
                        {teacherNames || 'Učitel neuveden'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </article>
        );
      })}
    </div>
  );
};

const PureEvents = ({ data, lookup }) => {
  const allEvents =
    data.events?.classes?.flatMap((entry) =>
      (entry.ttitems ?? []).filter((item) => item.type === 'event' || item.name),
    ) ?? [];

  const uniqueEvents = Array.from(
    new Map(
      allEvents.map((item) => [
        item.eventid ?? `${item.name}:${item.starttime || ''}:${item.endtime || ''}`,
        item,
      ]),
    ).values(),
  );

  if (!uniqueEvents.length) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="Dnes nic nepřipomínáme"
        subtitle="Žádné naplánované události"
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto pb-2">
      <div className="grid min-h-full gap-6 md:grid-cols-2 xl:grid-cols-3">
        {uniqueEvents.map((event) => (
          <EventCard key={event.eventid || `${event.name}:${event.starttime}`} event={event} lookup={lookup} />
        ))}
      </div>
    </div>
  );
};

const EventCard = ({ event, lookup }) => {
  const { classes: classMap, classrooms } = lookup;
  const timeline = `${event.starttime || '--:--'} - ${event.endtime || '--:--'}`;
  const classNames = joinMappedValues(event.classids, classMap);
  const roomNames = joinMappedValues(event.classroomids, classrooms);

  return (
    <article className="flex h-full flex-col justify-between gap-4 overflow-hidden rounded-[2.5rem] border border-white/10 bg-gradient-to-br from-blue-700/90 via-indigo-900/80 to-slate-900/80 p-8 shadow-2xl">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.6em] text-blue-200/80">
        <div className="flex items-center gap-2">
          <ClockIcon className="h-4 w-4" />
          <span>{timeline}</span>
        </div>
        <span>{(event.type || 'Událost').toUpperCase()}</span>
      </div>
      <h3
        className="text-4xl font-black leading-tight text-white"
        style={{
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {event.name || 'Událost bez názvu'}
      </h3>
      <div className="flex flex-col gap-2 text-sm uppercase tracking-[0.5em] text-blue-100/80">
        <span className="flex items-center gap-2">
          <Users className="h-4 w-4" />
          <span>{classNames || 'Celá škola'}</span>
        </span>
        {roomNames ? (
          <span className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            <span>{roomNames}</span>
          </span>
        ) : null}
      </div>
      {event.description ? (
        <p
          className="text-sm text-white/85"
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {event.description}
        </p>
      ) : null}
    </article>
  );
};

export default App;
