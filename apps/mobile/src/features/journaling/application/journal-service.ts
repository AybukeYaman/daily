import { contentFromText, type EntryData, localIsoDate, toPlainText } from '@daily/shared';
import type {
  Clock,
  EntryStore,
  EntrySummary,
  LocalEntry,
  SearchQuery,
  TimelineCursor,
  TimelinePage,
  TrashItem,
} from '../../../core/application/ports';

export interface SyncTrigger {
  kick(): void;
}

/** Deleted entries stay restorable this long on the device (the server keeps tombstones and versions). */
const TRASH_RETENTION_DAYS = 30;

/** Journal use cases. Screens call these; they never touch storage or the network directly. */
export class JournalService {
  constructor(
    private readonly store: EntryStore,
    private readonly sync: SyncTrigger,
    private readonly clock: Clock,
  ) {}

  emptyDraft(entryDate: string = localIsoDate(this.clock.now())): EntryData {
    return {
      title: '',
      content: contentFromText(''),
      entryDate,
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

  archived(limit: number, after?: TimelineCursor): Promise<TimelinePage> {
    return this.store.archived(limit, after);
  }

  onDate(isoDate: string): Promise<EntrySummary[]> {
    return this.store.byDate(isoDate);
  }

  activity(fromIsoDate: string, toIsoDate: string): Promise<Record<string, number>> {
    return this.store.dayCounts(fromIsoDate, toIsoDate);
  }

  search(query: SearchQuery): Promise<EntrySummary[]> {
    return this.store.search(query);
  }

  trash(): Promise<TrashItem[]> {
    return this.store.trash(200);
  }

  /**
   * Saves a draft. A new entry (id null) is created only once it has content,
   * so opening "write" and leaving does not litter the journal. Returns the id.
   */
  async save(id: string | null, data: EntryData, options: { checkpoint?: boolean } = {}): Promise<string | null> {
    if (id === null) {
      if (data.title.trim() === '' && toPlainText(data.content).trim() === '') return null;
      const created = await this.store.create(data);
      this.sync.kick();
      return created;
    }
    await this.store.save(id, data, options);
    this.sync.kick();
    return id;
  }

  async remove(id: string): Promise<void> {
    await this.store.softDelete(id);
    this.sync.kick();
  }

  async restore(id: string): Promise<void> {
    await this.store.restore(id);
    this.sync.kick();
  }

  /** Housekeeping at startup: keeps the local database small. Never touches unsynced data. */
  purgeOldTrash(): Promise<number> {
    const cutoff = new Date(this.clock.now().getTime() - TRASH_RETENTION_DAYS * 86_400_000);
    return this.store.purgeTrash(cutoff.toISOString());
  }
}
