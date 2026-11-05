# ADR 0001 — Local-first with a persistent outbox

Status: accepted

## Context
Data loss is the top product risk. Users write offline, apps get killed, networks drop.

## Decision
SQLite on device is the source of truth for the UI. Every edit is committed locally (entry row + outbox row in one transaction) before any network call. A sync engine drains the outbox with idempotent ops and pulls server changes by a per-user monotonic cursor.

Concurrency uses an integer `revision` per entry (optimistic concurrency). Conflicts are never auto-merged: the server version wins the original id and the local version becomes a conflict copy.

## Consequences
- Works with no account at all; sync is an add-on.
- Conflict copies are rare (single user, multiple devices) and always lossless.
- CRDT-level merging is out of scope until real usage shows it is needed.
