import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export interface ActivityListParams {
  mine?: boolean;
  tab?: string;
  activityType?: string;
  categoryCode?: string;
  limit?: number;
  cursor?: string;
}

@Injectable({ providedIn: 'root' })
export class ActivityService {
  private readonly api = inject(ApiService);

  list(params?: ActivityListParams): Observable<unknown> {
    return this.api.get('/activities', params as Record<string, string | number | boolean | undefined>);
  }

  getById(id: string): Observable<unknown> {
    return this.api.get(`/activities/${id}`);
  }

  create(body: unknown): Observable<unknown> {
    return this.api.post('/activities', body);
  }

  update(id: string, body: unknown): Observable<unknown> {
    return this.api.patch(`/activities/${id}`, body);
  }

  delete(id: string): Observable<unknown> {
    return this.api.delete(`/activities/${id}`);
  }

  calendarEvents(start: string, end: string, mine?: boolean): Observable<unknown> {
    return this.api.get('/activities/calendar', { start, end, mine });
  }
}
