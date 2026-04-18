import { Routes } from '@angular/router';

export const PROJECTS_ROUTES: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'dashboard', loadComponent: () => import('./project-dashboard.component').then(m => m.ProjectDashboardComponent) },
  { path: 'kanban', loadComponent: () => import('./project-kanban.component').then(m => m.ProjectKanbanComponent) },
  { path: 'cash-flow', loadComponent: () => import('./project-cashflow.component').then(m => m.ProjectCashflowComponent) },
  { path: 'list', loadComponent: () => import('./project-list.component').then(m => m.ProjectListComponent) },
  { path: 'new', loadComponent: () => import('./project-detail.component').then(m => m.ProjectDetailComponent) },
  { path: ':id', loadComponent: () => import('./project-detail.component').then(m => m.ProjectDetailComponent) },
];
