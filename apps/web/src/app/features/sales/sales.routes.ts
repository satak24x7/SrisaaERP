import { Routes } from '@angular/router';

export const SALES_ROUTES: Routes = [
  { path: '', redirectTo: 'pipeline', pathMatch: 'full' },
  {
    path: 'pipeline',
    loadComponent: () =>
      import('./pipeline-dashboard.component').then((m) => m.PipelineDashboardComponent),
  },
  {
    path: 'accounts',
    loadComponent: () =>
      import('./account-list.component').then((m) => m.AccountListComponent),
  },
  {
    path: 'contacts',
    loadComponent: () =>
      import('./contact-list.component').then((m) => m.ContactListComponent),
  },
  {
    path: 'leads',
    loadComponent: () =>
      import('./lead-list.component').then((m) => m.LeadListComponent),
  },
  {
    path: 'influencers',
    loadComponent: () =>
      import('./influencer-list.component').then((m) => m.InfluencerListComponent),
  },
  {
    path: 'opportunities',
    loadComponent: () =>
      import('./opportunity-list.component').then((m) => m.OpportunityListComponent),
  },
  {
    path: 'opportunities/:id',
    loadComponent: () =>
      import('./opportunity-detail.component').then((m) => m.OpportunityDetailComponent),
  },
];
