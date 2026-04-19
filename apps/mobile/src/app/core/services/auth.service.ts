import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
  token_type: string;
}

interface TokenPayload {
  sub: string;
  preferred_username?: string;
  email?: string;
  given_name?: string;
  family_name?: string;
  realm_access?: { roles: string[] };
  exp: number;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly tokenUrl =
    `${environment.keycloak.authority}/protocol/openid-connect/token`;
  private readonly clientId = environment.keycloak.clientId;

  private readonly _accessToken = signal<string | null>(null);
  private readonly _refreshToken = signal<string | null>(null);
  private readonly _user = signal<TokenPayload | null>(null);
  private readonly _error = signal<string | null>(null);

  readonly isAuthenticated = computed(() => {
    const token = this._accessToken();
    if (!token) return false;
    const payload = this.decodeToken(token);
    if (!payload) return false;
    return payload.exp * 1000 > Date.now();
  });

  readonly user = this._user.asReadonly();
  readonly error = this._error.asReadonly();

  get accessToken(): string | null {
    return this._accessToken();
  }

  constructor(private readonly http: HttpClient) {
    this.loadFromStorage();
  }

  async login(username: string, password: string): Promise<boolean> {
    this._error.set(null);

    const body = new URLSearchParams({
      grant_type: 'password',
      client_id: this.clientId,
      username,
      password,
      scope: environment.keycloak.scope,
    });

    try {
      const res = await fetch(this.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        const msg = errData?.error_description || errData?.error || `Login failed (${res.status})`;
        this._error.set(msg);
        return false;
      }

      const data: TokenResponse = await res.json();
      this.setTokens(data);
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this._error.set(`Connection error: ${msg}`);
      return false;
    }
  }

  async refreshAccessToken(): Promise<boolean> {
    const rt = this._refreshToken();
    if (!rt) return false;

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.clientId,
      refresh_token: rt,
    });

    try {
      const res = await fetch(this.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      if (!res.ok) {
        this.clearTokens();
        return false;
      }

      const data: TokenResponse = await res.json();
      this.setTokens(data);
      return true;
    } catch {
      this.clearTokens();
      return false;
    }
  }

  logout(): void {
    this.clearTokens();
  }

  private setTokens(data: TokenResponse): void {
    this._accessToken.set(data.access_token);
    this._refreshToken.set(data.refresh_token);

    const payload = this.decodeToken(data.access_token);
    this._user.set(payload);

    // Persist for app restarts
    try {
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);
    } catch {
      // Storage not available — tokens live in memory only
    }
  }

  private clearTokens(): void {
    this._accessToken.set(null);
    this._refreshToken.set(null);
    this._user.set(null);
    try {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
    } catch {
      // ignore
    }
  }

  private loadFromStorage(): void {
    try {
      const at = localStorage.getItem('access_token');
      const rt = localStorage.getItem('refresh_token');
      if (at && rt) {
        this._accessToken.set(at);
        this._refreshToken.set(rt);
        const payload = this.decodeToken(at);
        this._user.set(payload);

        // If expired, try refresh
        if (payload && payload.exp * 1000 < Date.now()) {
          this.refreshAccessToken();
        }
      }
    } catch {
      // ignore
    }
  }

  private decodeToken(token: string): TokenPayload | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const payload = JSON.parse(atob(parts[1]));
      return payload as TokenPayload;
    } catch {
      return null;
    }
  }
}
