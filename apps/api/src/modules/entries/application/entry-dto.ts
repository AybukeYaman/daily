import type { EntryDto } from '@daily/shared';
import type { EntryState } from '../domain/journal-entry.js';

export function toEntryDto(e: EntryState): EntryDto {
  return {
    id: e.id,
    title: e.title,
    content: e.content,
    entryDate: e.entryDate,
    favorite: e.favorite,
    archived: e.archived,
    conflictOf: e.conflictOf,
    revision: e.revision,
    syncSeq: e.syncSeq,
    deletedAt: e.deletedAt?.toISOString() ?? null,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}
