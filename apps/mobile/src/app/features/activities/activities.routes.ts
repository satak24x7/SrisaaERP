import { Routes } from '@angular/router';
import { ActivityListPage } from './activity-list.page';
import { ActivityDetailPage } from './activity-detail.page';
import { ActivityFormPage } from './activity-form.page';

export const activitiesRoutes: Routes = [
  { path: '', component: ActivityListPage },
  { path: 'new', component: ActivityFormPage },
  { path: ':id', component: ActivityDetailPage },
  { path: ':id/edit', component: ActivityFormPage },
];
