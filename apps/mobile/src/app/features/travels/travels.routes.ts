import { Routes } from '@angular/router';
import { TravelListPage } from './travel-list.page';
import { TravelDetailPage } from './travel-detail.page';
import { TravelFormPage } from './travel-form.page';

export const travelsRoutes: Routes = [
  { path: '', component: TravelListPage },
  { path: 'new', component: TravelFormPage },
  { path: ':id', component: TravelDetailPage },
  { path: ':id/edit', component: TravelFormPage },
];
