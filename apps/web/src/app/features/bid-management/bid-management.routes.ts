import { Routes } from '@angular/router';

export const BID_MANAGEMENT_ROUTES: Routes = [
  { path: '', redirectTo: 'tenders', pathMatch: 'full' },
  {
    path: 'tenders',
    loadComponent: () =>
      import('./tender-list.component').then((m) => m.TenderListComponent),
  },
  {
    path: 'tenders/:id',
    loadComponent: () =>
      import('./tender-detail.component').then((m) => m.TenderDetailComponent),
  },
  {
    path: 'tenders/:id/cash-flow-plan',
    loadComponent: () =>
      import('./tender-cashflow.component').then((m) => m.TenderCashflowComponent),
  },
];
