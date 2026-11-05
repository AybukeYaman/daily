import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  centerlineCommands,
  decodeStrokes,
  encodeStrokes,
  fromBase64Url,
  HandwritingDocument,
  hitsStroke,
  LINE,
  MOVE,
  QUAD,
  simplifySamples,
  SpatialIndex,
  STRIDE,
  type Stroke,
  toBase64Url,
  variableWidthOutline,
} from './index';

/** A wavy handwriting-like stroke sampled at 120 Hz. */
function wave(n: number, x0 = 0, y0 = 0, pressure = false): Stroke {
  const samples: number[] = [];
  for (let i = 0; i < n; i++) {
    samples.push(x0 + i * 1.7, y0 + Math.sin(i / 6) * 12, i * 8.33, pressure ? 0.3 + 0.4 * Math.abs(Math.sin(i / 9)) : 0.5, 1, 0);
  }
  return { id: randomUUID(), tool: 'pen', color: '#2a2724', width: 2.5, hasPressure: pressure, hasTilt: false, startedAt: 1_762_000_000_000 + x0, samples };
}

describe('codec', () => {
  it('round-trips within quantization error', () => {
    const strokes = [wave(80), { ...wave(40, 300, 200, true), hasTilt: true, color: '#b07d5280', tool: 'highlighter' as const }];
    const decoded = decodeStrokes(encodeStrokes(strokes));
    expect(decoded).toHaveLength(2);
    for (let k = 0; k < strokes.length; k++) {
      const a = strokes[k]!;
      const b = decoded[k]!;
      expect({ ...b, samples: [] }).toEqual({ ...a, samples: [] });
      for (let i = 0; i < a.samples.length; i += STRIDE) {
        expect(Math.abs(a.samples[i]! - b.samples[i]!)).toBeLessThanOrEqual(0.05);
        expect(Math.abs(a.samples[i + 1]! - b.samples[i + 1]!)).toBeLessThanOrEqual(0.05);
        expect(Math.abs(a.samples[i + 2]! - b.samples[i + 2]!)).toBeLessThanOrEqual(0.5);
        if (a.hasPressure) expect(Math.abs(a.samples[i + 3]! - b.samples[i + 3]!)).toBeLessThanOrEqual(1 / 255);
      }
    }
  });

  it('is ~10× smaller than JSON', () => {
    const strokes = Array.from({ length: 50 }, (_, i) => wave(60, i * 10, i * 20));
    const binary = toBase64Url(encodeStrokes(strokes)).length;
    const json = JSON.stringify(strokes).length;
    expect(json / binary).toBeGreaterThan(8);
  });

  it('base64url round-trips every length', () => {
    for (let len = 0; len < 40; len++) {
      const bytes = Uint8Array.from({ length: len }, (_, i) => (i * 97 + len) % 256);
      expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
    }
  });

  it('rejects corrupt data instead of returning garbage', () => {
    const bytes = encodeStrokes([wave(10)]);
    expect(() => decodeStrokes(bytes.subarray(0, bytes.length - 3))).toThrow();
    expect(() => decodeStrokes(new Uint8Array([1, 2, 3]))).toThrow('Not handwriting data');
    expect(() => fromBase64Url('ab$c')).toThrow();
  });

  it('keeps epoch timestamps beyond 32-bit range exact', () => {
    const s = { ...wave(3), startedAt: 4_102_444_800_000 }; // year 2100
    expect(decodeStrokes(encodeStrokes([s]))[0]!.startedAt).toBe(4_102_444_800_000);
  });
});

describe('simplify', () => {
  it('drops collinear samples but keeps endpoints', () => {
    const line: number[] = [];
    for (let i = 0; i < 100; i++) line.push(i, 2 * i, i, 0.5, 1, 0);
    const out = simplifySamples(line, 0.3, 2.5);
    expect(out.length / STRIDE).toBe(2);
    expect(out.slice(0, 2)).toEqual([0, 0]);
    expect(out.slice(STRIDE, STRIDE + 2)).toEqual([99, 198]);
  });

  it('keeps shape within epsilon and reduces handwriting a lot', () => {
    const s = wave(400);
    const out = simplifySamples(s.samples, 0.3, s.width);
    expect(out.length / STRIDE).toBeLessThan((s.samples.length / STRIDE) * 0.5);
    for (let i = 0; i < s.samples.length; i += STRIDE) {
      const kept = { ...s, samples: out };
      expect(hitsStroke({ ...kept, width: 0 }, s.samples[i]!, s.samples[i + 1]!, 0.31)).toBe(true);
    }
  });

  it('keeps pressure changes on a straight line', () => {
    const line: number[] = [];
    for (let i = 0; i < 50; i++) line.push(i, 0, i, i === 25 ? 1 : 0.2, 1, 0);
    expect(simplifySamples(line, 0.3, 4).length / STRIDE).toBeGreaterThan(2);
  });
});

describe('geometry', () => {
  it('builds a gap-free centerline (move, quads, final line)', () => {
    const s = wave(5).samples;
    const cmds = centerlineCommands(s);
    // move · 3 quads (samples 1..3 as controls) · line to the last sample
    expect(cmds.length).toBe(3 + 3 * 5 + 3);
    expect([cmds[0], cmds[3], cmds[8], cmds[13], cmds[18]]).toEqual([MOVE, QUAD, QUAD, QUAD, LINE]);
    // each quad ends at the midpoint the next one starts from: no gaps
    expect(cmds[6]).toBeCloseTo((s[STRIDE] + s[2 * STRIDE]!) / 2);
    expect(cmds.slice(-2)).toEqual([s[4 * STRIDE], s[4 * STRIDE + 1]]);
  });

  it('paints a single tap as a dot', () => {
    expect(centerlineCommands([10, 10, 0, 0.5, 1, 0])).toEqual([MOVE, 10, 10, LINE, 10.01, 10]);
  });

  it('builds a closed outline for pressure strokes', () => {
    const s = wave(20, 0, 0, true);
    expect(variableWidthOutline(s).length).toBe(20 * 2 * 2);
  });
});

describe('spatial index', () => {
  it('returns only nearby candidates', () => {
    const idx = new SpatialIndex(64);
    idx.insert('a', { minX: 0, minY: 0, maxX: 10, maxY: 10 });
    idx.insert('b', { minX: 1000, minY: 1000, maxX: 1010, maxY: 1010 });
    expect(idx.query(5, 5, 4)).toEqual(['a']);
    idx.remove('a');
    expect(idx.query(5, 5, 4)).toEqual([]);
    expect(idx.query(-5000, -5000, 1)).toEqual([]); // negative coordinates are fine
  });
});

describe('document', () => {
  it('undo/redo of add and erase restores exact order', () => {
    const doc = new HandwritingDocument();
    const [a, b, c] = [wave(20, 0, 0), wave(20, 0, 100), wave(20, 0, 200)];
    doc.add(a);
    doc.add(b);
    doc.add(c);
    expect(doc.eraseAt(b.samples[0]!, b.samples[1]!, 3)).toBe(1);
    expect(doc.all).toEqual([a, c]);
    doc.undo();
    expect(doc.all).toEqual([a, b, c]);
    doc.redo();
    expect(doc.all).toEqual([a, c]);
    doc.undo();
    doc.undo();
    expect(doc.all).toEqual([a, b]);
    expect(doc.canRedo).toBe(true);
    doc.add(wave(5, 500, 500));
    expect(doc.canRedo).toBe(false); // new action clears redo
  });

  it('caps history length', () => {
    const doc = new HandwritingDocument([], 3);
    for (let i = 0; i < 10; i++) doc.add(wave(3, i * 50));
    let undos = 0;
    while (doc.undo()) undos++;
    expect(undos).toBe(3);
  });
});

describe('performance budget (Node, indicative)', () => {
  // 5 000 strokes × 120 samples ≈ a very full notebook page set.
  const big = Array.from({ length: 5_000 }, (_, i) => wave(120, (i % 50) * 40, Math.floor(i / 50) * 40));

  it('encodes and decodes a large document quickly', () => {
    const t0 = performance.now();
    const text = toBase64Url(encodeStrokes(big));
    const t1 = performance.now();
    const back = decodeStrokes(fromBase64Url(text));
    const t2 = performance.now();
    console.info(`[bench] encode ${(t1 - t0).toFixed(0)} ms, decode ${(t2 - t1).toFixed(0)} ms, ${(text.length / 1024).toFixed(0)} KB for 600k samples`);
    expect(back).toHaveLength(5_000);
    expect(t1 - t0).toBeLessThan(600);
    expect(t2 - t1).toBeLessThan(600);
  });

  it('erases with the index in well under a frame', () => {
    const doc = new HandwritingDocument(big);
    const t0 = performance.now();
    for (let i = 0; i < 200; i++) doc.eraseAt(1000 + i, 1000, 6);
    const perMove = (performance.now() - t0) / 200;
    console.info(`[bench] eraser ${perMove.toFixed(3)} ms per move over 5 000 strokes`);
    expect(perMove).toBeLessThan(1);
  });
});
