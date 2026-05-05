import { Injectable, inject, signal, OnDestroy } from '@angular/core';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { take } from 'rxjs';

export interface WsNotification {
  id: string;
  title: string;
  body: string | null;
  type: string;
  category: string;
  entityType: string | null;
  entityId: string | null;
  actionUrl: string | null;
  unreadCount: number;
}

interface WsMessage {
  type: 'notification' | 'unread_count';
  data: WsNotification | { unreadCount: number };
}

@Injectable({ providedIn: 'root' })
export class WebSocketService implements OnDestroy {
  private readonly oidc = inject(OidcSecurityService);
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private intentionallyClosed = false;

  /** Current unread count — updated in real time via WS */
  readonly unreadCount = signal(0);

  /** Fires when a new notification arrives */
  private notificationCallbacks: Array<(n: WsNotification) => void> = [];

  connect(): void {
    this.intentionallyClosed = false;
    this.oidc.getAccessToken().pipe(take(1)).subscribe((token) => {
      if (!token) return;
      this.openSocket(token);
    });
  }

  private openSocket(token: string): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // In dev, API is on port 3000; in prod, same host via proxy
    const host = window.location.hostname;
    const port = window.location.port === '4200' ? '3000' : window.location.port;
    const url = `${protocol}//${host}:${port}/ws?token=${encodeURIComponent(token)}`;

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as WsMessage;
        if (msg.type === 'notification') {
          const notif = msg.data as WsNotification;
          this.unreadCount.set(notif.unreadCount);
          for (const cb of this.notificationCallbacks) cb(notif);
        } else if (msg.type === 'unread_count') {
          this.unreadCount.set((msg.data as { unreadCount: number }).unreadCount);
        }
      } catch { /* ignore malformed messages */ }
    };

    this.ws.onclose = () => {
      this.ws = null;
      if (!this.intentionallyClosed) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after this
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempt), 30_000);
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  /** Register a callback for new notifications */
  onNotification(cb: (n: WsNotification) => void): () => void {
    this.notificationCallbacks.push(cb);
    return () => {
      this.notificationCallbacks = this.notificationCallbacks.filter((c) => c !== cb);
    };
  }

  disconnect(): void {
    this.intentionallyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
