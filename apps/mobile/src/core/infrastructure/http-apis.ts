import {
  type Credentials,
  type OpResult,
  type PullResponse,
  PullResponseSchema,
  type PushOp,
  PushResponseSchema,
  type Session,
  SessionSchema,
  type VersionDetail,
  VersionDetailSchema,
  VersionListSchema,
  type VersionSummary,
} from '@daily/shared';
import { AuthExpiredError, type AuthApi, type HistoryApi, type SyncApi } from '../application/ports';
import { HttpError, type HttpClient } from './http-client';

/** Responses are validated with the shared schemas: a bad server reply never reaches the local database. */
export class HttpAuthApi implements AuthApi {
  constructor(private readonly http: HttpClient) {}

  async register(credentials: Credentials): Promise<Session> {
    return SessionSchema.parse(await this.http.request('POST', '/auth/register', credentials));
  }
  async login(credentials: Credentials): Promise<Session> {
    return SessionSchema.parse(await this.http.request('POST', '/auth/login', credentials));
  }
  async refresh(refreshToken: string): Promise<Session> {
    try {
      return SessionSchema.parse(await this.http.request('POST', '/auth/refresh', { refreshToken }));
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) throw new AuthExpiredError(error.message);
      throw error;
    }
  }
  async logout(refreshToken: string): Promise<void> {
    await this.http.request('POST', '/auth/logout', { refreshToken });
  }
}

export class HttpSyncApi implements SyncApi {
  constructor(private readonly http: HttpClient) {}

  async push(ops: PushOp[]): Promise<OpResult[]> {
    return PushResponseSchema.parse(await this.http.request('POST', '/sync/push', { ops })).results;
  }
  async pull(since: number): Promise<PullResponse> {
    return PullResponseSchema.parse(await this.http.request('GET', `/sync/pull?since=${since}`));
  }
}

export class HttpHistoryApi implements HistoryApi {
  constructor(private readonly http: HttpClient) {}

  async list(entryId: string): Promise<VersionSummary[]> {
    return VersionListSchema.parse(await this.http.request('GET', `/entries/${encodeURIComponent(entryId)}/versions`)).versions;
  }
  async get(entryId: string, revision: number): Promise<VersionDetail> {
    return VersionDetailSchema.parse(
      await this.http.request('GET', `/entries/${encodeURIComponent(entryId)}/versions/${revision}`),
    );
  }
}
