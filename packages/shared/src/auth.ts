import { z } from 'zod';

export const CredentialsSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  password: z.string().min(10, 'At least 10 characters').max(256),
});
export type Credentials = z.infer<typeof CredentialsSchema>;

export const RefreshRequestSchema = z.object({ refreshToken: z.string().min(20).max(200) });
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;

export const SessionSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  accessExpiresAt: z.iso.datetime(),
});
export type Session = z.infer<typeof SessionSchema>;
