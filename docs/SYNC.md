# Sync protocol (v1) and API contract

Base path: `/v1`. All bodies JSON, validated with the zod schemas in `@daily/shared/contracts`.

## Auth

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/auth/register` | `{ email, password }` | `Session` |
| POST | `/auth/login` | `{ email, password }` | `Session` |
| POST | `/auth/refresh` | `{ refreshToken }` | `Session` (rotated) |
| POST | `/auth/logout` | `{ refreshToken }` | `204` |

`Session = { accessToken, refreshToken, accessExpiresAt }`. Access tokens: JWT, 15 min. Refresh tokens: opaque 256-bit random, stored as SHA-256 hash, 30 days, single use. Each refresh rotates; presenting an already-used token revokes the whole token family (theft detection).

## Sync

### `POST /sync/push` (auth)

```json
{ "ops": [ {
  "opId": "uuid",            // idempotency key, generated on device
  "entryId": "uuid",         // generated on device
  "kind": "upsert" | "delete",
  "baseRevision": 3 | null,  // server revision the device edited from; null = new entry
  "data": { "title": "", "content": {...}, "entryDate": "2026-11-05", "favorite": false, "archived": false }
} ] }
```

Upserts may carry `"checkpoint": true` (sent when restoring an old version): the server then always snapshots the state being replaced.

Max 50 ops per call. Devices also stop adding ops once the payload passes 4 MB (handwriting pages can be large); the server accepts bodies up to 16 MB. Each op is applied in its own transaction:

1. If `(userId, opId)` was already processed → the stored result is returned unchanged (safe retry after a lost response).
2. Entry owned by another user → `rejected` (no information leak).
3. `baseRevision` must equal the current server revision (`null` for a non-existing entry). Otherwise → `conflict` with the current server entry. **The server never overwrites a newer revision.**
4. On success `revision += 1` and the entry receives the user's next `syncSeq`. The previous state is written to `journal_versions` when it is the first change, a delete, a checkpoint, or the last snapshot is older than 10 minutes; the newest 100 snapshots per entry are kept.

Result per op: `{ opId, status: "applied", revision, syncSeq }` · `{ opId, status: "conflict", entry }` · `{ opId, status: "rejected", reason }`. The idempotency log stores only the outcome, never content; a replayed `applied` reports exactly the revision that op produced.

### `GET /sync/pull?since=<seq>&limit=200` (auth)

Returns entries (including soft-deleted tombstones) with `syncSeq > since`, ordered by `syncSeq`: `{ entries, cursor, hasMore }`.

### `GET /entries/:id/versions` and `GET /entries/:id/versions/:revision` (auth)

Owner-scoped, read-only. List: `{ versions: [{ revision, title, preview, entryDate, deleted, replacedAt }] }`, newest first (max 100). Detail adds `content`. Another user's entry looks empty / 404.

## Device rules

- Outbox has at most one *unsent* op per entry; edits coalesce into it. Once an op has been attempted, its payload is frozen and later edits create a new op (so a retried `opId` always carries the same payload).
- `baseRevision` is read at send time from the entry's last known server revision, and ops for the same entry are sent strictly in order.
- **Conflict**: the server version replaces the local entry, and the local content is saved as a new entry marked `conflictOf = <original id>`. Nothing is lost; the user resolves it.
- Pull skips entries that still have pending outbox ops (push resolves them).
- Backoff: `min(5 min, 2^attempts s) × jitter(0.5–1.0)`.
