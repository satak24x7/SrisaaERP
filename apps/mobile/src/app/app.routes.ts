import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { LoginPage } from './core/auth/login.page';

export const routes: Routes = [
  { path: '', redirectTo: 'tabs', pathMatch: 'full' },
  { path: 'login', component: LoginPage },
  {
    path: 'tabs',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./tabs/tabs.component').then((m) => m.TabsComponent),
    children: [
      { path: '', redirectTo: 'activities', pathMatch: 'full' },
      {
        path: 'activities',
        loadChildren: () =>
          import('./features/activities/activities.routes').then(
            (m) => m.activitiesRoutes
          ),
      },
      {
        path: 'calendar',
        loadComponent: () =>
          import('./features/calendar/calendar.page').then(
            (m) => m.CalendarPage
          ),
      },
      {
        path: 'travels',
        loadChildren: () =>
          import('./features/travels/travels.routes').then(
            (m) => m.travelsRoutes
          ),
      },
      {
        path: 'notifications',
        loadComponent: () =>
          import('./features/notifications/notifications.page').then(
            (m) => m.NotificationsPage
          ),
      },
    ],
  },
];
