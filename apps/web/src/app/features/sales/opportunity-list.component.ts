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
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';

interface InfluencerRef { id: string; name: string; rating: number | null; }
interface Opportunity {
  id: string; title: string; stage: string; entryPath: string; closedStatus: string | null;
  contractValuePaise: number | null; accountName: string | null;
  endClientName: string | null; businessUnitName: string | null;
  influencers: InfluencerRef[]; createdAt: string;
}
interface SelectOption { id: string; name: string; }

@Component({
  selector: 'app-opportunity-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, TableModule, TagModule, ButtonModule, DialogModule, InputTextModule, SelectModule, InputNumberModule, ToastModule],
  providers: [MessageService],
  template: `
    <p-toast />
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-semibold text-gray-800">Opportunities</h2>
        <p class="text-sm text-gray-500 mt-1">Sales opportunities across all stages</p>
      </div>
      <p-button label="Create Opportunity" icon="pi pi-plus" (onClick)="openCreate()" />
    </div>

    <!-- Filters -->
    <div class="flex gap-3 mb-4 flex-wrap items-end">
      <div class="flex flex-col gap-1">
        <label class="text-xs text-gray-500">Status</label>
        <p-select [(ngModel)]="filterOpenStatus" [options]="openStatusOptions" optionLabel="label" optionValue="value" (onChange)="load()" class="w-36" />
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-xs text-gray-500">Business Unit</label>
        <p-select [(ngModel)]="filterBuId" [options]="buOptions()" optionLabel="name" optionValue="id" [filter]="true" [showClear]="true" placeholder="All BUs" (onChange)="load()" class="w-48" />
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-xs text-gray-500">Account</label>
        <p-select [(ngModel)]="filterAccountId" [options]="accountOptions()" optionLabel="name" optionValue="id" [filter]="true" [showClear]="true" placeholder="All Accounts" (onChange)="load()" class="w-48" />
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-xs text-gray-500">Search</label>
        <input pInputText [(ngModel)]="filterQ" placeholder="Title..." class="w-48" (keyup.enter)="load()" />
      </div>
      <p-button icon="pi pi-search" [outlined]="true" (onClick)="load()" />
    </div>

    @if (loading()) {
      <div class="flex items-center gap-2 text-gray-500 py-12 justify-center"><i class="pi pi-spin pi-spinner text-2xl"></i> Loading...</div>
    } @else {
      <div class="bg-white rounded-lg shadow-sm border border-gray-200">
        <p-table [value]="opportunities()" styleClass="p-datatable-sm">
          <ng-template pTemplate="header">
            <tr>
              <th class="font-semibold">Title</th>
              <th class="font-semibold">Account</th>
              <th class="font-semibold">End Client</th>
              <th class="font-semibold">BU</th>
              <th class="font-semibold">Value</th>
              <th class="font-semibold">Stage</th>
              @if (filterOpenStatus !== 'open') {
                <th class="font-semibold">Closed</th>
              }
              <th class="font-semibold">Influencers</th>
              <th class="font-semibold" style="width:100px">Actions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-o>
            <tr class="cursor-pointer hover:bg-gray-50" (click)="openDetail(o)">
              <td><span class="font-medium text-blue-400">{{ o.title }}</span></td>
              <td><span class="text-sm">{{ o.accountName || '—' }}</span></td>
              <td><span class="text-sm">{{ o.endClientName || '—' }}</span></td>
              <td><span class="text-sm">{{ o.businessUnitName || '—' }}</span></td>
              <td><span class="text-sm">{{ o.contractValuePaise ? '₹' + (o.contractValuePaise / 100 | number:'1.0-0') : '—' }}</span></td>
              <td><p-tag [value]="formatStage(o.stage)" [severity]="stageSeverity(o.stage)" [style]="{'font-size':'0.7rem'}" /></td>
              @if (filterOpenStatus !== 'open') {
                <td>
                  @if (o.closedStatus) {
                    <p-tag [value]="o.closedStatus" [severity]="closedSeverity(o.closedStatus)" [style]="{'font-size':'0.7rem'}" />
                  } @else {
                    <span class="text-gray-400">—</span>
                  }
                </td>
              }
              <td>
                <div class="flex flex-wrap gap-1">
                  @for (inf of o.influencers; track inf.id) {
                    <p-tag [value]="inf.name" severity="warn" [style]="{'font-size':'0.6rem'}" />
                  }
                </div>
              </td>
              <td>
                <p-button icon="pi pi-pencil" [rounded]="true" [text]="true" severity="info" size="small" (onClick)="openDetail(o); $event.stopPropagation()" />
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td [attr.colspan]="filterOpenStatus !== 'open' ? 9 : 8" class="text-center py-8 text-gray-500">No opportunities found.</td></tr>
          </ng-template>
        </p-table>
      </div>
    }

    <!-- Create Dialog (quick create) -->
    <p-dialog header="Create Opportunity" [(visible)]="formVisible" [modal]="true" [style]="{width:'550px'}">
      <form [formGroup]="form" class="flex flex-col gap-4 pt-2">
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Title *</label>
          <input pInputText formControlName="title" placeholder="e.g. CCTV Surveillance - Phase 2" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Business Unit *</label>
          <p-select appendTo="body" formControlName="businessUnitId" [options]="buOptions()" optionLabel="name" optionValue="id" [filter]="true" placeholder="Select BU" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Account</label>
          <p-select appendTo="body" formControlName="accountId" [options]="accountOptions()" optionLabel="name" optionValue="id" [filter]="true" [showClear]="true" placeholder="Select account" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">End Client</label>
          <p-select appendTo="body" formControlName="endClientAccountId" [options]="accountOptions()" optionLabel="name" optionValue="id" [filter]="true" [showClear]="true" placeholder="Select end client" class="w-full" />
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Entry Path *</label>
            <p-select appendTo="body" formControlName="entryPath" [options]="entryPathOptions()" optionLabel="label" optionValue="value" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Contract Value (₹)</label>
            <p-inputNumber formControlName="contractValueRupees" mode="currency" currency="INR" locale="en-IN" class="w-full" />
          </div>
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
export class OpportunityListComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly msg = inject(MessageService);
  private readonly ngRouter = inject(NgRouter);

  opportunities = signal<Opportunity[]>([]);
  buOptions = signal<SelectOption[]>([]);
  accountOptions = signal<SelectOption[]>([]);
  loading = signal(true);
  formVisible = false;
  saving = false;
  serverError = '';

  // Filters
  filterOpenStatus = 'open';
  filterBuId = '';
  filterAccountId = '';
  filterQ = '';

  openStatusOptions = [
    { label: 'Open', value: 'open' },
    { label: 'Closed', value: 'closed' },
    { label: 'All', value: 'all' },
  ];

  entryPathOptions = signal<Array<{ label: string; value: string }>>([]);

  form = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(255)]],
    businessUnitId: ['', Validators.required],
    accountId: [''],
    endClientAccountId: [''],
    entryPath: ['STANDARD_TENDER', Validators.required],
    contractValueRupees: [null as number | null],
  });

  ngOnInit(): void { this.load(); this.loadBUs(); this.loadAccounts(); this.loadLookups(); }

  private loadLookups(): void {
    this.http.get<{ data: Array<{ label: string; value: string }> }>(`${environment.apiBaseUrl}/lookup-lists/by-code/entry_path/items`).subscribe({
      next: (r) => this.entryPathOptions.set(r.data),
      error: () => {},
    });
  }

  load(): void {
    this.loading.set(true);
    const params: string[] = ['limit=200'];
    params.push(`openStatus=${this.filterOpenStatus}`);
    if (this.filterBuId) params.push(`buId=${this.filterBuId}`);
    if (this.filterAccountId) params.push(`accountId=${this.filterAccountId}`);
    if (this.filterQ) params.push(`q=${encodeURIComponent(this.filterQ)}`);
    this.http.get<{ data: Opportunity[] }>(`${environment.apiBaseUrl}/opportunities?${params.join('&')}`).subscribe({
      next: (r) => { this.opportunities.set(r.data); this.loading.set(false); },
      error: () => { this.loading.set(false); },
    });
  }

  private loadBUs(): void {
    this.http.get<{ data: SelectOption[] }>(`${environment.apiBaseUrl}/business-units?limit=200`).subscribe({ next: (r) => this.buOptions.set(r.data) });
  }

  private loadAccounts(): void {
    this.http.get<{ data: SelectOption[] }>(`${environment.apiBaseUrl}/accounts?limit=200`).subscribe({ next: (r) => this.accountOptions.set(r.data) });
  }

  formatStage(s: string): string { return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }
  stageSeverity(s: string): 'info' | 'success' | 'warn' | 'danger' {
    const lower = s.toLowerCase();
    if (lower === 'awarded' || lower === 'closed') return 'success';
    if (lower === 'lost') return 'danger';
    if (lower.includes('bid') || lower.includes('eval')) return 'warn';
    return 'info';
  }
  closedSeverity(s: string): 'success' | 'info' | 'warn' | 'danger' {
    switch (s) { case 'WON': return 'success'; case 'LOST': return 'danger'; case 'CANCELLED': return 'danger'; case 'ON_HOLD': return 'warn'; default: return 'info'; }
  }

  openDetail(o: Opportunity): void { this.ngRouter.navigate(['/sales/opportunities', o.id]); }

  openCreate(): void { this.form.reset({ entryPath: 'STANDARD_TENDER' }); this.serverError = ''; this.formVisible = true; }

  onSubmit(): void {
    if (this.form.invalid) return;
    this.saving = true; this.serverError = '';
    const v = this.form.value;
    const body: Record<string, unknown> = {
      title: v.title, businessUnitId: v.businessUnitId, entryPath: v.entryPath,
    };
    if (v.accountId) body['accountId'] = v.accountId;
    if (v.endClientAccountId) body['endClientAccountId'] = v.endClientAccountId;
    if (v.contractValueRupees != null) body['contractValuePaise'] = Math.round(v.contractValueRupees * 100);

    this.http.post<{ data: Opportunity }>(`${environment.apiBaseUrl}/opportunities`, body).subscribe({
      next: (r) => { this.saving = false; this.formVisible = false; this.ngRouter.navigate(['/sales/opportunities', r.data.id]); },
      error: (err: HttpErrorResponse) => { this.saving = false; this.serverError = err.error?.error?.message ?? 'Error'; },
    });
  }
}
