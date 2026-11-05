/**
 * Vector handwriting model. A stroke is a flat array of samples with a fixed
 * stride (no per-point objects: less garbage, cache-friendly, trivially encoded).
 *
 * Sample layout: [x, y, t, pressure, altitude, azimuth]
 *   x, y      canvas pixels (document space, independent of zoom)
 *   t         ms since the stroke started
 *   pressure  0..1 (finger/mouse: 0.5)
 *   altitude  0..1 of π/2 (pen tilt; 1 = perpendicular). 1 when unknown
 *   azimuth   0..1 of 2π. 0 when unknown
 */
export const STRIDE = 6;
export const X = 0;
export const Y = 1;
export const T = 2;
export const P = 3;
export const ALT = 4;
export const AZI = 5;

export type Tool = 'pen' | 'pencil' | 'highlighter';
export const TOOLS: readonly Tool[] = ['pen', 'pencil', 'highlighter'];

export interface Stroke {
  id: string;
  tool: Tool;
  /** #RRGGBB or #RRGGBBAA */
  color: string;
  /** Base width in px; pressure scales it when present. */
  width: number;
  /** Real pressure/tilt data (stylus). Finger strokes store neither. */
  hasPressure: boolean;
  hasTilt: boolean;
  /** Epoch ms at stroke start. */
  startedAt: number;
  /** length = STRIDE × sample count */
  samples: number[];
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Bounding box including half the stroke width (what actually gets painted). */
export function strokeBounds(s: Stroke): Bounds {
  const pad = s.width / 2;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < s.samples.length; i += STRIDE) {
    const x = s.samples[i + X]!;
    const y = s.samples[i + Y]!;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}
