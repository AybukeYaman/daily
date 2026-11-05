import { Injectable } from '@nestjs/common';
import type { PullQuery, PullResponse } from '@daily/shared';
import { toEntryDto } from '../../entries/application/entry-dto.js';
import { EntryRepository } from '../../entries/application/ports.js';

@Injectable()
export class PullChangesUseCase {
  constructor(private readonly entries: EntryRepository) {}

  async execute(userId: string, query: PullQuery): Promise<PullResponse> {
    // Fetch one extra row to know whether another page exists without a COUNT query.
    const rows = await this.entries.listChangedSince(userId, query.since, query.limit + 1);
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const cursor = page.length > 0 ? page[page.length - 1]!.syncSeq : query.since;
    return { entries: page.map(toEntryDto), cursor, hasMore };
  }
}
