import { AuthExpiredError, NetworkError, type AccessTokenProvider } from '../application/ports';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

const TIMEOUT_MS = 15_000;

/**
 * Thin fetch wrapper. Maps transport failures and 5xx to NetworkError (retryable),
 * 401 to one refresh + retry, then AuthExpiredError.
 */
export class HttpClient {
  constructor(
    private readonly baseUrl: string,
    private readonly tokens: AccessTokenProvider | null = null,
    private readonly onSessionExpired: () => void = () => undefined,
  ) {}

  async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const token = this.tokens ? await this.tokens.accessToken() : null;
    if (this.tokens && !token) {
      this.onSessionExpired();
      throw new AuthExpiredError('Not signed in');
    }
    let res = await this.send(method, path, body, token);

    if (res.status === 401 && this.tokens) {
      const fresh = await this.tokens.refreshAfterUnauthorized().catch(() => null);
      if (fresh) res = await this.send(method, path, body, fresh);
      if (res.status === 401 || !fresh) {
        this.onSessionExpired();
        throw new AuthExpiredError('Session expired');
      }
    }

    if (res.status >= 500 || res.status === 429) throw new NetworkError(`Server unavailable (${res.status})`);
    if (res.status === 204) return undefined as T;
    const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    if (!res.ok) throw new HttpError(res.status, json.error ?? 'http_error', json.message ?? `HTTP ${res.status}`);
    return json as T;
  }

  private async send(method: string, path: string, body: unknown, token: string | null): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch {
      throw new NetworkError('Network request failed');
    } finally {
      clearTimeout(timer);
    }
  }
}
