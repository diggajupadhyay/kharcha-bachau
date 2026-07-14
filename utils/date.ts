/**
 * Returns the current date as a YYYY-MM-DD string in LOCAL time.
 * Using local time (not toISOString/UTC) keeps date-only comparisons
 * consistent with how expenses are stored (format(date, 'yyyy-MM-dd')).
 */
export const todayISO = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
