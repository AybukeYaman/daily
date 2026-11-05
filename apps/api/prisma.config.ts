import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * `prisma generate` (run on every `npm install`) needs no database, so a missing
 * DATABASE_URL must not break installation — e.g. when only the mobile app is
 * being built. Migrate/deploy commands still fail fast without it.
 */
const url = process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  ...(url ? { datasource: { url } } : {}),
});
