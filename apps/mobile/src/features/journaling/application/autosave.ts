import type { EntryData } from '@daily/shared';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Coalesces keystrokes into few local writes without risking loss:
 * - writes at most every `delayMs` while typing,
 * - `flush()` writes immediately (blur, leaving the screen, app going to background),
 * - saves are chained, so they always land in order.
 * A failed write keeps the data pending and is retried on the next schedule/flush.
 */
export class AutosaveController {
  private pending: EntryData | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly persist: (data: EntryData) => Promise<void>,
    private readonly onState: (state: SaveState) => void,
    private readonly delayMs = 250,
  ) {}

  schedule(data: EntryData): void {
    this.pending = data;
    this.onState('saving');
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.delayMs);
  }

  flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.chain = this.chain.then(async () => {
      const data = this.pending;
      if (!data) return;
      this.pending = null;
      try {
        await this.persist(data);
        if (!this.pending) this.onState('saved');
      } catch {
        this.pending ??= data; // keep the newest unsaved data
        this.onState('error');
      }
    });
    return this.chain;
  }

  hasUnsaved(): boolean {
    return this.pending !== null;
  }
}
