import { Injectable } from '@nestjs/common';
import { previewOf, toPlainText, type VersionDetail, type VersionSummary } from '@daily/shared';
import { NotFoundError } from '../../../core/domain/errors.js';
import { EntryVersionRepository, type VersionRecord } from './ports.js';

const LIST_LIMIT = 100;

function toSummary(v: VersionRecord): VersionSummary {
  return {
    revision: v.revision,
    title: v.title,
    preview: previewOf(toPlainText(v.content)),
    entryDate: v.entryDate,
    deleted: v.deletedAt !== null,
    replacedAt: v.createdAt.toISOString(),
  };
}

/** Read-only. Restoring is a normal edit from the device, so it flows through sync like any change. */
@Injectable()
export class ListEntryVersionsUseCase {
  constructor(private readonly versions: EntryVersionRepository) {}

  async execute(userId: string, entryId: string): Promise<VersionSummary[]> {
    return (await this.versions.list(userId, entryId, LIST_LIMIT)).map(toSummary);
  }
}

@Injectable()
export class GetEntryVersionUseCase {
  constructor(private readonly versions: EntryVersionRepository) {}

  async execute(userId: string, entryId: string, revision: number): Promise<VersionDetail> {
    const v = await this.versions.get(userId, entryId, revision);
    if (!v) throw new NotFoundError('Version not found');
    return { ...toSummary(v), content: v.content };
  }
}
