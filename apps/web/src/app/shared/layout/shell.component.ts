import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { OidcSecurityService } from 'angular-auth-oidc-client';

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
export class ShellComponent implements OnInit {
  private readonly oidc = inject(OidcSecurityService);
  userName = signal('');

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
      expanded: true,
      children: [
        { label: 'All Projects', icon: 'pi pi-list', route: '/projects' },
      ],
    },
    { label: 'Expenses', icon: 'pi pi-wallet', route: '/expenses' },
    { label: 'Procurement', icon: 'pi pi-truck', route: '/procurement' },
    { label: 'Administration', icon: 'pi pi-sitemap', route: '/administration' },
    {
      label: 'System',
      icon: 'pi pi-cog',
      expanded: true,
      children: [
        { label: 'Company Profile', icon: 'pi pi-briefcase', route: '/admin/company-profile' },
        { label: 'Statutory Registrations', icon: 'pi pi-id-card', route: '/admin/statutory-registrations' },
        { label: 'Business Units', icon: 'pi pi-building', route: '/admin/business-units' },
        { label: 'Lookup Lists', icon: 'pi pi-list', route: '/admin/lookup-lists' },
        { label: 'Governments', icon: 'pi pi-globe', route: '/admin/governments' },
        { label: 'Users', icon: 'pi pi-users', route: '/admin/users' },
        { label: 'Roles', icon: 'pi pi-shield', route: '/admin/roles' },
        { label: 'Configuration', icon: 'pi pi-cog', route: '/admin/configuration' },
      ],
    },
  ];

  ngOnInit(): void {
    this.oidc.userData$.subscribe(({ userData }) => {
      if (userData) {
        this.userName.set(
          userData['name'] || userData['preferred_username'] || userData['email'] || 'User'
        );
      }
    });
  }

  toggleGroup(group: NavGroup): void {
    group.expanded = !group.expanded;
  }

  logout(): void {
    this.oidc.logoff().subscribe();
  }
}
