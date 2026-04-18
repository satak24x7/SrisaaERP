import { Routes } from '@angular/router';

export const ADMIN_ROUTES: Routes = [
  { path: '', redirectTo: 'business-units', pathMatch: 'full' },
  {
    path: 'business-units',
    loadComponent: () =>
      import('../organization/bu-list.component').then((m) => m.BuListComponent),
  },
  {
    path: 'company-profile',
    loadComponent: () =>
      import('./company-profile.component').then((m) => m.CompanyProfileComponent),
  },
  {
    path: 'statutory-registrations',
    loadComponent: () =>
      import('./statutory-registrations.component').then((m) => m.StatutoryRegistrationsComponent),
  },
  {
    path: 'users',
    loadComponent: () =>
      import('./users.component').then((m) => m.UsersComponent),
  },
  {
    path: 'roles',
    loadComponent: () =>
      import('./roles.component').then((m) => m.RolesComponent),
  },
  {
    path: 'lookup-lists',
    loadComponent: () =>
      import('./lookup-lists.component').then((m) => m.LookupListsComponent),
  },
  {
    path: 'governments',
    loadComponent: () =>
      import('./governments.component').then((m) => m.GovernmentsComponent),
  },
  {
    path: 'configuration',
    loadComponent: () =>
      import('./configuration.component').then((m) => m.ConfigurationComponent),
  },
];
