import { Injectable, inject } from '@angular/core';
import { App } from '@capacitor/app';
import { Device } from '@capacitor/device';
import { ApiService } from './api.service';

const HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000; // sync every 2 minutes while active

@Injectable({ providedIn: 'root' })
export class UsageTrackerService {
  private readonly api = inject(ApiService);

  private initialized = false;
  private sessionStart: number | null = null;
  private todayDate = '';
  private todaySeconds = 0;
  private todaySessions = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  /** Call once after user is authenticated */
  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    this.loadFromStorage();
    this.retrySyncIfPending();
    await this.registerDevice();
    this.startSession();

    App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        this.startSession();
        this.startHeartbeat();
      } else {
        this.stopHeartbeat();
        this.endSession();
        this.syncToServer();
      }
    });

    // Start heartbeat for the initial foreground session
    this.startHeartbeat();
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.flushAndSync();
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /** Flush current session elapsed time and sync to server without ending the session */
  private flushAndSync(): void {
    if (this.sessionStart) {
      const now = Date.now();
      const elapsed = Math.floor((now - this.sessionStart) / 1000);
      this.todaySeconds += elapsed;
      this.sessionStart = now; // restart timer from now
      this.saveToStorage();
    }
    this.syncToServer();
  }

  private startSession(): void {
    const today = new Date().toISOString().slice(0, 10);

    if (today !== this.todayDate) {
      // Day rolled over — sync previous day, then reset
      if (this.todayDate && this.todaySeconds > 0) {
        this.syncToServer();
      }
      this.todayDate = today;
      this.todaySeconds = 0;
      this.todaySessions = 0;
    }

    this.sessionStart = Date.now();
    this.todaySessions++;
    this.saveToStorage();
  }

  private endSession(): void {
    if (this.sessionStart) {
      const elapsed = Math.floor((Date.now() - this.sessionStart) / 1000);
      this.todaySeconds += elapsed;
      this.sessionStart = null;
      this.saveToStorage();
    }
  }

  private syncToServer(): void {
    if (this.todaySeconds <= 0 || !this.todayDate) return;

    const payload = {
      date: this.todayDate,
      activeSeconds: this.todaySeconds,
      sessionCount: this.todaySessions,
    };

    this.api.post('/app-usage/sync', payload).subscribe({
      next: () => {
        // Reset local counters after successful sync
        this.todaySeconds = 0;
        this.todaySessions = 0;
        this.saveToStorage();
        try { localStorage.removeItem('usage_pending_sync'); } catch { /* */ }
      },
      error: () => {
        // Store for retry on next app open
        try { localStorage.setItem('usage_pending_sync', JSON.stringify(payload)); } catch { /* */ }
      },
    });
  }

  private retrySyncIfPending(): void {
    try {
      const pending = localStorage.getItem('usage_pending_sync');
      if (!pending) return;
      const payload = JSON.parse(pending);
      this.api.post('/app-usage/sync', payload).subscribe({
        next: () => {
          localStorage.removeItem('usage_pending_sync');
        },
      });
    } catch { /* */ }
  }

  private async registerDevice(): Promise<void> {
    try {
      const info = await Device.getInfo();
      const deviceId = await Device.getId();

      this.api.post('/app-usage/device', {
        platform: info.platform.toUpperCase(),
        deviceId: deviceId.identifier,
        appVersion: ('appVersion' in info ? info.appVersion : undefined) || '1.0.0',
      }).subscribe(); // fire-and-forget
    } catch { /* */ }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem('usage_today_date', this.todayDate);
      localStorage.setItem('usage_today_seconds', String(this.todaySeconds));
      localStorage.setItem('usage_today_sessions', String(this.todaySessions));
    } catch { /* */ }
  }

  private loadFromStorage(): void {
    try {
      const date = localStorage.getItem('usage_today_date') || '';
      const seconds = parseInt(localStorage.getItem('usage_today_seconds') || '0', 10);
      const sessions = parseInt(localStorage.getItem('usage_today_sessions') || '0', 10);

      const today = new Date().toISOString().slice(0, 10);
      if (date === today) {
        this.todayDate = date;
        this.todaySeconds = seconds;
        this.todaySessions = sessions;
      } else if (date && seconds > 0) {
        // Previous day's unsent data — queue for sync
        localStorage.setItem('usage_pending_sync', JSON.stringify({
          date,
          activeSeconds: seconds,
          sessionCount: sessions,
        }));
        this.todayDate = today;
        this.todaySeconds = 0;
        this.todaySessions = 0;
      }
    } catch { /* */ }
  }
}
