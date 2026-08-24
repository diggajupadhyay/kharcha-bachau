import { useState, useEffect, useMemo } from 'react';
import { todayISO } from '../utils/date';

/**
 * Hook that returns the current date in YYYY-MM-DD format (local time)
 * Recalculates once per day (at midnight) to avoid unnecessary updates
 */
export const useCurrentDate = (): string => {
  const [currentDate, setCurrentDate] = useState(() => todayISO());

  useEffect(() => {
    // Re-armed from the clock every time instead of running on a fixed 24-hour
    // interval. A fixed interval drifts off midnight by an hour at each daylight
    // saving transition, and never recovers — "Today" then flips an hour early or
    // late for the rest of the session.
    let timeoutId: ReturnType<typeof setTimeout>;

    const scheduleNext = () => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      // A one-second cushion: firing exactly on the boundary can still read the
      // previous day back out of the clock.
      timeoutId = setTimeout(() => {
        setCurrentDate(todayISO());
        scheduleNext();
      }, Math.max(1000, midnight.getTime() - now.getTime() + 1000));
    };

    scheduleNext();
    return () => clearTimeout(timeoutId);
  }, []);

  return currentDate;
};

/**
 * Memoized version that only recalculates once per day
 * Use this for components that need current date but don't need real-time updates
 */
export const useCurrentDateMemo = (): string => {
  return useMemo(() => todayISO(), []); // Only calculate once on mount
};

