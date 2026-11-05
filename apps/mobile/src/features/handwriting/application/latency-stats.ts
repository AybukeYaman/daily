export interface Distribution {
  count: number;
  p50: number;
  p95: number;
  max: number;
}

export function distribution(values: readonly number[]): Distribution {
  if (values.length === 0) return { count: 0, p50: 0, p95: 0, max: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
  return { count: sorted.length, p50: at(0.5), p95: at(0.95), max: sorted[sorted.length - 1]! };
}

export interface FrameHealth {
  /** Refresh rate inferred from the median frame interval. */
  refreshHz: number;
  budgetMs: number;
  /** Share of frames that took longer than 1.5 × the budget (a visible hitch). */
  droppedRatio: number;
}

export function frameHealth(intervals: readonly number[]): FrameHealth {
  const d = distribution(intervals.filter((v) => v > 0 && v < 250));
  if (d.count === 0) return { refreshHz: 0, budgetMs: 0, droppedRatio: 0 };
  const budgetMs = d.p50;
  const dropped = intervals.filter((v) => v > budgetMs * 1.5 && v < 250).length;
  return { refreshHz: Math.round(1000 / budgetMs), budgetMs, droppedRatio: dropped / d.count };
}
