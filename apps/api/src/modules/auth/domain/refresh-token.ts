export interface RefreshTokenRecord {
  id: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
}

export type RefreshTokenState = 'valid' | 'expired' | 'revoked' | 'reused';

/**
 * Rotation rule: a refresh token is single-use. Seeing an already-used token
 * means it was copied, so the caller must revoke the whole family.
 */
export function refreshTokenState(token: RefreshTokenRecord, now: Date): RefreshTokenState {
  if (token.revokedAt) return 'revoked';
  if (token.usedAt) return 'reused';
  if (token.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'valid';
}
