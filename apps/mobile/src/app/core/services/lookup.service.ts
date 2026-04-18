import { Injectable, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import { tap } from 'rxjs/operators';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class LookupService {
  private readonly api = inject(ApiService);

  readonly users = signal<unknown[]>([]);
  readonly contacts = signal<unknown[]>([]);
  readonly categoryOptions = signal<unknown[]>([]);
  readonly businessUnits = signal<unknown[]>([]);

  loadAll() {
    return forkJoin({
      users: this.api.get<{ data: unknown[] }>('/users', { limit: 200 }),
      contacts: this.api.get<{ data: unknown[] }>('/contacts', { limit: 200 }),
      categories: this.api.get<{ data: unknown[] }>(
        '/lookup-lists/by-code/activity_category/items'
      ),
      businessUnits: this.api.get<{ data: unknown[] }>('/business-units', { limit: 200 }),
    }).pipe(
      tap(({ users, contacts, categories, businessUnits }) => {
        this.users.set(users.data ?? []);
        this.contacts.set(contacts.data ?? []);
        this.categoryOptions.set(categories.data ?? []);
        this.businessUnits.set(businessUnits.data ?? []);
      })
    );
  }
}
