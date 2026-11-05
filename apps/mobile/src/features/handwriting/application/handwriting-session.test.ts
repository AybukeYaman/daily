import { randomUUID } from 'node:crypto';
import { STRIDE } from '@daily/shared';
import { describe, expect, it } from 'vitest';
import { HandwritingSession, type StrokeStyle } from './handwriting-session';

const pen: StrokeStyle = { tool: 'pen', color: '#2a2724', width: 2.5, hasPressure: false, hasTilt: false };
const clock = { now: () => new Date('2026-11-05T19:00:00Z') };
const ids = { uuid: () => randomUUID() };

function line(n: number, y = 0): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(i * 2, y + (i % 2) * 0.05, i * 8, 0.5, 1, 0);
  return out;
}

describe('HandwritingSession', () => {
  it('commits simplified strokes and tracks the reduction', () => {
    const s = new HandwritingSession(ids, clock);
    const stroke = s.commit(line(200), pen)!;
    expect(stroke.samples.length / STRIDE).toBeLessThan(10);
    expect(s.stats).toEqual({ rawSamples: 200, keptSamples: stroke.samples.length / STRIDE });
  });

  it('ignores empty or malformed gestures', () => {
    const s = new HandwritingSession(ids, clock);
    expect(s.commit([], pen)).toBeNull();
    expect(s.commit([1, 2, 3], pen)).toBeNull();
    expect(s.doc.all).toHaveLength(0);
  });

  it('keeps a single tap as a dot', () => {
    const s = new HandwritingSession(ids, clock);
    expect(s.commit([5, 5, 0, 0.5, 1, 0], pen)!.samples).toHaveLength(STRIDE);
  });

  it('serializes and restores the page', () => {
    const s = new HandwritingSession(ids, clock);
    s.commit(line(50, 10), pen);
    s.commit(line(50, 60), { ...pen, tool: 'highlighter', color: '#f2c94c80', width: 12 });
    const restored = new HandwritingSession(ids, clock, HandwritingSession.deserialize(s.serialize()));
    expect(restored.doc.all.map((x) => [x.tool, x.color, x.width])).toEqual([
      ['pen', '#2a2724', 2.5],
      ['highlighter', '#f2c94c80', 12],
    ]);
    expect(HandwritingSession.deserialize('')).toEqual([]);
  });

  it('erases and undoes through the document', () => {
    const s = new HandwritingSession(ids, clock);
    s.commit(line(20, 0), pen);
    expect(s.erase(10, 0, 4)).toBe(1);
    expect(s.undo()).toBe(true);
    expect(s.doc.all).toHaveLength(1);
  });
});
