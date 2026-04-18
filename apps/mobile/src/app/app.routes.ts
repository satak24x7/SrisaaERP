import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { CallbackComponent } from './core/auth/callback.component';

export const routes: Routes = [
  { path: '', redirectTo: 'tabs', pathMatch: 'full' },
  { path: 'callback', component: CallbackComponent },
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
    ],
  },
];
