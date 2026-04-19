import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';
import { CardModule } from 'primeng/card';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';

interface UsageSummary {
  userId: string;
  fullName: string;
  email: string;
  status: string;
  platform: string;
  appVersion: string | null;
  deviceRegisteredAt: string;
  totalSeconds: number;
  totalSessions: number;
  activeDays: number;
  lastSeenAt: string | null;
  avgSecondsPerDay: number;
}

interface DailyUsage {
  date: string;
  activeSeconds: number;
  sessionCount: number;
  lastSeenAt: string;
}

interface UserDetail {
  user: { id: string; fullName: string; email: string; status: string };
  devices: { platform: string; deviceId: string; appVersion: string | null; createdAt: string; updatedAt: string }[];
  dailyUsage: DailyUsage[];
}

@Component({
  selector: 'app-mobile-usage',
  standalone: true,
  imports: [CommonModule, TableModule, TagModule, ButtonModule, DialogModule, ToastModule, CardModule, TooltipModule],
  providers: [MessageService],
  template: `
    <p-toast />

    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-semibold text-gray-800">Mobile App Usage</h2>
        <p class="text-sm text-gray-500 mt-1">Track app installations, active users, and usage patterns</p>
      </div>
      <p-button label="Refresh" icon="pi pi-refresh" [outlined]="true" (onClick)="load()" />
    </div>

    <!-- Summary Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
            <i class="pi pi-mobile text-blue-600 text-lg"></i>
          </div>
          <div>
            <p class="text-sm text-gray-500">Installed Devices</p>
            <p class="text-2xl font-bold text-gray-800">{{ users().length }}</p>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
            <i class="pi pi-circle-fill text-green-500 text-sm"></i>
          </div>
          <div>
            <p class="text-sm text-gray-500">Active Now</p>
            <p class="text-2xl font-bold text-green-600">{{ activeNowCount() }}</p>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
            <i class="pi pi-calendar text-purple-600 text-lg"></i>
          </div>
          <div>
            <p class="text-sm text-gray-500">Active Today</p>
            <p class="text-2xl font-bold text-gray-800">{{ activeTodayCount() }}</p>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
            <i class="pi pi-clock text-amber-600 text-lg"></i>
          </div>
          <div>
            <p class="text-sm text-gray-500">Avg Daily Usage</p>
            <p class="text-2xl font-bold text-gray-800">{{ avgDailyUsage() }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Users Table -->
    @if (loading()) {
      <div class="flex items-center gap-2 text-gray-500 py-12 justify-center">
        <i class="pi pi-spin pi-spinner text-2xl"></i> Loading...
      </div>
    } @else {
      <div class="bg-white rounded-lg shadow-sm border border-gray-200">
        <p-table [value]="users()" styleClass="p-datatable-sm" [sortField]="'lastSeenAt'" [sortOrder]="-1"
                 [globalFilterFields]="['fullName', 'email', 'platform']">
          <ng-template pTemplate="header">
            <tr>
              <th class="font-semibold" style="width:40px"></th>
              <th class="font-semibold" pSortableColumn="fullName">User <p-sortIcon field="fullName" /></th>
              <th class="font-semibold">Platform</th>
              <th class="font-semibold">Version</th>
              <th class="font-semibold" pSortableColumn="lastSeenAt">Last Seen <p-sortIcon field="lastSeenAt" /></th>
              <th class="font-semibold" pSortableColumn="totalSeconds">Total Time <p-sortIcon field="totalSeconds" /></th>
              <th class="font-semibold" pSortableColumn="activeDays">Active Days <p-sortIcon field="activeDays" /></th>
              <th class="font-semibold" pSortableColumn="avgSecondsPerDay">Avg/Day <p-sortIcon field="avgSecondsPerDay" /></th>
              <th class="font-semibold" pSortableColumn="totalSessions">Sessions <p-sortIcon field="totalSessions" /></th>
              <th class="font-semibold" style="width:80px">Details</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-u>
            <tr>
              <td>
                <i class="pi pi-circle-fill" [class]="isActiveNow(u) ? 'text-green-500' : 'text-gray-300'" style="font-size:0.6rem"
                   [pTooltip]="isActiveNow(u) ? 'Online now' : 'Offline'"></i>
              </td>
              <td>
                <div>
                  <span class="font-medium">{{ u.fullName }}</span>
                  <div class="text-xs text-gray-400">{{ u.email }}</div>
                </div>
              </td>
              <td>
                <p-tag [value]="u.platform" [severity]="u.platform === 'ANDROID' ? 'success' : u.platform === 'IOS' ? 'info' : 'secondary'"
                       [style]="{'font-size':'0.7rem'}" />
              </td>
              <td><span class="text-sm font-mono">{{ u.appVersion || '—' }}</span></td>
              <td>
                <span class="text-sm" [class]="isActiveNow(u) ? 'text-green-600 font-semibold' : ''">
                  {{ u.lastSeenAt ? formatRelative(u.lastSeenAt) : 'Never' }}
                </span>
              </td>
              <td><span class="text-sm font-medium">{{ formatDuration(u.totalSeconds) }}</span></td>
              <td><span class="text-sm">{{ u.activeDays }}</span></td>
              <td><span class="text-sm">{{ formatDuration(u.avgSecondsPerDay) }}</span></td>
              <td><span class="text-sm">{{ u.totalSessions }}</span></td>
              <td>
                <p-button icon="pi pi-chart-bar" [rounded]="true" [text]="true" severity="info" size="small"
                          pTooltip="View daily usage" (onClick)="openDetail(u)" />
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td colspan="10" class="text-center py-8 text-gray-500">No devices registered yet. Users will appear here once they install and open the mobile app.</td></tr>
          </ng-template>
        </p-table>
      </div>
    }

    <!-- Detail Dialog -->
    <p-dialog [header]="detailUser()?.user?.fullName + ' — Usage History'" [(visible)]="detailVisible"
              [modal]="true" [style]="{width:'700px'}" [dismissableMask]="true">
      @if (detailUser(); as d) {
        <!-- Device Info -->
        <div class="mb-4">
          <h4 class="text-sm font-semibold text-gray-600 mb-2">Registered Devices</h4>
          <div class="flex flex-wrap gap-2">
            @for (dev of d.devices; track dev.deviceId) {
              <div class="bg-gray-50 border rounded-md px-3 py-2 text-sm">
                <span class="font-medium">{{ dev.platform }}</span>
                @if (dev.appVersion) { <span class="text-gray-400 ml-1">v{{ dev.appVersion }}</span> }
                <div class="text-xs text-gray-400">Registered {{ formatDate(dev.createdAt) }}</div>
              </div>
            }
          </div>
        </div>

        <!-- Daily Usage Table -->
        <div class="bg-white rounded-lg border border-gray-200">
          <p-table [value]="d.dailyUsage" styleClass="p-datatable-sm" [rows]="15" [paginator]="d.dailyUsage.length > 15">
            <ng-template pTemplate="header">
              <tr>
                <th class="font-semibold">Date</th>
                <th class="font-semibold">Active Time</th>
                <th class="font-semibold">Sessions</th>
                <th class="font-semibold">Last Active</th>
              </tr>
            </ng-template>
            <ng-template pTemplate="body" let-row>
              <tr>
                <td><span class="text-sm font-medium">{{ formatDate(row.date) }}</span></td>
                <td>
                  <div class="flex items-center gap-2">
                    <div class="h-2 bg-blue-200 rounded-full" [style.width.px]="Math.min(row.activeSeconds / 36, 120)"></div>
                    <span class="text-sm">{{ formatDuration(row.activeSeconds) }}</span>
                  </div>
                </td>
                <td><span class="text-sm">{{ row.sessionCount }}</span></td>
                <td><span class="text-sm text-gray-500">{{ formatTime(row.lastSeenAt) }}</span></td>
              </tr>
            </ng-template>
            <ng-template pTemplate="emptymessage">
              <tr><td colspan="4" class="text-center py-6 text-gray-500">No usage data recorded yet.</td></tr>
            </ng-template>
          </p-table>
        </div>
      }
    </p-dialog>
  `,
})
export class MobileUsageComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly msg = inject(MessageService);
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  readonly users = signal<UsageSummary[]>([]);
  readonly loading = signal(true);
  readonly detailUser = signal<UserDetail | null>(null);
  detailVisible = false;

  // Expose Math to template
  readonly Math = Math;

  readonly activeNowCount = computed(() =>
    this.users().filter((u) => this.isActiveNow(u)).length
  );

  readonly activeTodayCount = computed(() => {
    const today = new Date().toISOString().slice(0, 10);
    return this.users().filter((u) =>
      u.lastSeenAt && u.lastSeenAt.startsWith(today)
    ).length;
  });

  readonly avgDailyUsage = computed(() => {
    const list = this.users().filter((u) => u.avgSecondsPerDay > 0);
    if (list.length === 0) return '0m';
    const avg = Math.round(list.reduce((s, u) => s + u.avgSecondsPerDay, 0) / list.length);
    return this.formatDuration(avg);
  });

  ngOnInit(): void {
    this.load();
    // Auto-refresh every 60 seconds for "active now" status
    this.refreshTimer = setInterval(() => this.load(), 60_000);
  }

  ngOnDestroy(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  load(): void {
    this.loading.set(true);
    this.http.get<{ data: UsageSummary[] }>(`${environment.apiBaseUrl}/app-usage/admin/summary?limit=200`)
      .subscribe({
        next: (r) => {
          this.users.set(r.data);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to load usage data' });
        },
      });
  }

  openDetail(u: UsageSummary): void {
    this.http.get<{ data: UserDetail }>(`${environment.apiBaseUrl}/app-usage/admin/users/${u.userId}`)
      .subscribe({
        next: (r) => {
          this.detailUser.set(r.data);
          this.detailVisible = true;
        },
        error: () => {
          this.msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to load user details' });
        },
      });
  }

  isActiveNow(u: UsageSummary): boolean {
    if (!u.lastSeenAt) return false;
    const diff = Date.now() - new Date(u.lastSeenAt).getTime();
    return diff < 5 * 60 * 1000; // 5 minutes
  }

  formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  formatRelative(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'Yesterday';
    if (days < 30) return `${days}d ago`;
    return new Date(iso).toLocaleDateString();
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }
}
