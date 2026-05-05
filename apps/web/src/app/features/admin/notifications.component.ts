import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { environment } from '../../../environments/environment';

interface Notification {
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
  selector: 'app-notifications-page',
  standalone: true,
  imports: [CommonModule, TableModule, TagModule, ButtonModule],
  template: `
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-semibold text-gray-800 flex items-center gap-2">
          <i class="pi pi-bell text-blue-600"></i> All Notifications
        </h2>
        <p class="text-sm text-gray-500 mt-1">Notification history</p>
      </div>
      <div class="flex gap-2">
        <p-button label="Load More" icon="pi pi-arrow-down" [outlined]="true" (onClick)="loadMore()" [disabled]="!hasMore" [loading]="loadingMore" />
      </div>
    </div>

    <div class="bg-white rounded-lg shadow-sm border border-gray-200">
      <p-table [value]="notifications()" [loading]="loading()" styleClass="p-datatable-sm p-datatable-striped">
        <ng-template pTemplate="header">
          <tr>
            <th style="width:30px"></th>
            <th>Title</th>
            <th>Details</th>
            <th style="width:100px">Category</th>
            <th style="width:80px">Status</th>
            <th style="width:160px">Date</th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-n>
          <tr class="cursor-pointer hover:bg-blue-50" [class.font-semibold]="!n.isRead" (click)="onNotifClick(n)">
            <td>
              <i [class]="getIcon(n.category)" [class.text-blue-500]="!n.isRead" [class.text-gray-400]="n.isRead"></i>
            </td>
            <td>
              <div class="text-sm">{{ n.title }}</div>
            </td>
            <td>
              @if (n.body) {
                <div class="text-xs text-gray-500 line-clamp-1">{{ n.body }}</div>
              }
            </td>
            <td>
              <p-tag [value]="n.category" [severity]="categorySeverity(n.category)" />
            </td>
            <td>
              @if (n.isRead) {
                <span class="text-xs text-gray-400">Read</span>
              } @else {
                <p-tag value="Unread" severity="info" />
              }
            </td>
            <td class="text-xs text-gray-500">{{ n.createdAt | date:'medium' }}</td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr><td colspan="6" class="text-center text-gray-400 py-8">No notifications</td></tr>
        </ng-template>
      </p-table>
    </div>
  `,
})
export class NotificationsPageComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  notifications = signal<Notification[]>([]);
  loading = signal(true);
  loadingMore = false;
  hasMore = false;
  private cursor: string | null = null;

  ngOnInit(): void {
    this.loadNotifications();
  }

  private loadNotifications(): void {
    this.loading.set(true);
    this.http.get<{ data: Notification[]; meta: { next_cursor: string | null } }>(
      `${environment.apiBaseUrl}/notifications?limit=50`,
    ).subscribe({
      next: (r) => {
        this.notifications.set(r.data);
        this.cursor = r.meta.next_cursor;
        this.hasMore = !!this.cursor;
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  loadMore(): void {
    if (!this.cursor) return;
    this.loadingMore = true;
    this.http.get<{ data: Notification[]; meta: { next_cursor: string | null } }>(
      `${environment.apiBaseUrl}/notifications?limit=50&cursor=${encodeURIComponent(this.cursor)}`,
    ).subscribe({
      next: (r) => {
        this.notifications.update((list) => [...list, ...r.data]);
        this.cursor = r.meta.next_cursor;
        this.hasMore = !!this.cursor;
        this.loadingMore = false;
      },
      error: () => this.loadingMore = false,
    });
  }

  onNotifClick(n: Notification): void {
    if (!n.isRead) {
      this.http.patch(`${environment.apiBaseUrl}/notifications/${n.id}/read`, {}).subscribe({
        next: () => {
          this.notifications.update((list) =>
            list.map((item) => item.id === n.id ? { ...item, isRead: true } : item),
          );
        },
      });
    }
    if (n.actionUrl) {
      this.router.navigateByUrl(n.actionUrl);
    }
  }

  getIcon(category: string): string {
    switch (category) {
      case 'TRAVEL': return 'pi pi-car';
      case 'ACTIVITY': return 'pi pi-calendar';
      case 'PROJECT': return 'pi pi-folder';
      case 'EXPENSE': return 'pi pi-wallet';
      case 'SYSTEM': return 'pi pi-cog';
      default: return 'pi pi-bell';
    }
  }

  categorySeverity(category: string): 'info' | 'success' | 'warn' | 'danger' | 'secondary' {
    switch (category) {
      case 'TRAVEL': return 'info';
      case 'ACTIVITY': return 'warn';
      case 'PROJECT': return 'success';
      case 'EXPENSE': return 'danger';
      default: return 'secondary';
    }
  }
}
