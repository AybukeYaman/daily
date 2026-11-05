import { z } from 'zod';
import { EntryContentSchema } from './content';
import { IsoDateSchema } from './dates';

export const VersionSummarySchema = z.object({
  revision: z.number().int().positive(),
  title: z.string(),
  preview: z.string(),
  entryDate: IsoDateSchema,
  deleted: z.boolean(),
  /** When this state was replaced by a newer one. */
  replacedAt: z.iso.datetime(),
});
export type VersionSummary = z.infer<typeof VersionSummarySchema>;

export const VersionListSchema = z.object({ versions: z.array(VersionSummarySchema) });
export type VersionList = z.infer<typeof VersionListSchema>;

export const VersionDetailSchema = VersionSummarySchema.extend({ content: EntryContentSchema });
export type VersionDetail = z.infer<typeof VersionDetailSchema>;

export const VersionParamsSchema = z.object({
  id: z.uuid(),
  revision: z.coerce.number().int().positive(),
});
export const EntryParamsSchema = z.object({ id: z.uuid() });

/** Server keeps at most one snapshot per entry per window (typing syncs every few seconds). */
const VERSION_SNAPSHOT_WINDOW_MS = 10 * 60 * 1000;
export const MAX_VERSIONS_PER_ENTRY = 100;

/**
 * Whether the state about to be replaced deserves its own snapshot. Deletes and
 * restores (forced) always do; edits only when the last snapshot is older than the window, so a writing
 * session yields one recoverable point per ~10 minutes instead of hundreds.
 */
export function shouldSnapshot(lastSnapshotAt: Date | null, now: Date, forced: boolean): boolean {
  if (forced || lastSnapshotAt === null) return true;
  return now.getTime() - lastSnapshotAt.getTime() >= VERSION_SNAPSHOT_WINDOW_MS;
}
