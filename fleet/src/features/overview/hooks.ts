// Small hooks the overview, assets and map pages share: clocks for "today" and relative times, a
// periodic refresh, and debouncing.

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { addDays, startOfDay } from '@/domain/logic/time';

/** Local midnight of today; changes at midnight (so day-based searches stay put all day). */
export function useToday(): number {
  const [today, setToday] = useState(() => startOfDay(Date.now()));
  useEffect(() => {
    const timer = setTimeout(() => setToday(startOfDay(Date.now())), addDays(today, 1) - Date.now() + 1000);
    return () => clearTimeout(timer);
  }, [today]);
  return today;
}

/** The time, updated every `ms` (for "5 minutes ago" and "overdue" in the page). */
export function useNow(ms = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return now;
}

/** Refreshes the page's searches every `ms` while it is open and visible (a dashboard on a wall). */
export function useAutoRefresh(ms = 120_000) {
  const client = useQueryClient();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void client.invalidateQueries({ queryKey: ['search'] });
    }, ms);
    return () => clearInterval(timer);
  }, [client, ms]);
}

/** A value that follows another after it has stopped changing for `ms` (typing in a search box). */
export function useDebounced<T>(value: T, ms = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/** Whether a media query matches (e.g. a wide screen), following changes. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof matchMedia === 'function' && matchMedia(query).matches);
  useEffect(() => {
    const media = matchMedia(query);
    const onChange = () => setMatches(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}
