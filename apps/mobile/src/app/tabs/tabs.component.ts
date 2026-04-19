import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import {
  IonTabs,
  IonTabBar,
  IonTabButton,
  IonIcon,
  IonLabel,
  IonBadge,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { checkboxOutline, calendarOutline, airplaneOutline, notificationsOutline } from 'ionicons/icons';
import { ApiService } from '../core/services/api.service';
import { AuthService } from '../core/services/auth.service';

addIcons({ checkboxOutline, calendarOutline, airplaneOutline, notificationsOutline });

@Component({
  selector: 'app-tabs',
  standalone: true,
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, IonBadge],
  template: `
    <ion-tabs>
      <ion-tab-bar slot="bottom">
        <ion-tab-button tab="activities">
          <ion-icon name="checkbox-outline"></ion-icon>
          <ion-label>Activities</ion-label>
        </ion-tab-button>

        <ion-tab-button tab="calendar">
          <ion-icon name="calendar-outline"></ion-icon>
          <ion-label>Calendar</ion-label>
        </ion-tab-button>

        <ion-tab-button tab="travels">
          <ion-icon name="airplane-outline"></ion-icon>
          <ion-label>Travels</ion-label>
        </ion-tab-button>

        <ion-tab-button tab="notifications">
          <ion-icon name="notifications-outline"></ion-icon>
          @if (unreadCount() > 0) {
            <ion-badge color="danger" style="position:absolute;top:2px;right:12px;font-size:10px;min-width:16px;">
              {{ unreadCount() > 99 ? '99+' : unreadCount() }}
            </ion-badge>
          }
          <ion-label>Alerts</ion-label>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  `,
})
export class TabsComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  readonly unreadCount = signal(0);

  ngOnInit(): void {
    if (this.auth.isAuthenticated()) {
      this.pollUnread();
      this.pollTimer = setInterval(() => this.pollUnread(), 30_000);
    }
  }

  ngOnDestroy(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  private pollUnread(): void {
    this.api.get<{ data: { unreadCount: number } }>('/notifications/unread-count').subscribe({
      next: (r) => this.unreadCount.set(r.data.unreadCount),
    });
  }
}
