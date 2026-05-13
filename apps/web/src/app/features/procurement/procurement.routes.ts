import { Routes } from '@angular/router';

export const PROCUREMENT_ROUTES: Routes = [
  { path: '', redirectTo: 'purchase-orders', pathMatch: 'full' },
  {
    path: 'material-requests',
    loadComponent: () =>
      import('./mr-list.component').then((m) => m.MrListComponent),
  },
  {
    path: 'material-requests/new',
    loadComponent: () =>
      import('./mr-detail.component').then((m) => m.MrDetailComponent),
  },
  {
    path: 'material-requests/:id',
    loadComponent: () =>
      import('./mr-detail.component').then((m) => m.MrDetailComponent),
  },
  {
    path: 'vendors',
    loadComponent: () =>
      import('./vendor-list.component').then((m) => m.VendorListComponent),
  },
  {
    path: 'vendors/:id',
    loadComponent: () =>
      import('./vendor-detail.component').then((m) => m.VendorDetailComponent),
  },
  {
    path: 'items',
    loadComponent: () =>
      import('./item-list.component').then((m) => m.ItemListComponent),
  },
  {
    path: 'price-lists',
    loadComponent: () =>
      import('./price-list-list.component').then((m) => m.PriceListListComponent),
  },
  {
    path: 'oem-catalog',
    loadComponent: () =>
      import('./oem-catalog-list.component').then((m) => m.OemCatalogListComponent),
  },
  {
    path: 'quotations',
    loadComponent: () =>
      import('./quotation-list.component').then((m) => m.QuotationListComponent),
  },
  {
    path: 'quotations/:id',
    loadComponent: () =>
      import('./quotation-detail.component').then((m) => m.QuotationDetailComponent),
  },
  {
    path: 'rate-comparisons',
    loadComponent: () =>
      import('./rate-comparison-list.component').then((m) => m.RateComparisonListComponent),
  },
  {
    path: 'rate-comparisons/:id',
    loadComponent: () =>
      import('./rate-comparison-detail.component').then((m) => m.RateComparisonDetailComponent),
  },
  {
    path: 'purchase-orders',
    loadComponent: () =>
      import('./po-list.component').then((m) => m.PoListComponent),
  },
  {
    path: 'purchase-orders/new',
    loadComponent: () =>
      import('./po-detail.component').then((m) => m.PoDetailComponent),
  },
  {
    path: 'purchase-orders/:id',
    loadComponent: () =>
      import('./po-detail.component').then((m) => m.PoDetailComponent),
  },
  {
    path: 'grns',
    loadComponent: () =>
      import('./grn-list.component').then((m) => m.GrnListComponent),
  },
  {
    path: 'grns/new',
    loadComponent: () =>
      import('./grn-detail.component').then((m) => m.GrnDetailComponent),
  },
  {
    path: 'grns/:id',
    loadComponent: () =>
      import('./grn-detail.component').then((m) => m.GrnDetailComponent),
  },
  {
    path: 'invoices',
    loadComponent: () =>
      import('./invoice-list.component').then((m) => m.InvoiceListComponent),
  },
  {
    path: 'invoices/new',
    loadComponent: () =>
      import('./invoice-detail.component').then((m) => m.InvoiceDetailComponent),
  },
  {
    path: 'invoices/:id',
    loadComponent: () =>
      import('./invoice-detail.component').then((m) => m.InvoiceDetailComponent),
  },
];
