import { useState, useEffect, useMemo } from 'react';

/**
 * Hook that returns the current date in YYYY-MM-DD format
 * Recalculates once per day (at midnight) to avoid unnecessary updates
 */
export const useCurrentDate = (): string => {
  const [currentDate, setCurrentDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  useEffect(() => {
    const updateDate = () => {
      const today = new Date().toISOString().split('T')[0];
      setCurrentDate(today);
    };

    // Update date at midnight
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const msUntilMidnight = midnight.getTime() - now.getTime();

    // Set timeout for next midnight
    const timeoutId = setTimeout(() => {
      updateDate();
      // Then update every 24 hours
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
  return useMemo(() => {
    return new Date().toISOString().split('T')[0];
  }, []); // Only calculate once on mount
};

