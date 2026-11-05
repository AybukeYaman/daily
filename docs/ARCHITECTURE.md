# Architecture

## Monorepo

```
daily/
  packages/shared/   @daily/shared — framework-free domain + wire contracts (zod)
  apps/api/          NestJS + Prisma + PostgreSQL
  apps/mobile/       Expo (iOS, Android, web) — local-first
  docs/              this file, ROADMAP, SYNC protocol, ADRs
```

`@daily/shared` is the only code shared by both sides. It contains pure functions and schemas only (no React, no Nest, no Prisma), so the same validation and conflict rules run on the device and on the server.

## Dependency rule

```
presentation → application → domain
infrastructure → application (implements its ports) → domain
```

- **domain**: entities, invariants, value rules. No framework imports.
- **application**: use cases + ports (interfaces / abstract classes). Owns transactions through the `TransactionRunner` port.
- **infrastructure**: Prisma repositories, argon2, JWT, SQLite, HTTP clients.
- **presentation**: Nest controllers (thin), React screens (thin).

### API (`apps/api/src`)

```
core/                       cross-cutting kernel
  domain/errors.ts          DomainError hierarchy (no HTTP)
  application/              TransactionRunner port, Clock
  infrastructure/           PrismaService (+ AsyncLocalStorage tx), config, logger
  presentation/             ZodPipe, JwtAuthGuard, @CurrentUser, error filter
modules/
  auth/{domain,application,infrastructure,presentation}
  entries/{domain,application,infrastructure,presentation}
  sync/{application,presentation}
```

Ports are declared as abstract classes so Nest can use them as DI tokens without string tokens; implementations are bound in each module (`{ provide: EntryRepository, useClass: PrismaEntryRepository }`).

Transactions: `PrismaTransactionRunner` stores the interactive transaction client in `AsyncLocalStorage`; repositories call `prisma.db`, which returns the active transaction client if one exists. Use cases therefore orchestrate transactions without knowing Prisma.

### Mobile (`apps/mobile/src`)

```
app/                         expo-router routes (thin screens)
core/
  application/ports.ts       LocalEntryStore, Outbox, SyncApi, TokenStore, KeyValueStore
  infrastructure/            SQLite database + migrations, repositories, HTTP client, SecureStore
  container.ts               composition root (single place that wires implementations)
features/
  journaling/                use cases (create/edit/delete), autosave controller, hooks
  synchronization/           SyncEngine, status store
  authentication/            sign in/up use cases
design-system/               tokens (light/dark), Text, Screen, IconButton
```

Screens never touch SQLite or `fetch`; they call use cases exposed by the container through a React context.

## Data flow for a keystroke

1. `TextInput.onChangeText` → editor keeps text in component state (no global re-render).
2. `AutosaveController.schedule()` coalesces for 250 ms, then one SQLite transaction writes the entry **and** upserts its outbox row. Also flushed immediately on blur, unmount and `AppState → background`.
3. `SyncEngine.kick()` is debounced 1.5 s; pushes outbox ops in batches, then pulls changes by cursor.

The local write is the durability point. The network is best-effort and retried with exponential backoff + jitter.

## Performance budget decisions

- No state library; a tiny `createStore` + `useSyncExternalStore` for sync status only.
- Lists page by `(entry_date, id)` keyset from SQLite — never load the whole archive.
- `plainText` and `wordCount` derived once on save, not on render.
- Server pull is cursor-based (`syncSeq`), 200 rows per page.
