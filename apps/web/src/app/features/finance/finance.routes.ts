import { Routes } from '@angular/router';

export const FINANCE_ROUTES: Routes = [
  { path: '', redirectTo: 'travel-expenses', pathMatch: 'full' },
  {
    path: 'travel-expenses',
    loadComponent: () =>
      import('./travel-expenses.component').then((m) => m.TravelExpensesComponent),
  },
];
