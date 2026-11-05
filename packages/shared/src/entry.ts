import { z } from 'zod';
import { EntryContentSchema } from './content';
import { IsoDateSchema } from './dates';

/** The user-editable part of an entry. This is what travels in a sync op. */
export const EntryDataSchema = z.object({
  title: z.string().max(300),
  content: EntryContentSchema,
  entryDate: IsoDateSchema,
  favorite: z.boolean(),
  archived: z.boolean(),
  /** Set when this entry is a lossless conflict copy of another entry. */
  conflictOf: z.uuid().nullable(),
});
export type EntryData = z.infer<typeof EntryDataSchema>;

/** Server representation of an entry as returned to devices. */
export const EntryDtoSchema = EntryDataSchema.extend({
  id: z.uuid(),
  revision: z.number().int().positive(),
  syncSeq: z.number().int().nonnegative(),
  deletedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type EntryDto = z.infer<typeof EntryDtoSchema>;

/** Structural equality of user-editable data (used to avoid needless conflict copies). */
export function isSameEntryData(a: EntryData, b: EntryData): boolean {
  return (
    a.title === b.title &&
    a.entryDate === b.entryDate &&
    a.favorite === b.favorite &&
    a.archived === b.archived &&
    a.conflictOf === b.conflictOf &&
    JSON.stringify(a.content) === JSON.stringify(b.content)
  );
}
