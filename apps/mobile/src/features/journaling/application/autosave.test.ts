import { contentFromText, type EntryData } from '@daily/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutosaveController, type SaveState } from './autosave';

const d = (text: string): EntryData => ({
  title: '',
  content: contentFromText(text),
  entryDate: '2026-11-05',
  favorite: false,
  archived: false,
  conflictOf: null,
});

describe('AutosaveController', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('coalesces typing into one write after the delay', async () => {
    const saved: string[] = [];
    const states: SaveState[] = [];
    const c = new AutosaveController<EntryData>(async (x) => void saved.push(JSON.stringify(x.content)), (s) => states.push(s), 250);
    c.schedule(d('a'));
    c.schedule(d('ab'));
    c.schedule(d('abc'));
    await vi.advanceTimersByTimeAsync(260);
    expect(saved).toEqual([JSON.stringify(contentFromText('abc'))]);
    expect(states.at(-1)).toBe('saved');
  });

  it('flush writes immediately (backgrounding, leaving the screen)', async () => {
    const persist = vi.fn(async () => undefined);
    const c = new AutosaveController<EntryData>(persist, () => undefined, 10_000);
    c.schedule(d('now'));
    await c.flush();
    expect(persist).toHaveBeenCalledTimes(1);
    expect(c.hasUnsaved()).toBe(false);
  });

  it('keeps data pending after a failed write and saves it on the next flush', async () => {
    let fail = true;
    const persist = vi.fn(async () => {
      if (fail) throw new Error('disk full');
    });
    const states: SaveState[] = [];
    const c = new AutosaveController<EntryData>(persist, (s) => states.push(s), 250);
    c.schedule(d('precious'));
    await c.flush();
    expect(states.at(-1)).toBe('error');
    expect(c.hasUnsaved()).toBe(true);

    fail = false;
    await c.flush();
    expect(c.hasUnsaved()).toBe(false);
    expect(persist).toHaveBeenLastCalledWith(d('precious'));
  });

  it('never runs two writes at once and the newest snapshot always wins', async () => {
    const written: string[] = [];
    let active = 0;
    let maxActive = 0;
    const c = new AutosaveController<EntryData>(
      async (x) => {
        maxActive = Math.max(maxActive, ++active);
        await new Promise((r) => setTimeout(r, 20));
        written.push(x.title);
        active--;
      },
      () => undefined,
      0,
    );
    c.schedule({ ...d(''), title: 'first' });
    const a = c.flush();
    await vi.advanceTimersByTimeAsync(5); // first write in flight
    c.schedule({ ...d(''), title: 'second' });
    c.schedule({ ...d(''), title: 'third' });
    const b = c.flush();
    await vi.advanceTimersByTimeAsync(100);
    await Promise.all([a, b]);
    expect(maxActive).toBe(1);
    expect(written).toEqual(['first', 'third']); // 'second' was superseded before it was written
  });
});
