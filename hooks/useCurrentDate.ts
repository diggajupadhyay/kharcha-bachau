import { useState, useEffect, useMemo } from 'react';
import { todayISO } from '../utils/date';

/**
 * Hook that returns the current date in YYYY-MM-DD format (local time)
 * Recalculates once per day (at midnight) to avoid unnecessary updates
 */
export const useCurrentDate = (): string => {
  const [currentDate, setCurrentDate] = useState(() => todayISO());

  useEffect(() => {
    const updateDate = () => setCurrentDate(todayISO());

    // Update date at midnight
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const msUntilMidnight = midnight.getTime() - now.getTime();

    const timeoutId = setTimeout(() => {
      updateDate();
      const intervalId = setInterval(updateDate, 24 * 60 * 60 * 1000);
      return () => clearInterval(intervalId);
    }, msUntilMidnight);

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

