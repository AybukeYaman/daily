import { P, type Stroke, STRIDE, X, Y } from './model';

/**
 * Path commands as a flat number array, consumed by any 2D backend (Skia on
 * device, SVG/PDF for export). Opcodes: 0 = moveTo(x,y), 1 = quadTo(cx,cy,x,y), 2 = lineTo(x,y).
 */
export const MOVE = 0;
export const QUAD = 1;
export const LINE = 2;

/**
 * Smooth centerline: a quadratic Bézier through the midpoints of consecutive
 * samples, using each sample as the control point. C1-continuous, no gaps,
 * and it adds no latency (each new sample only finalizes the previous segment).
 * The live canvas worklet uses the same formula incrementally.
 */
export function centerlineCommands(samples: number[]): number[] {
  const n = samples.length / STRIDE;
  if (n === 0) return [];
  const out: number[] = [MOVE, samples[X]!, samples[Y]!];
  if (n === 1) {
    out.push(LINE, samples[X]! + 0.01, samples[Y]!); // dot: zero-length segments are not painted
    return out;
  }
  for (let i = 1; i < n - 1; i++) {
    const cx = samples[i * STRIDE + X]!;
    const cy = samples[i * STRIDE + Y]!;
    const mx = (cx + samples[(i + 1) * STRIDE + X]!) / 2;
    const my = (cy + samples[(i + 1) * STRIDE + Y]!) / 2;
    out.push(QUAD, cx, cy, mx, my);
  }
  out.push(LINE, samples[(n - 1) * STRIDE + X]!, samples[(n - 1) * STRIDE + Y]!);
  return out;
}

/** Width at a sample. Pressure 0..1 maps to 0.35×..1.35× base width (0.5 → 0.85×). */
function widthAt(stroke: Stroke, i: number): number {
  if (!stroke.hasPressure) return stroke.width;
  return stroke.width * (0.35 + stroke.samples[i * STRIDE + P]!);
}

/**
 * Closed outline polygon for variable-width (pressure) strokes: offsets each
 * sample along the local normal by half its width, left side forward, right
 * side back (flat ends; round caps are a Phase 4c refinement). Returns [x0,y0,x1,y1,…].
 */
export function variableWidthOutline(stroke: Stroke): number[] {
  const s = stroke.samples;
  const n = s.length / STRIDE;
  if (n < 2) return [];
  const left: number[] = [];
  const right: number[] = [];
  for (let i = 0; i < n; i++) {
    const prev = Math.max(0, i - 1);
    const next = Math.min(n - 1, i + 1);
    let tx = s[next * STRIDE + X]! - s[prev * STRIDE + X]!;
    let ty = s[next * STRIDE + Y]! - s[prev * STRIDE + Y]!;
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    const half = widthAt(stroke, i) / 2;
    const x = s[i * STRIDE + X]!;
    const y = s[i * STRIDE + Y]!;
    left.push(x - ty * half, y + tx * half);
    right.push(x + ty * half, y - tx * half);
  }
  const out = left;
  for (let i = right.length - 2; i >= 0; i -= 2) out.push(right[i]!, right[i + 1]!);
  return out;
}

/** Squared distance from (px,py) to segment (ax,ay)-(bx,by). */
function segmentDistance2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = px - (ax + t * dx);
  const ey = py - (ay + t * dy);
  return ex * ex + ey * ey;
}

/** Exact hit test: does a circle at (x,y) with radius r touch the painted stroke? */
export function hitsStroke(stroke: Stroke, x: number, y: number, r: number): boolean {
  const s = stroke.samples;
  const n = s.length / STRIDE;
  const reach = r + stroke.width / 2;
  const reach2 = reach * reach;
  if (n === 1) {
    const dx = s[X]! - x;
    const dy = s[Y]! - y;
    return dx * dx + dy * dy <= reach2;
  }
  for (let i = 0; i < n - 1; i++) {
    const a = i * STRIDE;
    const b = a + STRIDE;
    if (segmentDistance2(x, y, s[a + X]!, s[a + Y]!, s[b + X]!, s[b + Y]!) <= reach2) return true;
  }
  return false;
}
