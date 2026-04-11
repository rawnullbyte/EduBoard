import { useCallback, useEffect, useMemo, useState } from 'react';

const REFRESH_INTERVAL_SECONDS = 60;
const STALE_THRESHOLD_MS = REFRESH_INTERVAL_SECONDS * 2000;

export const DEFAULT_EDUBOARD_RESPONSE = {
  lookup: {},
  timetable: { classes: [] },
  events: { classes: [] },
};

const fetchJson = async (path) => {
  const response = await fetch(path, { cache: 'no-store' });
  const payload = await response.text();
  if (!response.ok) {
    throw new Error(`${path} ${response.status} ${payload}`);
  }
  if (!payload) {
    return null;
  }
  try {
    return JSON.parse(payload);
  } catch (err) {
    throw new Error(`${path} json parse failed: ${err.message}`);
  }
};

export const useEduBoardData = () => {
  const [data, setData] = useState(DEFAULT_EDUBOARD_RESPONSE);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [lastSuccess, setLastSuccess] = useState(null);
  const [lastAttempt, setLastAttempt] = useState(null);

  const refresh = useCallback(async () => {
    setLastAttempt(Date.now());
    setStatus((prev) => (prev === 'loading' ? 'loading' : 'refreshing'));
    try {
      const [lookup, timetable, events] = await Promise.all([
        fetchJson('/api/data'),
        fetchJson('/api/timetable'),
        fetchJson('/api/events'),
      ]);

      const combined = {
        lookup: lookup ?? {},
        timetable: timetable ?? { classes: [] },
        events: events ?? { classes: [] },
      };

      setData(combined);
      const reportedError = lookup?.error || timetable?.error || events?.error || '';
      setError(reportedError);
      setLastSuccess(Date.now());
      setStatus('ready');
    } catch (err) {
      console.error('EduBoard refresh failed', err);
      setError('Nepodařilo se načíst data. Kontaktujte správce.');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    const triggerRefresh = async () => {
      await refresh();
    };

    void triggerRefresh();
    const timer = setInterval(() => {
      void triggerRefresh();
    }, REFRESH_INTERVAL_SECONDS * 1000);
    return () => clearInterval(timer);
  }, [refresh]);

  const stale = useMemo(() => {
    if (!lastSuccess) {
      return status !== 'loading';
    }
    if (!lastAttempt) {
      return false;
    }
    return lastAttempt - lastSuccess > STALE_THRESHOLD_MS;
  }, [lastAttempt, lastSuccess, status]);

  return {
    data,
    status,
    error,
    stale,
    lastSuccess,
    lastAttempt,
    refresh,
  };
};
