# Daily

Minimal, local-first journal for iOS and Android (web works too). Open → write. No account needed; sign in only to back up and sync across devices.

- `apps/mobile` — Expo + Expo Router, SQLite (WAL), outbox-based sync
- `apps/api` — NestJS + Prisma 7 + PostgreSQL, layered modules (auth, entries, sync)
- `packages/shared` — framework-free domain rules + zod contracts used by both sides
- `docs/` — [ROADMAP](docs/ROADMAP.md) (phases), [ARCHITECTURE](docs/ARCHITECTURE.md), [SYNC protocol](docs/SYNC.md), ADRs

## First run (once)

```bash
npm install
npm run build:shared

# API
cd apps/api
cp .env.example .env              # set DATABASE_URL and a long JWT_SECRET
npx prisma migrate dev --name init   # creates prisma/migrations/… from schema.prisma
```

Database changes go **only** through `prisma migrate dev` (dev) / `prisma migrate deploy` (prod). No `db push`, no hand-written SQL.

## Everyday

```bash
npm run api      # API on :3000
npm run app      # Expo dev server
```

The app uses `EXPO_PUBLIC_API_URL` (default `http://localhost:3000`). On a physical phone use your computer's LAN IP, e.g. `EXPO_PUBLIC_API_URL=http://192.168.1.20:3000 npm run app`.

`expo-sqlite`, `expo-secure-store` and later the handwriting/widget modules are native: use a development build (`npx expo run:ios` / `npx expo run:android`), not Expo Go, once native modules beyond the Expo Go set are added.

## Tests

```bash
npm test
```

- `packages/shared` — content, conflict policy, backoff, contracts
- `apps/api` — auth (rotation, reuse detection, expiry) and sync use cases (revision checks, idempotency, IDOR, tombstones, paging)
- `apps/mobile` — autosave (coalescing, flush, failure retry, ordering)
- `tests/` — **device ⇄ server**: the app's real SQLite stores and sync engine (better-sqlite3) against the server's real use cases: offline write, lost responses, two-device conflicts, delete-vs-edit, backoff, large archive paging, version restore; plus local search (FTS5 and LIKE fallback), trash/purge, archive and calendar queries.

## What is real today vs. planned

Implemented: local-first writing with autosave, native rich text (bold, italic, underline, heading, lists, quote, auto-links), favorites, archive, trash with restore, custom entry dates, on-device full-text search, monthly calendar, version history with restore, accounts with refresh-token rotation, idempotent sync with lossless conflict copies.

Not yet (see ROADMAP): handwriting, media, widgets, moods, app lock, local encryption (SQLCipher), export. App lock is not encryption; neither exists yet.

The editor (`react-native-enriched-html`) is a native module: run the app as a development build (`npx expo run:ios` / `npx expo run:android`), not in Expo Go.
