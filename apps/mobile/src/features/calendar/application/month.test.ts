import { describe, expect, it } from 'vitest';
import { monthGrid, monthOf, monthRange, shiftMonth } from './month';

describe('month math', () => {
  it('builds a Monday-first grid with empty padding', () => {
    const grid = monthGrid({ year: 2026, month: 10 }); // November 2026 starts on a Sunday
    expect(grid[0]).toEqual([null, null, null, null, null, null, '2026-11-01']);
    expect(grid.flat().filter(Boolean)).toHaveLength(30);
    expect(grid.every((w) => w.length === 7)).toBe(true);
  });

  it('handles leap years and month shifts across years', () => {
    expect(monthRange({ year: 2028, month: 1 })).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
    expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(monthOf('2026-11-05')).toEqual({ year: 2026, month: 10 });
  });
});
