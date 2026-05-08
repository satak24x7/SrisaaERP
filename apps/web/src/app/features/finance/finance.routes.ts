import { Routes } from '@angular/router';

export const FINANCE_ROUTES: Routes = [
  { path: '', redirectTo: 'travel-expenses', pathMatch: 'full' },
  {
    path: 'travel-expenses',
    loadComponent: () =>
      import('./travel-expenses.component').then((m) => m.TravelExpensesComponent),
  },
  {
    path: 'gst-statement',
    loadComponent: () =>
      import('./gst-statement.component').then((m) => m.GstStatementComponent),
  },
  {
    path: 'expenditure-report',
    loadComponent: () =>
      import('./expenditure-report.component').then((m) => m.ExpenditureReportComponent),
  },
  {
    path: 'expense-advances',
    loadComponent: () =>
      import('./expense-finance.component').then((m) => m.ExpenseFinanceComponent),
  },
];
