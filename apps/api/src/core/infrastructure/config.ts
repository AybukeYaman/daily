import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGINS: z.string().default(''),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export class AppConfig {
  readonly databaseUrl: string;
  readonly jwtSecret: string;
  readonly port: number;
  readonly corsOrigins: string[];
  readonly isProduction: boolean;
  readonly accessTokenTtlSeconds = 15 * 60;
  readonly refreshTokenTtlSeconds = 30 * 24 * 60 * 60;

  constructor(env: NodeJS.ProcessEnv) {
    const parsed = EnvSchema.safeParse(env);
    if (!parsed.success) {
      // Fail fast at boot; only variable names are printed, never values.
      const names = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
      throw new Error(`Invalid environment configuration: ${names}`);
    }
    const e = parsed.data;
    this.databaseUrl = e.DATABASE_URL;
    this.jwtSecret = e.JWT_SECRET;
    this.port = e.PORT;
    this.corsOrigins = e.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
    this.isProduction = e.NODE_ENV === 'production';
  }
}
