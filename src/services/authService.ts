import type { VenturesToken, VenturesConfig } from '../types';

const TOKEN_KEY = 'ventures_token';

export class AuthService {
  private config: VenturesConfig;
  private token: VenturesToken | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private onRefresh?: (token: VenturesToken) => void;
  private onError?: (err: Error) => void;

  constructor(config: VenturesConfig) {
    this.config = config;
    const stored = sessionStorage.getItem(TOKEN_KEY);
    if (stored) {
      try {
        const parsed: VenturesToken = JSON.parse(stored);
        if (parsed.expires_at > Date.now() + 5000) this.token = parsed;
      } catch { /* ignore */ }
    }
  }

  setCallbacks(onRefresh: (t: VenturesToken) => void, onError: (e: Error) => void) {
    this.onRefresh = onRefresh;
    this.onError = onError;
  }

  getToken(): string | null {
    return this.token?.access_token ?? null;
  }

  getTokenData(): VenturesToken | null {
    return this.token;
  }

  buildRequestPreview(): { url: string } {
    const params = new URLSearchParams({
      client: this.config.siteName,
      username: this.config.username,
      password: '••••••••',
    });
    return { url: `${this.config.baseUrl}/api/v4/token?${params.toString()}` };
  }

  async authenticate(): Promise<VenturesToken> {
    const params = new URLSearchParams({
      client: this.config.siteName,
      username: this.config.username,
      password: this.config.password,
    });

    const res = await fetch(`${this.config.baseUrl}/api/v4/token?${params.toString()}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Authentication failed (${res.status}): ${text}`);
    }

    const data = await res.json();

    // Ventures response: {"result":{"token":"..."},"succeeded":true}
    const accessToken: string =
      data.result?.token || data.result?.access_token || data.access_token || data.token || '';
    const expiresIn = 3600;

    if (!accessToken) {
      throw new Error(`No access token in response: ${JSON.stringify(data)}`);
    }

    const token: VenturesToken = {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: expiresIn,
      expires_at: Date.now() + expiresIn * 1000,
    };

    this.token = token;
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify(token));
    this.scheduleRefresh(token);
    this.onRefresh?.(token);
    return token;
  }

  private scheduleRefresh(token: VenturesToken) {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    const msUntilRefresh = token.expires_at - Date.now() - 60_000;
    if (msUntilRefresh > 0) {
      this.refreshTimer = setTimeout(() => {
        this.authenticate().catch((e) => this.onError?.(e));
      }, msUntilRefresh);
    }
  }

  invalidate() {
    this.token = null;
    sessionStorage.removeItem(TOKEN_KEY);
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
  }

  updateConfig(config: VenturesConfig) {
    this.config = config;
    this.invalidate();
  }
}
