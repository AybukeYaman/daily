import { describe, expect, it } from 'vitest';
import { distribution, frameHealth } from './latency-stats';

describe('latency stats', () => {
  it('computes percentiles', () => {
    const d = distribution(Array.from({ length: 100 }, (_, i) => i + 1));
    expect(d).toEqual({ count: 100, p50: 51, p95: 96, max: 100 });
    expect(distribution([])).toEqual({ count: 0, p50: 0, p95: 0, max: 0 });
  });

  it('infers 120 Hz and counts hitches', () => {
    const intervals = [...Array.from({ length: 95 }, () => 8.33), 25, 25, 25, 25, 25];
    const h = frameHealth(intervals);
    expect(h.refreshHz).toBe(120);
    expect(h.droppedRatio).toBeCloseTo(0.05);
  });

  it('ignores idle gaps (app paused) when judging frames', () => {
    expect(frameHealth([16.7, 16.7, 16.7, 5000]).droppedRatio).toBe(0);
  });
});
