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
];
