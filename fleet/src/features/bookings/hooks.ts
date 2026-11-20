// Small React hooks the bookings pages share: the time (ticking), the screen size, and the
// signed-in person as a booker.

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useSession } from '@/data/session';
import type { Booker } from './availability';

/** Now, in ms, refreshed every `everyMs` (the now line, overdue hires). */
export function useNow(everyMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}

/** Whether a media query matches, kept up to date. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = matchMedia(query);
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    },
    () => matchMedia(query).matches,
    () => false,
  );
}

/** Wide enough for the timeline (the md breakpoint). */
export const useWide = () => useMediaQuery('(min-width: 768px)');

/** The signed-in person as the pool and licence checks read them, and their pools' ids. */
export function useBooker(): { booker: Booker | undefined; poolIds: string[] } {
  const { account, me } = useSession();
  return useMemo(() => {
    if (!account || !me) return { booker: undefined, poolIds: [] };
    return {
      booker: { name: me.name, poolsRel: account.poolsRel, licencesRel: account.licencesRel, licenceExpiryDate: account.licenceExpiryDate },
      poolIds: (account.poolsRel ?? []).map((p) => p.documentId),
    };
  }, [account, me]);
}
