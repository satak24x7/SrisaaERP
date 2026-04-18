import { Routes } from '@angular/router';

export const ACTIVITIES_ROUTES: Routes = [
  { path: '', redirectTo: 'calendar', pathMatch: 'full' },
  {
    path: 'calendar',
    loadComponent: () =>
      import('./activity-calendar.component').then((m) => m.ActivityCalendarComponent),
  },
  {
    path: 'activities',
    loadComponent: () =>
      import('./activity-list.component').then((m) => m.ActivityListComponent),
  },
  {
    path: 'travels',
    loadComponent: () =>
      import('./travel-list.component').then((m) => m.TravelListComponent),
  },
  {
    path: 'travels/new',
    loadComponent: () =>
      import('./travel-detail.component').then((m) => m.TravelDetailComponent),
  },
  {
    path: 'travels/:id',
    loadComponent: () =>
      import('./travel-detail.component').then((m) => m.TravelDetailComponent),
  },
  {
    path: 'passwords',
    loadComponent: () =>
      import('./password-manager.component').then((m) => m.PasswordManagerComponent),
  },
];
