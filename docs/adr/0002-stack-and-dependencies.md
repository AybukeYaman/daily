# ADR 0002 — Stack and dependency budget

Status: accepted

## Decision
- API: NestJS, Prisma 7 (`@prisma/adapter-pg`), PostgreSQL, zod for validation (shared with the app instead of class-validator, so one schema serves both sides), `@node-rs/argon2` for password hashing (native, no node-gyp), `@nestjs/jwt`, `@nestjs/throttler`.
- App: Expo + Expo Router, `expo-sqlite` (WAL mode), `expo-secure-store` for tokens. No Redux/Zustand/React Query: sync status is a 30-line external store, data is read from SQLite.
- Lists: `FlatList` with keyset pagination. FlashList only if profiling on a low-end Android shows dropped frames.
- Database changes only through `prisma migrate`. No `db push`, no hand-written SQL.

## Local encryption
SQLCipher (`expo-sqlite` with `useSQLCipher`) is planned together with the app lock in Phase 7: the key will live in SecureStore/Keychain. App lock ≠ encryption; the README states what is actually implemented.
