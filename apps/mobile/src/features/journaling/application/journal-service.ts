import { contentFromText, type EntryData, localIsoDate, toPlainText } from '@daily/shared';
import type { Clock, EntryStore, LocalEntry, TimelineCursor, TimelinePage } from '../../../core/application/ports';

export interface SyncTrigger {
  kick(): void;
}

/** Journal use cases. Screens call these; they never touch storage or the network directly. */
export class JournalService {
  constructor(
    private readonly store: EntryStore,
    private readonly sync: SyncTrigger,
    private readonly clock: Clock,
  ) {}

  emptyDraft(): EntryData {
    return {
      title: '',
      content: contentFromText(''),
      entryDate: localIsoDate(this.clock.now()),
      favorite: false,
      archived: false,
      conflictOf: null,
    };
  }

  get(id: string): Promise<LocalEntry | null> {
    return this.store.get(id);
  }

  timeline(limit: number, after?: TimelineCursor): Promise<TimelinePage> {
    return this.store.timeline(limit, after);
  }

  /**
   * Saves a draft. A new entry (id null) is created only once it has content,
   * so opening "write" and leaving does not litter the journal. Returns the id.
   */
  async save(id: string | null, data: EntryData): Promise<string | null> {
    if (id === null) {
      if (data.title.trim() === '' && toPlainText(data.content).trim() === '') return null;
      const created = await this.store.create(data);
      this.sync.kick();
      return created;
    }
    await this.store.save(id, data);
    this.sync.kick();
    return id;
  }

  async remove(id: string): Promise<void> {
    await this.store.softDelete(id);
    this.sync.kick();
  }
}
