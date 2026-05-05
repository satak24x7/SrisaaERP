import type { Routes } from '@angular/router';

export const documentRoutes: Routes = [
  { path: '', loadComponent: () => import('./document-browser.component').then((m) => m.DocumentBrowserComponent) },
];
