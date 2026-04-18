import { Routes } from '@angular/router';

export const ORGANIZATION_ROUTES: Routes = [
  { path: '', redirectTo: 'business-units', pathMatch: 'full' },
  {
    path: 'business-units',
    loadComponent: () =>
      import('./bu-list.component').then((m) => m.BuListComponent),
  },
];
