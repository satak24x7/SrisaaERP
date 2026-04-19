import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonIcon,
  IonBadge,
  IonNote,
  IonButton,
  IonButtons,
  IonRefresher,
  IonRefresherContent,
  IonSpinner,
  IonItemSliding,
  IonItemOptions,
  IonItemOption,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  carOutline,
  calendarOutline,
  folderOutline,
  walletOutline,
  cogOutline,
  notificationsOutline,
  checkmarkDoneOutline,
} from 'ionicons/icons';
import { ApiService } from '../../core/services/api.service';

addIcons({
  carOutline, calendarOutline, folderOutline, walletOutline,
  cogOutline, notificationsOutline, checkmarkDoneOutline,
});

interface AppNotification {
  id: string;
  title: string;
  body: string | null;
  type: string;
  category: string;
  isRead: boolean;
  entityType: string | null;
  entityId: string | null;
  actionUrl: string | null;
  createdAt: string;
}

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [
    CommonModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem,
    IonLabel, IonIcon, IonBadge, IonNote, IonButton, IonButtons,
    IonRefresher, IonRefresherContent, IonSpinner,
    IonItemSliding, IonItemOptions, IonItemOption,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-title>Notifications</ion-title>
        @if (unreadCount() > 0) {
          <ion-buttons slot="end">
            <ion-button (click)="markAllRead()">
              <ion-icon slot="start" name="checkmark-done-outline"></ion-icon>
              Read All
            </ion-button>
          </ion-buttons>
        }
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-refresher slot="fixed" (ionRefresh)="onRefresh($event)">
        <ion-refresher-content></ion-refresher-content>
      </ion-refresher>

      @if (loading()) {
        <div class="ion-text-center ion-padding">
          <ion-spinner name="crescent"></ion-spinner>
        </div>
      }

      @if (!loading() && notifications().length === 0) {
        <div class="ion-text-center ion-padding" style="margin-top: 60px; color: var(--ion-color-medium);">
          <ion-icon name="notifications-outline" style="font-size: 64px;"></ion-icon>
          <p>No notifications yet</p>
        </div>
      }

      <ion-list>
        @for (n of notifications(); track n.id) {
          <ion-item-sliding>
            <ion-item [button]="true" (click)="onTap(n)"
                      [style.background]="n.isRead ? '' : '#eff6ff'">
              <ion-icon slot="start"
                        [name]="getCategoryIcon(n.category)"
                        [color]="n.isRead ? 'medium' : 'primary'"
                        style="font-size: 20px;"></ion-icon>
              <ion-label>
                <h2 [style.font-weight]="n.isRead ? '400' : '600'">{{ n.title }}</h2>
                @if (n.body) {
                  <p>{{ n.body }}</p>
                }
                <p style="font-size: 11px; color: var(--ion-color-medium);">{{ formatTime(n.createdAt) }}</p>
              </ion-label>
              @if (!n.isRead) {
                <ion-badge slot="end" color="primary" style="width:8px;height:8px;min-width:8px;border-radius:50%;padding:0;"></ion-badge>
              }
            </ion-item>

            <ion-item-options side="end">
              @if (!n.isRead) {
                <ion-item-option color="primary" (click)="markRead(n)">
                  Read
                </ion-item-option>
              }
            </ion-item-options>
          </ion-item-sliding>
        }
      </ion-list>
    </ion-content>
  `,
})
export class NotificationsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly notifications = signal<AppNotification[]>([]);
  readonly loading = signal(false);
  readonly unreadCount = signal(0);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.get<{ data: AppNotification[]; meta: { unreadCount: number } }>('/notifications', { limit: 50 }).subscribe({
      next: (res) => {
        this.notifications.set(res.data);
        this.unreadCount.set(res.meta.unreadCount);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  onRefresh(event: CustomEvent): void {
    this.api.get<{ data: AppNotification[]; meta: { unreadCount: number } }>('/notifications', { limit: 50 }).subscribe({
      next: (res) => {
        this.notifications.set(res.data);
        this.unreadCount.set(res.meta.unreadCount);
        (event.target as HTMLIonRefresherElement).complete();
      },
      error: () => (event.target as HTMLIonRefresherElement).complete(),
    });
  }

  onTap(n: AppNotification): void {
    if (!n.isRead) {
      this.markRead(n);
    }
    // Navigate based on entity type
    if (n.entityType === 'TRAVEL_PLAN' && n.entityId) {
      this.router.navigate(['/tabs/travels', n.entityId]);
    } else if (n.entityType === 'ACTIVITY' && n.entityId) {
      this.router.navigate(['/tabs/activities', n.entityId]);
    }
  }

  markRead(n: AppNotification): void {
    this.api.patch(`/notifications/${n.id}/read`, {}).subscribe({
      next: () => {
        this.notifications.update((list) =>
          list.map((item) => item.id === n.id ? { ...item, isRead: true } : item)
        );
        this.unreadCount.update((c) => Math.max(0, c - 1));
      },
    });
  }

  markAllRead(): void {
    this.api.post('/notifications/read-all', {}).subscribe({
      next: () => {
        this.notifications.update((list) => list.map((n) => ({ ...n, isRead: true })));
        this.unreadCount.set(0);
      },
    });
  }

  getCategoryIcon(category: string): string {
    switch (category) {
      case 'TRAVEL': return 'car-outline';
      case 'ACTIVITY': return 'calendar-outline';
      case 'PROJECT': return 'folder-outline';
      case 'EXPENSE': return 'wallet-outline';
      case 'SYSTEM': return 'cog-outline';
      default: return 'notifications-outline';
    }
  }

  formatTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'Yesterday';
    return new Date(iso).toLocaleDateString();
  }
}
