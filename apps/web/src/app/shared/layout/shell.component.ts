import { Component, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { environment } from '../../../environments/environment';

interface NavChild {
  label: string;
  icon: string;
  route: string;
}

interface NavGroup {
  label: string;
  icon: string;
  children: NavChild[];
  expanded?: boolean;
}

interface NavLink {
  label: string;
  icon: string;
  route: string;
}

type NavItem = NavGroup | NavLink;

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

function isGroup(item: NavItem): item is NavGroup {
  return 'children' in item;
}

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="flex h-screen">
      <!-- Sidebar -->
      <aside class="w-64 bg-slate-800 text-white flex flex-col">
        <div class="p-4 border-b border-slate-700">
          <h1 class="text-xl font-bold tracking-tight">GovProjects</h1>
          <p class="text-xs text-slate-400 mt-1">Platform</p>
        </div>
        <nav class="flex-1 p-3 space-y-1 overflow-y-auto">
          @for (item of navItems; track item.label) {
            @if (isGroup(item)) {
              <!-- Collapsible group -->
              <div>
                <button
                  (click)="toggleGroup(item)"
                  class="w-full flex items-center justify-between px-3 py-2 rounded-md text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                >
                  <span class="flex items-center gap-3">
                    <i [class]="item.icon"></i>
                    {{ item.label }}
                  </span>
                  <i
                    class="pi text-xs transition-transform duration-200"
                    [class.pi-chevron-down]="item.expanded"
                    [class.pi-chevron-right]="!item.expanded"
                  ></i>
                </button>
                @if (item.expanded) {
                  <div class="ml-4 mt-1 space-y-0.5">
                    @for (child of item.children; track child.route) {
                      <a
                        [routerLink]="child.route"
                        routerLinkActive="bg-slate-700 text-white"
                        class="flex items-center gap-3 px-3 py-1.5 rounded-md text-sm text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
                      >
                        <i [class]="child.icon + ' text-xs'"></i>
                        {{ child.label }}
                      </a>
                    }
                  </div>
                }
              </div>
            } @else {
              <!-- Simple link -->
              <a
                [routerLink]="item.route"
                routerLinkActive="bg-slate-700 text-white"
                class="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
              >
                <i [class]="item.icon"></i>
                {{ item.label }}
              </a>
            }
          }
        </nav>
        <div class="p-4 border-t border-slate-700 text-xs text-slate-500">
          v0.0.1
        </div>
      </aside>

      <!-- Main -->
      <div class="flex-1 flex flex-col overflow-hidden">
        <!-- Top bar -->
        <header class="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shadow-sm">
          <div class="text-sm text-gray-500">
            Welcome back
          </div>
          <div class="flex items-center gap-4">
            <!-- Notification Bell -->
            <div class="relative">
              <button (click)="toggleNotifications($event)"
                      class="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors">
                <i class="pi pi-bell text-lg"></i>
                @if (unreadCount() > 0) {
                  <span class="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                    {{ unreadCount() > 99 ? '99+' : unreadCount() }}
                  </span>
                }
              </button>

              @if (notifPanelOpen()) {
                <div class="absolute right-0 top-12 w-96 bg-white rounded-lg shadow-xl border border-gray-200 z-50 overflow-hidden">
                  <div class="flex items-center justify-between px-4 py-3 bg-gray-50 border-b">
                    <span class="font-semibold text-sm text-gray-700">Notifications</span>
                    @if (unreadCount() > 0) {
                      <button (click)="markAllRead()" class="text-xs text-blue-600 hover:text-blue-800 font-medium">
                        Mark all read
                      </button>
                    }
                  </div>
                  <div class="max-h-96 overflow-y-auto">
                    @if (notifications().length === 0) {
                      <div class="py-10 text-center text-gray-400 text-sm">
                        <i class="pi pi-bell-slash text-2xl mb-2 block"></i>
                        No notifications
                      </div>
                    }
                    @for (n of notifications(); track n.id) {
                      <div (click)="onNotificationClick(n)"
                           class="px-4 py-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                           [class.bg-blue-50]="!n.isRead">
                        <div class="flex items-start gap-3">
                          <div class="mt-0.5">
                            <i [class]="getNotifIcon(n.category)" [class.text-blue-500]="!n.isRead" [class.text-gray-400]="n.isRead"></i>
                          </div>
                          <div class="flex-1 min-w-0">
                            <p class="text-sm font-medium text-gray-800 truncate">{{ n.title }}</p>
                            @if (n.body) {
                              <p class="text-xs text-gray-500 mt-0.5 line-clamp-2">{{ n.body }}</p>
                            }
                            <p class="text-[11px] text-gray-400 mt-1">{{ formatNotifTime(n.createdAt) }}</p>
                          </div>
                          @if (!n.isRead) {
                            <span class="w-2 h-2 bg-blue-500 rounded-full mt-1.5 shrink-0"></span>
                          }
                        </div>
                      </div>
                    }
                  </div>
                </div>
              }
            </div>

            <span class="text-sm font-medium">{{ userName() }}</span>
            <button
              (click)="logout()"
              class="text-sm text-red-600 hover:text-red-800 font-medium"
            >
              Logout
            </button>
          </div>
        </header>

        <!-- Page content -->
        <main class="flex-1 overflow-auto p-6 bg-gray-50">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
})
export class ShellComponent implements OnInit, OnDestroy {
  private readonly oidc = inject(OidcSecurityService);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private clickListener: ((e: Event) => void) | null = null;

  userName = signal('');
  unreadCount = signal(0);
  notifications = signal<Notification[]>([]);
  notifPanelOpen = signal(false);

  isGroup = isGroup;

  navItems: NavItem[] = [
    {
      label: 'Work Area',
      icon: 'pi pi-briefcase',
      expanded: true,
      children: [
        { label: 'Calendar', icon: 'pi pi-calendar', route: '/work-area/calendar' },
        { label: 'Activities', icon: 'pi pi-list', route: '/work-area/activities' },
        { label: 'Travels', icon: 'pi pi-car', route: '/work-area/travels' },
        { label: 'Passwords', icon: 'pi pi-lock', route: '/work-area/passwords' },
      ],
    },
    { label: 'Dashboard', icon: 'pi pi-home', route: '/dashboard' },
    {
      label: 'Sales',
      icon: 'pi pi-chart-line',
      expanded: false,
      children: [
        { label: 'Pipeline', icon: 'pi pi-chart-bar', route: '/sales/pipeline' },
        { label: 'Accounts', icon: 'pi pi-building', route: '/sales/accounts' },
        { label: 'Contacts', icon: 'pi pi-users', route: '/sales/contacts' },
        { label: 'Leads', icon: 'pi pi-filter', route: '/sales/leads' },
        { label: 'Influencers', icon: 'pi pi-user-plus', route: '/sales/influencers' },
        { label: 'Opportunities', icon: 'pi pi-star', route: '/sales/opportunities' },
      ],
    },
    {
      label: 'Projects',
      icon: 'pi pi-folder',
      expanded: false,
      children: [
        { label: 'Dashboard', icon: 'pi pi-chart-bar', route: '/projects/dashboard' },
        { label: 'Kanban', icon: 'pi pi-th-large', route: '/projects/kanban' },
        { label: 'Cash Flow', icon: 'pi pi-money-bill', route: '/projects/cash-flow' },
        { label: 'All Projects', icon: 'pi pi-list', route: '/projects/list' },
      ],
    },
    {
      label: 'Bid Management',
      icon: 'pi pi-file-edit',
      expanded: false,
      children: [
        { label: 'Tenders', icon: 'pi pi-file', route: '/bid-management/tenders' },
      ],
    },
    { label: 'Expenses', icon: 'pi pi-wallet', route: '/expenses' },
    { label: 'Procurement', icon: 'pi pi-truck', route: '/procurement' },
    { label: 'Administration', icon: 'pi pi-sitemap', route: '/administration' },
    {
      label: 'System',
      icon: 'pi pi-cog',
      expanded: false,
      children: [
        { label: 'Company Profile', icon: 'pi pi-briefcase', route: '/admin/company-profile' },
        { label: 'Statutory Registrations', icon: 'pi pi-id-card', route: '/admin/statutory-registrations' },
        { label: 'Business Units', icon: 'pi pi-building', route: '/admin/business-units' },
        { label: 'Lookup Lists', icon: 'pi pi-list', route: '/admin/lookup-lists' },
        { label: 'Governments', icon: 'pi pi-globe', route: '/admin/governments' },
        { label: 'Users', icon: 'pi pi-users', route: '/admin/users' },
        { label: 'Roles', icon: 'pi pi-shield', route: '/admin/roles' },
        { label: 'Configuration', icon: 'pi pi-cog', route: '/admin/configuration' },
        { label: 'Mobile Usage', icon: 'pi pi-mobile', route: '/admin/mobile-usage' },
      ],
    },
  ];

  ngOnInit(): void {
    this.oidc.userData$.subscribe(({ userData }) => {
      if (userData) {
        this.userName.set(
          userData['name'] || userData['preferred_username'] || userData['email'] || 'User'
        );
        // Start polling for notifications once authenticated
        this.pollUnreadCount();
        this.pollTimer = setInterval(() => this.pollUnreadCount(), 30_000);
      }
    });

    // Close panel when clicking outside
    this.clickListener = (e: Event) => {
      const target = e.target as HTMLElement;
      if (this.notifPanelOpen() && !target.closest('.relative')) {
        this.notifPanelOpen.set(false);
      }
    };
    document.addEventListener('click', this.clickListener);
  }

  ngOnDestroy(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.clickListener) document.removeEventListener('click', this.clickListener);
  }

  private pollUnreadCount(): void {
    this.http.get<{ data: { unreadCount: number } }>(`${environment.apiBaseUrl}/notifications/unread-count`)
      .subscribe({
        next: (r) => this.unreadCount.set(r.data.unreadCount),
      });
  }

  private loadNotifications(): void {
    this.http.get<{ data: Notification[]; meta: { unreadCount: number } }>(`${environment.apiBaseUrl}/notifications?limit=20`)
      .subscribe({
        next: (r) => {
          this.notifications.set(r.data);
          this.unreadCount.set(r.meta.unreadCount);
        },
      });
  }

  toggleNotifications(event: Event): void {
    event.stopPropagation();
    const opening = !this.notifPanelOpen();
    this.notifPanelOpen.set(opening);
    if (opening) {
      this.loadNotifications();
    }
  }

  markAllRead(): void {
    this.http.post(`${environment.apiBaseUrl}/notifications/read-all`, {}).subscribe({
      next: () => {
        this.unreadCount.set(0);
        this.notifications.update((list) => list.map((n) => ({ ...n, isRead: true })));
      },
    });
  }

  onNotificationClick(n: Notification): void {
    // Mark as read
    if (!n.isRead) {
      this.http.patch(`${environment.apiBaseUrl}/notifications/${n.id}/read`, {}).subscribe({
        next: () => {
          this.notifications.update((list) =>
            list.map((item) => item.id === n.id ? { ...item, isRead: true } : item)
          );
          this.unreadCount.update((c) => Math.max(0, c - 1));
        },
      });
    }
    // Navigate if actionUrl exists
    if (n.actionUrl) {
      this.notifPanelOpen.set(false);
      this.router.navigateByUrl(n.actionUrl);
    }
  }

  getNotifIcon(category: string): string {
    switch (category) {
      case 'TRAVEL': return 'pi pi-car';
      case 'ACTIVITY': return 'pi pi-calendar';
      case 'PROJECT': return 'pi pi-folder';
      case 'EXPENSE': return 'pi pi-wallet';
      case 'SYSTEM': return 'pi pi-cog';
      default: return 'pi pi-bell';
    }
  }

  formatNotifTime(iso: string): string {
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

  toggleGroup(group: NavGroup): void {
    const opening = !group.expanded;
    // Collapse all groups first
    for (const item of this.navItems) {
      if (isGroup(item)) item.expanded = false;
    }
    // Open the clicked one if it was closed
    if (opening) group.expanded = true;
  }

  logout(): void {
    this.oidc.logoff().subscribe();
  }
}
