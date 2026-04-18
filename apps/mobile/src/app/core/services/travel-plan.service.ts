import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export interface TravelPlanListParams {
  status?: string;
  mine?: boolean;
  limit?: number;
  cursor?: string;
}

@Injectable({ providedIn: 'root' })
export class TravelPlanService {
  private readonly api = inject(ApiService);
  private readonly basePath = '/travel-plans';

  /* ── Plan CRUD ── */

  list(params?: TravelPlanListParams): Observable<unknown> {
    return this.api.get(this.basePath, params as Record<string, string | number | boolean | undefined>);
  }

  getById(id: string): Observable<unknown> {
    return this.api.get(`${this.basePath}/${id}`);
  }

  create(body: unknown): Observable<unknown> {
    return this.api.post(this.basePath, body);
  }

  update(id: string, body: unknown): Observable<unknown> {
    return this.api.patch(`${this.basePath}/${id}`, body);
  }

  delete(id: string): Observable<unknown> {
    return this.api.delete(`${this.basePath}/${id}`);
  }

  /* ── Workflow transitions ── */

  transition(id: string, action: 'submit' | 'approve' | 'reject' | 'complete'): Observable<unknown> {
    return this.api.post(`${this.basePath}/${id}/${action}`, {});
  }

  /* ── Tickets ── */

  addTicket(planId: string, body: unknown): Observable<unknown> {
    return this.api.post(`${this.basePath}/${planId}/tickets`, body);
  }

  updateTicket(planId: string, ticketId: string, body: unknown): Observable<unknown> {
    return this.api.patch(`${this.basePath}/${planId}/tickets/${ticketId}`, body);
  }

  deleteTicket(planId: string, ticketId: string): Observable<unknown> {
    return this.api.delete(`${this.basePath}/${planId}/tickets/${ticketId}`);
  }

  /* ── Hotels ── */

  addHotel(planId: string, body: unknown): Observable<unknown> {
    return this.api.post(`${this.basePath}/${planId}/hotels`, body);
  }

  updateHotel(planId: string, hotelId: string, body: unknown): Observable<unknown> {
    return this.api.patch(`${this.basePath}/${planId}/hotels/${hotelId}`, body);
  }

  deleteHotel(planId: string, hotelId: string): Observable<unknown> {
    return this.api.delete(`${this.basePath}/${planId}/hotels/${hotelId}`);
  }

  /* ── Expenses ── */

  addExpense(planId: string, body: unknown): Observable<unknown> {
    return this.api.post(`${this.basePath}/${planId}/expenses`, body);
  }

  updateExpense(planId: string, expenseId: string, body: unknown): Observable<unknown> {
    return this.api.patch(`${this.basePath}/${planId}/expenses/${expenseId}`, body);
  }

  deleteExpense(planId: string, expenseId: string): Observable<unknown> {
    return this.api.delete(`${this.basePath}/${planId}/expenses/${expenseId}`);
  }
}
