import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router as NgRouter } from '@angular/router';
import { ReactiveFormsModule, FormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { InputNumberModule } from 'primeng/inputnumber';
import { DatePickerModule } from 'primeng/datepicker';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';

interface Initiative {
  id: string; title: string; description: string | null; status: string;
  targetValuePaise: number | null; startDate: string | null; endDate: string | null;
  businessUnitId: string; businessUnitName: string | null;
  ownerUserId: string; ownerName: string | null;
  accountCount: number; leadCount: number; opportunityCount: number;
  createdAt: string;
}
interface SelectOption { id: string; name: string; }
interface UserOption { id: string; fullName: string; }

const STATUS_OPTIONS = [
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'On Hold', value: 'ON_HOLD' },
  { label: 'Completed', value: 'COMPLETED' },
  { label: 'Cancelled', value: 'CANCELLED' },
];

@Component({
  selector: 'app-initiative-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, TableModule, TagModule, ButtonModule, DialogModule, InputTextModule, TextareaModule, SelectModule, MultiSelectModule, InputNumberModule, DatePickerModule, ToastModule],
  providers: [MessageService],
  template: `
    <p-toast />
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-semibold text-gray-800">Initiatives</h2>
        <p class="text-sm text-gray-500 mt-1">Strategic business development initiatives</p>
      </div>
      <p-button label="Create Initiative" icon="pi pi-plus" (onClick)="openCreate()" />
    </div>

    <!-- Summary Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div class="text-sm text-gray-500">Total</div>
        <div class="text-2xl font-bold text-gray-800">{{ initiatives().length }}</div>
      </div>
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div class="text-sm text-gray-500">Active</div>
        <div class="text-2xl font-bold text-green-700">{{ countByStatus('ACTIVE') }}</div>
      </div>
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div class="text-sm text-gray-500">Completed</div>
        <div class="text-2xl font-bold text-blue-700">{{ countByStatus('COMPLETED') }}</div>
      </div>
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div class="text-sm text-gray-500">Total Target Value</div>
        <div class="text-2xl font-bold text-gray-800">{{ totalTargetValue() }}</div>
      </div>
    </div>

    <!-- Filters -->
    <div class="flex flex-wrap gap-3 mb-4">
      <input pInputText [(ngModel)]="searchQuery" placeholder="Search initiatives..." class="w-64" (input)="filterList()" />
      <p-select appendTo="body" [(ngModel)]="filterStatus" [options]="statusFilterOptions" optionLabel="label" optionValue="value" [showClear]="true" placeholder="Status" class="w-48" (onChange)="filterList()" />
      <p-select appendTo="body" [(ngModel)]="filterBuId" [options]="buOptions()" optionLabel="name" optionValue="id" [showClear]="true" [filter]="true" placeholder="Business Unit" class="w-56" (onChange)="filterList()" />
    </div>

    @if (loading()) {
      <div class="flex items-center gap-2 text-gray-500 py-12 justify-center"><i class="pi pi-spin pi-spinner text-2xl"></i> Loading...</div>
    } @else {
      <div class="bg-white rounded-lg shadow-sm border border-gray-200">
        <p-table [value]="filteredInitiatives()" styleClass="p-datatable-sm" [rowHover]="true">
          <ng-template pTemplate="header">
            <tr>
              <th class="font-semibold">Title</th>
              <th class="font-semibold">BU</th>
              <th class="font-semibold">Owner</th>
              <th class="font-semibold">Status</th>
              <th class="font-semibold">Target Value</th>
              <th class="font-semibold text-center">Accounts</th>
              <th class="font-semibold text-center">Leads</th>
              <th class="font-semibold text-center">Opportunities</th>
              <th class="font-semibold">Start</th>
              <th class="font-semibold">End</th>
              <th class="font-semibold" style="width:80px">Actions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-i>
            <tr class="cursor-pointer hover:bg-gray-50" (click)="openDetail(i)">
              <td><span class="font-medium text-blue-700">{{ i.title }}</span></td>
              <td><span class="text-sm">{{ i.businessUnitName || '—' }}</span></td>
              <td><span class="text-sm">{{ i.ownerName || '—' }}</span></td>
              <td><p-tag [value]="formatStatus(i.status)" [severity]="statusSeverity(i.status)" [style]="{'font-size':'0.7rem'}" /></td>
              <td><span class="text-sm">{{ i.targetValuePaise ? '₹' + (i.targetValuePaise / 100 | number:'1.0-0') : '—' }}</span></td>
              <td class="text-center"><span class="text-sm">{{ i.accountCount }}</span></td>
              <td class="text-center"><span class="text-sm">{{ i.leadCount }}</span></td>
              <td class="text-center"><span class="text-sm">{{ i.opportunityCount }}</span></td>
              <td><span class="text-sm">{{ i.startDate ? (i.startDate | date:'dd-MMM-yy') : '—' }}</span></td>
              <td><span class="text-sm">{{ i.endDate ? (i.endDate | date:'dd-MMM-yy') : '—' }}</span></td>
              <td><p-button icon="pi pi-eye" [rounded]="true" [text]="true" severity="info" size="small" (onClick)="openDetail(i); $event.stopPropagation()" /></td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td colspan="11" class="text-center py-8 text-gray-500">No initiatives yet. Create one to start tracking BD efforts.</td></tr>
          </ng-template>
        </p-table>
      </div>
    }

    <!-- Create Dialog -->
    <p-dialog header="Create Initiative" [(visible)]="formVisible" [modal]="true" [style]="{width:'650px'}">
      <form [formGroup]="form" class="flex flex-col gap-4 pt-2">
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Title *</label>
          <input pInputText formControlName="title" placeholder="e.g. Smart City Surveillance Program" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Description</label>
          <textarea pTextarea formControlName="description" [rows]="3" class="w-full" placeholder="Strategic objective and scope..."></textarea>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Business Unit *</label>
            <p-select appendTo="body" formControlName="businessUnitId" [options]="buOptions()" optionLabel="name" optionValue="id" [filter]="true" placeholder="Select BU" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Owner *</label>
            <p-select appendTo="body" formControlName="ownerUserId" [options]="userOptions()" optionLabel="fullName" optionValue="id" [filter]="true" placeholder="Select owner" class="w-full" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Status</label>
            <p-select appendTo="body" formControlName="status" [options]="statusOptions" optionLabel="label" optionValue="value" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Target Value (₹)</label>
            <p-inputNumber formControlName="targetValueRupees" mode="currency" currency="INR" locale="en-IN" class="w-full" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Start Date</label>
            <p-datepicker appendTo="body" formControlName="startDate" dateFormat="dd-M-yy" [showIcon]="true" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">End Date</label>
            <p-datepicker appendTo="body" formControlName="endDate" dateFormat="dd-M-yy" [showIcon]="true" class="w-full" />
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Accounts</label>
          <p-multiSelect appendTo="body" formControlName="accountIds" [options]="accountOptions()" optionLabel="name" optionValue="id" [filter]="true" placeholder="Link accounts..." class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Contacts</label>
          <p-multiSelect appendTo="body" formControlName="contactIds" [options]="contactOptions()" optionLabel="name" optionValue="id" [filter]="true" placeholder="Link contacts..." class="w-full" />
        </div>
        @if (serverError) { <div class="p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">{{ serverError }}</div> }
      </form>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="formVisible=false" />
        <p-button label="Create" [loading]="saving" [disabled]="form.invalid||saving" (onClick)="onSubmit()" />
      </ng-template>
    </p-dialog>
  `,
})
export class InitiativeListComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly msg = inject(MessageService);
  private readonly ngRouter = inject(NgRouter);

  initiatives = signal<Initiative[]>([]);
  filteredInitiatives = signal<Initiative[]>([]);
  buOptions = signal<SelectOption[]>([]);
  userOptions = signal<UserOption[]>([]);
  accountOptions = signal<SelectOption[]>([]);
  contactOptions = signal<Array<{ id: string; name: string }>>([]);
  loading = signal(true);
  formVisible = false;
  saving = false;
  serverError = '';

  searchQuery = '';
  filterStatus = '';
  filterBuId = '';

  statusOptions = STATUS_OPTIONS;
  statusFilterOptions = [{ label: 'All', value: '' }, ...STATUS_OPTIONS];

  form = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(255)]],
    description: [''],
    businessUnitId: ['', Validators.required],
    ownerUserId: ['', Validators.required],
    status: ['DRAFT'],
    targetValueRupees: [null as number | null],
    startDate: [null as Date | null],
    endDate: [null as Date | null],
    accountIds: [[] as string[]],
    contactIds: [[] as string[]],
  });

  ngOnInit(): void {
    this.load();
    this.loadBUs();
    this.loadUsers();
    this.loadAccounts();
    this.loadContacts();
  }

  load(): void {
    this.loading.set(true);
    this.http.get<{ data: Initiative[] }>(`${environment.apiBaseUrl}/initiatives?limit=200`).subscribe({
      next: (r) => { this.initiatives.set(r.data); this.filterList(); this.loading.set(false); },
      error: () => { this.loading.set(false); },
    });
  }

  private loadBUs(): void {
    this.http.get<{ data: SelectOption[] }>(`${environment.apiBaseUrl}/business-units?limit=200`).subscribe({ next: (r) => this.buOptions.set(r.data) });
  }

  private loadUsers(): void {
    this.http.get<{ data: UserOption[] }>(`${environment.apiBaseUrl}/users?limit=200`).subscribe({ next: (r) => this.userOptions.set(r.data) });
  }

  private loadAccounts(): void {
    this.http.get<{ data: SelectOption[] }>(`${environment.apiBaseUrl}/accounts?limit=200`).subscribe({ next: (r) => this.accountOptions.set(r.data) });
  }

  private loadContacts(): void {
    this.http.get<{ data: Array<{ id: string; firstName: string; lastName: string | null }> }>(`${environment.apiBaseUrl}/contacts?limit=200`).subscribe({
      next: (r) => this.contactOptions.set(r.data.map((c) => ({ id: c.id, name: `${c.firstName}${c.lastName ? ' ' + c.lastName : ''}` }))),
    });
  }

  filterList(): void {
    let list = this.initiatives();
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      list = list.filter((i) => i.title.toLowerCase().includes(q));
    }
    if (this.filterStatus) {
      list = list.filter((i) => i.status === this.filterStatus);
    }
    if (this.filterBuId) {
      list = list.filter((i) => i.businessUnitId === this.filterBuId);
    }
    this.filteredInitiatives.set(list);
  }

  countByStatus(status: string): number {
    return this.initiatives().filter((i) => i.status === status).length;
  }

  totalTargetValue(): string {
    const total = this.initiatives().reduce((sum, i) => sum + (i.targetValuePaise ?? 0), 0);
    if (total === 0) return '₹0';
    return '₹' + (total / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  }

  formatStatus(s: string): string { return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()); }
  statusSeverity(s: string): 'info' | 'success' | 'warn' | 'danger' | 'contrast' {
    switch (s) {
      case 'ACTIVE': return 'success';
      case 'ON_HOLD': return 'warn';
      case 'COMPLETED': return 'contrast';
      case 'CANCELLED': return 'danger';
      default: return 'info';
    }
  }

  openDetail(i: Initiative): void { this.ngRouter.navigate(['/sales/initiatives', i.id]); }

  openCreate(): void {
    this.form.reset({ status: 'DRAFT', accountIds: [], contactIds: [] });
    this.serverError = '';
    this.formVisible = true;
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    this.saving = true;
    this.serverError = '';
    const v = this.form.value;
    const body: Record<string, unknown> = {
      title: v.title,
      description: v.description || null,
      businessUnitId: v.businessUnitId,
      ownerUserId: v.ownerUserId,
      status: v.status,
    };
    if (v.targetValueRupees != null) body['targetValuePaise'] = Math.round(v.targetValueRupees * 100);
    if (v.startDate) body['startDate'] = (v.startDate as Date).toISOString().slice(0, 10);
    if (v.endDate) body['endDate'] = (v.endDate as Date).toISOString().slice(0, 10);
    if (v.accountIds && v.accountIds.length > 0) body['accountIds'] = v.accountIds;
    if (v.contactIds && v.contactIds.length > 0) body['contactIds'] = v.contactIds;

    this.http.post<{ data: Initiative }>(`${environment.apiBaseUrl}/initiatives`, body).subscribe({
      next: (r) => {
        this.saving = false;
        this.formVisible = false;
        this.ngRouter.navigate(['/sales/initiatives', r.data.id]);
      },
      error: (err: HttpErrorResponse) => {
        this.saving = false;
        this.serverError = err.error?.error?.message ?? 'Error creating initiative';
      },
    });
  }
}
