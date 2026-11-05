import type { VersionDetail, VersionSummary } from '@daily/shared';
import type { HistoryApi } from '../../../core/application/ports';
import type { JournalService } from './journal-service';

/**
 * Version history lives on the server. Restoring never rewrites history:
 * the old text is saved as a new edit, so the current state becomes a version too.
 */
export class HistoryService {
  constructor(
    private readonly api: HistoryApi,
    private readonly journal: JournalService,
  ) {}

  list(entryId: string): Promise<VersionSummary[]> {
    return this.api.list(entryId);
  }

  get(entryId: string, revision: number): Promise<VersionDetail> {
    return this.api.get(entryId, revision);
  }

  /** Keeps the entry's current favorite/archive flags; restores title, text and date. */
  async restore(entryId: string, version: VersionDetail): Promise<void> {
    const current = await this.journal.get(entryId);
    if (!current) throw new Error('Entry not found on this device');
    await this.journal.save(entryId, {
      title: version.title,
      content: version.content,
      entryDate: version.entryDate,
      favorite: current.favorite,
      archived: current.archived,
      conflictOf: current.conflictOf,
    }, { checkpoint: true });
  }
}
