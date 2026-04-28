import { Routes } from '@angular/router';

export const MAIL_ROUTES: Routes = [
  { path: '', redirectTo: 'inbox', pathMatch: 'full' },
  {
    path: 'inbox',
    loadComponent: () =>
      import('./mail-inbox.component').then((m) => m.MailInboxComponent),
  },
  {
    path: 'message/:id',
    loadComponent: () =>
      import('./mail-reader.component').then((m) => m.MailReaderComponent),
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./mail-settings.component').then((m) => m.MailSettingsComponent),
  },
];
