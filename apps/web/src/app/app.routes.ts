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
        path: 'bid-management',
        loadChildren: () =>
          import('./features/bid-management/bid-management.routes').then((m) => m.BID_MANAGEMENT_ROUTES),
      },
      {
        path: 'mail',
        loadChildren: () =>
          import('./features/mail/mail.routes').then((m) => m.MAIL_ROUTES),
      },
      {
        path: 'documents',
        loadChildren: () =>
          import('./features/documents/documents.routes').then((m) => m.documentRoutes),
      },
      {
        path: 'finance',
        loadChildren: () =>
          import('./features/finance/finance.routes').then((m) => m.FINANCE_ROUTES),
      },
      {
        path: 'expenses',
        component: PlaceholderComponent,
        data: { title: 'Expenses', icon: 'pi pi-wallet' },
      },
      {
        path: 'procurement',
        loadChildren: () =>
          import('./features/procurement/procurement.routes').then((m) => m.PROCUREMENT_ROUTES),
      },
      {
        path: 'approvals',
        loadComponent: () =>
          import('./features/approvals/approval-inbox.component').then((m) => m.ApprovalInboxComponent),
      },
    ],
  },
  {
    path: 'procurement/purchase-orders/:id/print',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/procurement/po-print.component').then((m) => m.PoPrintComponent),
  },
  {
    path: 'callback',
    loadComponent: () =>
      import('./core/auth/callback.component').then((m) => m.CallbackComponent),
  },
  {
    path: 'mail/oauth/callback',
    loadComponent: () =>
      import('./features/mail/mail-oauth-callback.component').then((m) => m.MailOAuthCallbackComponent),
  },
];
