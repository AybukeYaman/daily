import { STRIDE, type Stroke } from '@daily/shared';
import type { IdGenerator } from '../../../core/application/ports';

/**
 * Deterministic handwriting-like strokes for stress tests: short wavy
 * "words" laid out in lines, ~120 Hz sampling, already at simplified density.
 */
export function syntheticPage(count: number, width: number, ids: IdGenerator, samplesPerStroke = 40): Stroke[] {
  const strokes: Stroke[] = [];
  const lineHeight = 28;
  const strokeWidth = 46;
  const perLine = Math.max(1, Math.floor((width - 32) / strokeWidth));
  for (let k = 0; k < count; k++) {
    const x0 = 16 + (k % perLine) * strokeWidth;
    const y0 = 40 + Math.floor(k / perLine) * lineHeight;
    const samples: number[] = [];
    for (let i = 0; i < samplesPerStroke; i++) {
      const u = i / (samplesPerStroke - 1);
      samples.push(x0 + u * 38, y0 + Math.sin(u * Math.PI * 3 + k) * 7, i * 8.33, 0.5, 1, 0);
    }
    strokes.push({
      id: ids.uuid(),
      tool: 'pen',
      color: '#2a2724',
      width: 2,
      hasPressure: false,
      hasTilt: false,
      startedAt: 1_762_000_000_000 + k * 400,
      samples,
    });
  }
  return strokes;
}

export function totalSamples(strokes: readonly Stroke[]): number {
  let n = 0;
  for (const s of strokes) n += s.samples.length / STRIDE;
  return n;
}
