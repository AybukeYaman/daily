import { P, STRIDE, X, Y } from './model';

/**
 * Ramer–Douglas–Peucker on committed strokes. Pressure participates as a third
 * dimension (scaled by width), so pressure swells are kept even on straight lines.
 * Iterative (explicit stack): no recursion-depth limits on very long strokes.
 * Returns a new sample array; the first and last samples are always kept.
 */
export function simplifySamples(samples: number[], epsilon: number, pressureScale: number): number[] {
  const n = samples.length / STRIDE;
  if (n <= 2) return samples.slice();

  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: number[] = [0, n - 1];
  const eps2 = epsilon * epsilon;

  while (stack.length > 0) {
    const end = stack.pop()!;
    const start = stack.pop()!;
    const ax = samples[start * STRIDE + X]!;
    const ay = samples[start * STRIDE + Y]!;
    const ap = samples[start * STRIDE + P]! * pressureScale;
    const dx = samples[end * STRIDE + X]! - ax;
    const dy = samples[end * STRIDE + Y]! - ay;
    const dp = samples[end * STRIDE + P]! * pressureScale - ap;
    const len2 = dx * dx + dy * dy + dp * dp;

    let maxDist2 = -1;
    let index = -1;
    for (let i = start + 1; i < end; i++) {
      const px = samples[i * STRIDE + X]! - ax;
      const py = samples[i * STRIDE + Y]! - ay;
      const pp = samples[i * STRIDE + P]! * pressureScale - ap;
      let d2: number;
      if (len2 === 0) {
        d2 = px * px + py * py + pp * pp;
      } else {
        const tt = Math.max(0, Math.min(1, (px * dx + py * dy + pp * dp) / len2));
        const ex = px - tt * dx;
        const ey = py - tt * dy;
        const ep = pp - tt * dp;
        d2 = ex * ex + ey * ey + ep * ep;
      }
      if (d2 > maxDist2) {
        maxDist2 = d2;
        index = i;
      }
    }
    if (maxDist2 > eps2 && index > 0) {
      keep[index] = 1;
      stack.push(start, index, index, end);
    }
  }

  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!keep[i]) continue;
    for (let k = 0; k < STRIDE; k++) out.push(samples[i * STRIDE + k]!);
  }
  return out;
}
