/**
 * Format a calendar date as 'YYYY-MM-DD'.
 *
 * Do NOT use `toISOString().split('T')[0]` for calendar dates. MySQL DATE
 * columns arrive from mysql2 as *local-midnight* Date objects, and
 * `new Date(year, month, day)` is local midnight too. `toISOString()` converts
 * to UTC, which rolls both back one day at any positive UTC offset — the
 * Philippines is UTC+8 — silently shifting billing periods and report labels.
 *
 * Strings that already begin with a calendar date are returned verbatim, so an
 * API value like '2026-09-01' is never re-interpreted through a timezone.
 */
export const toDateOnly = (value: Date | string): string => {
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    value = new Date(value);
  }
  const d = value as Date;
  if (Number.isNaN(d.getTime())) {
    throw new RangeError('Invalid time value');
  }
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
