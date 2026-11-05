# ADR 0003 — Native rich-text editor, on-device search, bounded history

Status: accepted (Phase 3). To be re-validated on real devices: input latency on a long entry, iPad + low-end Android.

## Editor
**Decision:** `react-native-enriched-html` (Software Mansion; formerly `react-native-enriched`).

- Fully native input (UITextView / Android spans). No WebView: lower input latency and memory than TipTap/ProseMirror-in-WebView options.
- Canonical HTML with a small tag set; web build falls back to the library's ProseMirror implementation.
- We do **not** subscribe to `onChangeHtml` (HTML serialization per keystroke is the library's documented hot spot). We use `onChangeText` (plain text, cheap) to mark the draft dirty and call `getHTML()` only when autosave writes (≤ ~4×/s). If the native view is gone (unmount), the plain text is saved: formatting of the last few hundred ms may be lost, words never are.
- Content model: new `rich` block `{ html, text }`. `text` comes from the editor, so neither device nor server parses HTML for search, previews or word counts. Old `text` blocks remain valid and open in the editor as escaped paragraphs.
- Formatting UI: a 7-button bar visible only while writing + markdown shortcuts (`- `, `1. `, `> `, `## `). Not supported by the library and skipped: horizontal separators.

## Search
**Decision:** SQLite FTS5 on the device, external-content table over `entries` (no duplicate copy of the text), `unicode61 remove_diacritics 2` (gun → gün, istanbul → İstanbul), every word matched as a prefix, bm25 ranking with titles weighted ×4.

- Works offline and needs no server round-trip; every synced entry is already on the device.
- Avoids a hand-written Postgres `tsvector` migration (project rule: Prisma migrations only).
- User input is tokenized and quoted, so it can never become FTS syntax.
- Web (wa-sqlite without FTS5): capability detected at startup, falls back to escaped `LIKE`.
- The external-content index relies on stable `entries.rowid`; the app never runs `VACUUM`.

## Version history
- Server snapshots the state being replaced, **at most once per 10 minutes per entry** while typing, always on delete and on restore (`checkpoint` flag on the op), and keeps the newest 100 per entry. Without this, sync-every-few-seconds would create hundreds of rows per writing session.
- History is read-only over REST (`GET /v1/entries/:id/versions[/:revision]`, owner-scoped). Restoring is an ordinary edit from the device through sync, so it is idempotent, revision-checked and itself recoverable.

## Trash
- Soft delete locally and on the server. Local tombstones are purged after 30 days only if nothing is left to sync for them.
