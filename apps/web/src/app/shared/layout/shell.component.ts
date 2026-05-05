import { Component, inject, OnInit, OnDestroy, signal, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { TooltipModule } from 'primeng/tooltip';
import { WebSocketService } from '../../core/services/websocket.service';
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
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, TooltipModule],
  template: `
    <div class="flex h-screen">
      <!-- Sidebar -->
      <aside
        class="bg-slate-800 text-white flex flex-col transition-all duration-300 ease-in-out shrink-0 relative"
        [class.w-64]="!sidebarCollapsed()"
        [class.w-16]="sidebarCollapsed()"
      >
        <!-- Brand header -->
        <div class="border-b border-slate-700 flex items-center gap-3 overflow-hidden"
             [class.px-4]="!sidebarCollapsed()" [class.py-4]="!sidebarCollapsed()"
             [class.px-2]="sidebarCollapsed()" [class.py-3]="sidebarCollapsed()"
             [class.justify-center]="sidebarCollapsed()">
          <img src="logo.png" alt="Srisaa" class="shrink-0" [class.h-9]="!sidebarCollapsed()" [class.h-8]="sidebarCollapsed()" />
          @if (!sidebarCollapsed()) {
            <div class="min-w-0">
              <h1 class="text-lg font-bold tracking-tight leading-tight">SrisaaERP</h1>
            </div>
          }
        </div>

        <!-- Nav -->
        <nav class="flex-1 overflow-y-auto overflow-x-hidden"
             [class.p-3]="!sidebarCollapsed()" [class.p-1]="sidebarCollapsed()"
             [class.space-y-1]="!sidebarCollapsed()" [class.space-y-0.5]="sidebarCollapsed()">
          @for (item of navItems; track item.label) {
            @if (isGroup(item)) {
              <div class="relative">
                @if (sidebarCollapsed()) {
                  <!-- Collapsed: show group icon, click opens flyout -->
                  <button
                    data-flyout-area
                    (click)="toggleFlyout($event, item)"
                    class="w-full flex items-center justify-center px-2 py-2 rounded-md text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                    [class.bg-slate-700]="flyoutGroup() === item"
                    [class.text-white]="flyoutGroup() === item"
                  >
                    <i [class]="item.icon + ' text-lg'"></i>
                  </button>
                } @else {
                  <!-- Expanded: normal collapsible group -->
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
                }
              </div>
            } @else {
              <!-- Simple link -->
              @if (sidebarCollapsed()) {
                <a
                  [routerLink]="item.route"
                  routerLinkActive="bg-slate-700 text-white"
                  class="flex items-center justify-center px-2 py-2 rounded-md text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                  [pTooltip]="item.label" tooltipPosition="right"
                >
                  <i [class]="item.icon + ' text-lg'"></i>
                </a>
              } @else {
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
          }
        </nav>

        <!-- Flyout popup for collapsed groups -->
        @if (flyoutGroup()) {
          <div
            data-flyout-area
            class="fixed z-[60] w-52 bg-slate-700 rounded-lg shadow-xl border border-slate-600 py-1 overflow-hidden"
            [style.top.px]="flyoutTop()"
            [style.left.px]="flyoutLeft()"
          >
            <div class="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-600">
              {{ flyoutGroup()!.label }}
            </div>
            @for (child of flyoutGroup()!.children; track child.route) {
              <a
                [routerLink]="child.route"
                routerLinkActive="bg-slate-600 text-white"
                (click)="closeFlyout()"
                class="flex items-center gap-3 px-3 py-2 text-sm text-slate-300 hover:bg-slate-600 hover:text-white transition-colors"
              >
                <i [class]="child.icon + ' text-xs'"></i>
                {{ child.label }}
              </a>
            }
          </div>
        }

        <!-- Bottom section: notifications, user, collapse toggle -->
        <div class="border-t border-slate-700">
          <!-- Notification bell -->
          <div class="relative" data-notif-area
               [class.px-3]="!sidebarCollapsed()" [class.px-2]="sidebarCollapsed()"
               [class.py-2]="true">
            @if (sidebarCollapsed()) {
              <button (click)="toggleNotifications($event)"
                      class="w-full flex items-center justify-center p-2 rounded-md text-slate-300 hover:bg-slate-700 hover:text-white transition-colors relative"
                      pTooltip="Notifications" tooltipPosition="right">
                <i class="pi pi-bell text-lg"></i>
                @if (unreadCount() > 0) {
                  <span class="absolute top-0.5 right-1 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-0.5">
                    {{ unreadCount() > 99 ? '99+' : unreadCount() }}
                  </span>
                }
              </button>
            } @else {
              <button (click)="toggleNotifications($event)"
                      class="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors relative">
                <i class="pi pi-bell"></i>
                <span>Notifications</span>
                @if (unreadCount() > 0) {
                  <span class="ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[20px] h-[20px] flex items-center justify-center px-1">
                    {{ unreadCount() > 99 ? '99+' : unreadCount() }}
                  </span>
                }
              </button>
            }

            <!-- Notification panel (positioned to the right of sidebar) -->
            @if (notifPanelOpen()) {
              <div class="fixed z-[60] w-96 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden"
                   [style.bottom.px]="80"
                   [style.left.px]="sidebarCollapsed() ? 68 : 260">
                <div class="flex items-center justify-between px-4 py-3 bg-gray-50 border-b">
                  <span class="font-semibold text-sm text-gray-700">Unread Notifications</span>
                  @if (unreadCount() > 0) {
                    <button (click)="markAllRead()" class="text-xs text-blue-600 hover:text-blue-800 font-medium">
                      Mark all read
                    </button>
                  }
                </div>
                <div class="max-h-80 overflow-y-auto">
                  @if (notifications().length === 0) {
                    <div class="py-10 text-center text-gray-400 text-sm">
                      <i class="pi pi-check-circle text-2xl mb-2 block"></i>
                      All caught up!
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
                <div class="px-4 py-2 bg-gray-50 border-t text-center">
                  <a routerLink="/admin/notifications" (click)="notifPanelOpen.set(false)" class="text-xs text-blue-600 hover:text-blue-800 font-medium">View all notifications</a>
                </div>
              </div>
            }
          </div>

          <!-- User info + logout -->
          <div [class.px-3]="!sidebarCollapsed()" [class.px-2]="sidebarCollapsed()" [class.py-2]="true">
            @if (sidebarCollapsed()) {
              <button
                (click)="logout()"
                class="w-full flex items-center justify-center p-2 rounded-md text-slate-300 hover:bg-red-700 hover:text-white transition-colors"
                pTooltip="Logout" tooltipPosition="right"
              >
                <i class="pi pi-sign-out text-lg"></i>
              </button>
            } @else {
              <div class="flex items-center gap-2 px-3 py-2">
                <div class="w-7 h-7 rounded-full bg-slate-600 flex items-center justify-center text-xs font-bold shrink-0">
                  {{ userInitials() }}
                </div>
                <span class="text-sm text-slate-300 truncate flex-1">{{ userName() }}</span>
                <button
                  (click)="logout()"
                  class="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-slate-700 transition-colors"
                  pTooltip="Logout" tooltipPosition="top"
                >
                  <i class="pi pi-sign-out text-sm"></i>
                </button>
              </div>
            }
          </div>

          <!-- Collapse toggle -->
          <div class="border-t border-slate-700 flex items-center"
               [class.px-3]="!sidebarCollapsed()" [class.px-2]="sidebarCollapsed()"
               [class.py-2]="true"
               [class.justify-between]="!sidebarCollapsed()" [class.justify-center]="sidebarCollapsed()">
            @if (!sidebarCollapsed()) {
              <span class="text-xs text-slate-500">v0.0.1</span>
            }
            <button
              (click)="toggleSidebar()"
              class="p-1.5 rounded-md text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
              [pTooltip]="sidebarCollapsed() ? 'Expand menu' : 'Collapse menu'" tooltipPosition="right"
            >
              <i class="pi" [class.pi-angle-right]="sidebarCollapsed()" [class.pi-angle-left]="!sidebarCollapsed()"></i>
            </button>
          </div>
        </div>
      </aside>

      <!-- Main -->
      <div class="flex-1 flex flex-col overflow-hidden">
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
  private readonly el = inject(ElementRef);
  private readonly wsService = inject(WebSocketService);
  private unsubWs: (() => void) | null = null;

  userName = signal('');
  userInitials = signal('');
  unreadCount = this.wsService.unreadCount; // bound to WS service signal
  notifications = signal<Notification[]>([]);
  notifPanelOpen = signal(false);
  sidebarCollapsed = signal(localStorage.getItem('sidebar_collapsed') === 'true');
  flyoutGroup = signal<NavGroup | null>(null);
  flyoutTop = signal(0);
  flyoutLeft = signal(0);

  isGroup = isGroup;

  navItems: NavItem[] = [
    {
      label: 'Work Area',
      icon: 'pi pi-briefcase',
      expanded: true,
      children: [
        { label: 'Message Center', icon: 'pi pi-envelope', route: '/mail/inbox' },
        { label: 'Calendar', icon: 'pi pi-calendar', route: '/work-area/calendar' },
        { label: 'Activities', icon: 'pi pi-list', route: '/work-area/activities' },
        { label: 'Travels', icon: 'pi pi-car', route: '/work-area/travels' },
        { label: 'Expenses', icon: 'pi pi-receipt', route: '/work-area/expense-sheets' },
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
        { label: 'Initiatives', icon: 'pi pi-flag', route: '/sales/initiatives' },
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
    {
      label: 'Finance',
      icon: 'pi pi-indian-rupee',
      expanded: false,
      children: [
        { label: 'Travel Expenses', icon: 'pi pi-car', route: '/finance/travel-expenses' },
      ],
    },
    { label: 'Documents', icon: 'pi pi-folder-open', route: '/documents' },
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
        { label: 'AI Rules', icon: 'pi pi-sparkles', route: '/admin/ai-rules' },
        { label: 'Configuration', icon: 'pi pi-cog', route: '/admin/configuration' },
        { label: 'Notifications', icon: 'pi pi-bell', route: '/admin/notifications' },
        { label: 'Mobile Usage', icon: 'pi pi-mobile', route: '/admin/mobile-usage' },
        { label: 'Mail Settings', icon: 'pi pi-envelope', route: '/mail/settings' },
      ],
    },
  ];

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    const target = event.target as HTMLElement;
    // Close notification panel if clicking outside
    if (this.notifPanelOpen() && !target.closest('[data-notif-area]')) {
      this.notifPanelOpen.set(false);
    }
    // Close flyout if clicking outside
    if (this.flyoutGroup() && !target.closest('[data-flyout-area]')) {
      this.flyoutGroup.set(null);
    }
  }

  ngOnInit(): void {
    this.oidc.userData$.subscribe(({ userData }) => {
      if (userData) {
        const name = userData['name'] || userData['preferred_username'] || userData['email'] || 'User';
        this.userName.set(name);
        const parts = name.split(' ');
        this.userInitials.set(
          parts.length >= 2
            ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
            : name.substring(0, 2).toUpperCase()
        );
        // Connect WebSocket for real-time notifications
        this.wsService.connect();
      }
    });
  }

  ngOnDestroy(): void {
    if (this.unsubWs) this.unsubWs();
    this.wsService.disconnect();
  }

  private loadNotifications(): void {
    this.http.get<{ data: Notification[]; meta: { unreadCount: number } }>(`${environment.apiBaseUrl}/notifications?limit=20&unreadOnly=true`)
      .subscribe({
        next: (r) => {
          this.notifications.set(r.data);
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
        this.notifications.set([]);
      },
    });
  }

  onNotificationClick(n: Notification): void {
    if (!n.isRead) {
      this.http.patch(`${environment.apiBaseUrl}/notifications/${n.id}/read`, {}).subscribe({
        next: () => {
          // Remove from unread list
          this.notifications.update((list) => list.filter((item) => item.id !== n.id));
        },
      });
    }
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

  toggleSidebar(): void {
    const collapsed = !this.sidebarCollapsed();
    this.sidebarCollapsed.set(collapsed);
    localStorage.setItem('sidebar_collapsed', String(collapsed));
    if (collapsed) {
      for (const item of this.navItems) {
        if (isGroup(item)) item.expanded = false;
      }
      this.flyoutGroup.set(null);
    }
  }

  toggleFlyout(event: Event, group: NavGroup): void {
    event.stopPropagation();
    if (this.flyoutGroup() === group) {
      this.flyoutGroup.set(null);
      return;
    }
    const btn = (event.currentTarget as HTMLElement);
    const rect = btn.getBoundingClientRect();
    this.flyoutTop.set(rect.top);
    this.flyoutLeft.set(rect.right + 4);
    this.flyoutGroup.set(group);
  }

  closeFlyout(): void {
    this.flyoutGroup.set(null);
  }

  toggleGroup(group: NavGroup): void {
    const opening = !group.expanded;
    for (const item of this.navItems) {
      if (isGroup(item)) item.expanded = false;
    }
    if (opening) group.expanded = true;
  }

  logout(): void {
    this.oidc.logoff().subscribe();
  }
}
