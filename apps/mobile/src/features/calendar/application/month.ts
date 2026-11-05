/** Pure calendar math on ISO dates (UTC arithmetic, so device time zone never shifts a day). */

export interface MonthRef {
  year: number;
  /** 0–11 */
  month: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function isoOf(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

export function monthOf(isoDate: string): MonthRef {
  return { year: Number(isoDate.slice(0, 4)), month: Number(isoDate.slice(5, 7)) - 1 };
}

export function shiftMonth(m: MonthRef, delta: number): MonthRef {
  const total = m.year * 12 + m.month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

export function daysIn(m: MonthRef): number {
  return new Date(Date.UTC(m.year, m.month + 1, 0)).getUTCDate();
}

export function monthRange(m: MonthRef): { from: string; to: string } {
  return { from: isoOf(m.year, m.month, 1), to: isoOf(m.year, m.month, daysIn(m)) };
}

/**
 * Weeks of the month as rows of 7 cells (Monday first). Cells outside the
 * month are null, so the grid never shows (or queries) neighbouring days.
 */
export function monthGrid(m: MonthRef): (string | null)[][] {
  const firstWeekday = (new Date(Date.UTC(m.year, m.month, 1)).getUTCDay() + 6) % 7; // Mon = 0
  const cells: (string | null)[] = Array.from({ length: firstWeekday }, () => null);
  for (let d = 1; d <= daysIn(m); d++) cells.push(isoOf(m.year, m.month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
