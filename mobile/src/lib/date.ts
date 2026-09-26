/**
 * Returns the current date as a YYYY-MM-DD string in LOCAL time.
 * Using local time (not toISOString/UTC) keeps date-only comparisons
 * consistent with how expenses are stored.
 */
export const todayISO = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/** True only for a real calendar date written as YYYY-MM-DD. */
export const isISODate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const parsed = new Date(y, m - 1, d);
  return parsed.getFullYear() === y && parsed.getMonth() === m - 1 && parsed.getDate() === d;
};

/**
 * Parses a YYYY-MM-DD string into a local-midnight Date.
 *
 * `new Date('2026-08-11')` is defined to parse as *UTC* midnight, which is the
 * previous day everywhere west of Greenwich and the same day at a different instant
 * everywhere east of it. Passing the parts to the constructor keeps everything local,
 * matching how expense dates are written.
 */
export const parseISODate = (value: string): Date | null => {
  if (!isISODate(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** Adds (or subtracts) whole days to a YYYY-MM-DD string, staying in local time. */
export const shiftISODate = (value: string, days: number): string => {
  const base = parseISODate(value);
  if (!base) return value;
  base.setDate(base.getDate() + days);
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, '0');
  const d = String(base.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
