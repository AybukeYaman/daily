import { z } from 'zod';
import { EntryDataSchema, EntryDtoSchema, isSameEntryData, type EntryData, type EntryDto } from './entry';

export const MAX_PUSH_OPS = 50;
/** Devices stop adding ops to a push once its payload passes this size (server accepts 16 MB). */
export const MAX_PUSH_BYTES = 4 * 1024 * 1024;
const MAX_PULL_LIMIT = 200;

export const PushOpSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('upsert'),
    opId: z.uuid(),
    entryId: z.uuid(),
    baseRevision: z.number().int().positive().nullable(),
    data: EntryDataSchema,
    /** Ask the server to snapshot the state being replaced (e.g. when restoring an old version). */
    checkpoint: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal('delete'),
    opId: z.uuid(),
    entryId: z.uuid(),
    baseRevision: z.number().int().positive(),
  }),
]);
export type PushOp = z.infer<typeof PushOpSchema>;

export const PushRequestSchema = z.object({
  ops: z.array(PushOpSchema).min(1).max(MAX_PUSH_OPS),
});
export type PushRequest = z.infer<typeof PushRequestSchema>;

/**
 * `applied` carries only the new revision/seq: the device already has the content,
 * and replaying a retried op must report exactly the revision that op produced.
 * `conflict` carries the current server entry so the device can resolve losslessly.
 */
export const OpResultSchema = z.discriminatedUnion('status', [
  z.object({
    opId: z.uuid(),
    status: z.literal('applied'),
    revision: z.number().int().positive(),
    syncSeq: z.number().int().nonnegative(),
  }),
  z.object({ opId: z.uuid(), status: z.literal('conflict'), entry: EntryDtoSchema }),
  z.object({ opId: z.uuid(), status: z.literal('rejected'), reason: z.string() }),
]);
export type OpResult = z.infer<typeof OpResultSchema>;

export const PushResponseSchema = z.object({ results: z.array(OpResultSchema) });
export type PushResponse = z.infer<typeof PushResponseSchema>;

export const PullQuerySchema = z.object({
  since: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(MAX_PULL_LIMIT).default(MAX_PULL_LIMIT),
});
export type PullQuery = z.infer<typeof PullQuerySchema>;

export const PullResponseSchema = z.object({
  entries: z.array(EntryDtoSchema),
  cursor: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});
export type PullResponse = z.infer<typeof PullResponseSchema>;

export type ConflictResolution =
  /** Local and server already agree: just adopt the server row. */
  | { kind: 'adopt-server' }
  /** Adopt the server row for the original id and keep local data as a separate copy. */
  | { kind: 'adopt-server-keep-local-copy'; copy: EntryData };

/**
 * Lossless conflict policy (ADR 0001): the server version always keeps the id,
 * unsynced local data is never discarded. A local delete that conflicts is
 * dropped only when there is nothing unique to keep (localData === null).
 */
export function resolveConflict(localData: EntryData | null, server: EntryDto): ConflictResolution {
  if (localData === null) return { kind: 'adopt-server' };
  if (server.deletedAt === null && isSameEntryData(localData, server)) return { kind: 'adopt-server' };
  return { kind: 'adopt-server-keep-local-copy', copy: localData };
}

/** Exponential backoff with jitter: min(cap, 2^attempts s) × [0.5, 1.0). */
export function backoffMs(attempts: number, random: () => number = Math.random, capMs = 300_000): number {
  const base = Math.min(capMs, 1000 * 2 ** Math.max(0, attempts));
  return Math.round(base * (0.5 + random() * 0.5));
}
