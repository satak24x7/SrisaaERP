import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { ShellComponent } from './shared/layout/shell.component';
import { PlaceholderComponent } from './features/admin/placeholder.component';

export const routes: Routes = [
  {
    path: '',
    canActivate: [authGuard],
    component: ShellComponent,
    children: [
      { path: '', redirectTo: 'work-area/calendar', pathMatch: 'full' },
      {
        path: 'admin',
        loadChildren: () =>
          import('./features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
      },
      {
        path: 'dashboard',
        component: PlaceholderComponent,
        data: { title: 'Dashboard', icon: 'pi pi-home' },
      },
      {
        path: 'sales',
        loadChildren: () =>
          import('./features/sales/sales.routes').then((m) => m.SALES_ROUTES),
      },
      {
        path: 'work-area',
        loadChildren: () =>
          import('./features/activities/activities.routes').then((m) => m.ACTIVITIES_ROUTES),
      },
      {
        path: 'administration',
        component: PlaceholderComponent,
        data: { title: 'Administration', icon: 'pi pi-sitemap' },
      },
      {
        path: 'projects',
        loadChildren: () =>
          import('./features/projects/projects.routes').then((m) => m.PROJECTS_ROUTES),
      },
      {
        path: 'expenses',
        component: PlaceholderComponent,
        data: { title: 'Expenses', icon: 'pi pi-wallet' },
      },
      {
        path: 'procurement',
        component: PlaceholderComponent,
        data: { title: 'Procurement', icon: 'pi pi-truck' },
      },
    ],
  },
  {
    path: 'callback',
    loadComponent: () =>
      import('./core/auth/callback.component').then((m) => m.CallbackComponent),
  },
];
