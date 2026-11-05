import type { Credentials, Session } from '@daily/shared';
import { observable, type Observable } from '../../../core/application/observable';
import { type AccessTokenProvider, type AuthApi, AuthExpiredError, type Clock, type SessionStore } from '../../../core/application/ports';

/** Refresh slightly early so requests never race the expiry. */
const EXPIRY_SKEW_MS = 30_000;

/**
 * Owns the session lifecycle. Accounts are optional: without one the app is
 * fully usable offline; signing in only turns on sync.
 */
export class SessionManager implements AccessTokenProvider {
  readonly signedIn: Observable<boolean> = observable(false);
  private session: Session | null = null;
  private refreshing: Promise<string | null> | null = null;

  constructor(
    private readonly api: AuthApi,
    private readonly store: SessionStore,
    private readonly clock: Clock,
  ) {}

  async init(): Promise<void> {
    this.setSession(await this.store.load(), false);
  }

  isSignedIn(): boolean {
    return this.session !== null;
  }

  async signIn(credentials: Credentials): Promise<void> {
    this.setSession(await this.api.login(credentials));
  }

  async signUp(credentials: Credentials): Promise<void> {
    this.setSession(await this.api.register(credentials));
  }

  async signOut(): Promise<void> {
    const current = this.session;
    this.setSession(null);
    // Best effort: local sign-out must succeed even offline.
    if (current) await this.api.logout(current.refreshToken).catch(() => undefined);
  }

  async accessToken(): Promise<string | null> {
    if (!this.session) return null;
    if (Date.parse(this.session.accessExpiresAt) - EXPIRY_SKEW_MS > this.clock.now().getTime()) {
      return this.session.accessToken;
    }
    return this.refresh();
  }

  refreshAfterUnauthorized(): Promise<string | null> {
    return this.refresh();
  }

  /** Single-flight: concurrent callers share one refresh request (rotation makes tokens single-use). */
  private refresh(): Promise<string | null> {
    if (!this.session) return Promise.resolve(null);
    this.refreshing ??= this.api
      .refresh(this.session.refreshToken)
      .then((next) => {
        this.setSession(next);
        return next.accessToken;
      })
      .catch((error: unknown) => {
        // Rejected refresh token = session is over; anything else (offline) keeps the session.
        if (error instanceof AuthExpiredError) {
          this.setSession(null);
          return null;
        }
        throw error;
      })
      .finally(() => {
        this.refreshing = null;
      });
    return this.refreshing;
  }

  /** Called by the HTTP layer when the server definitively rejected the session. */
  expire(): void {
    this.setSession(null);
  }

  private setSession(session: Session | null, persist = true): void {
    this.session = session;
    this.signedIn.set(session !== null);
    if (persist) void this.store.save(session);
  }
}
