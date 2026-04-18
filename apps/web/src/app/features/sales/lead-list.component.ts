import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { ConfirmationService, MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';

interface Lead {
  id: string; title: string; status: string; source: string;
  accountId: string | null; accountName: string | null;
  contactName: string | null; estimatedValuePaise: number | null;
  businessUnitId: string | null; convertedOpportunityId: string | null;
  createdAt: string;
}
interface SelectOption { id: string; name: string; }

@Component({
  selector: 'app-lead-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TableModule, TagModule, ButtonModule, DialogModule, InputTextModule, TextareaModule, SelectModule, InputNumberModule, ConfirmDialogModule, ToastModule],
  providers: [ConfirmationService, MessageService],
  template: `
    <p-toast /><p-confirmDialog />
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-semibold text-gray-800">Leads</h2>
        <p class="text-sm text-gray-500 mt-1">Early-stage opportunities before qualification</p>
      </div>
      <p-button label="Create Lead" icon="pi pi-plus" (onClick)="openCreate()" />
    </div>
    @if (loading()) {
      <div class="flex items-center gap-2 text-gray-500 py-12 justify-center"><i class="pi pi-spin pi-spinner text-2xl"></i> Loading...</div>
    } @else {
      <div class="bg-white rounded-lg shadow-sm border border-gray-200">
        <p-table [value]="leads()" styleClass="p-datatable-sm">
          <ng-template pTemplate="header">
            <tr>
              <th class="font-semibold">Title</th>
              <th class="font-semibold">Account</th>
              <th class="font-semibold">Source</th>
              <th class="font-semibold">Est. Value</th>
              <th class="font-semibold">Status</th>
              <th class="font-semibold" style="width:220px">Actions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-l>
            <tr>
              <td><span class="font-medium">{{ l.title }}</span></td>
              <td><span class="text-sm">{{ l.accountName || '—' }}</span></td>
              <td><span class="text-sm">{{ formatSource(l.source) }}</span></td>
              <td><span class="text-sm">{{ l.estimatedValuePaise ? '₹' + (l.estimatedValuePaise / 100 | number:'1.0-0') : '—' }}</span></td>
              <td><p-tag [value]="l.status" [severity]="statusSeverity(l.status)" /></td>
              <td>
                <div class="flex gap-1">
                  @if (l.status !== 'CONVERTED' && l.status !== 'LOST') {
                    <p-button icon="pi pi-arrow-right" label="Convert" [text]="true" severity="success" size="small" (onClick)="convertLead(l)" />
                  }
                  <p-button icon="pi pi-pencil" [rounded]="true" [text]="true" severity="info" size="small" (onClick)="openEdit(l)" />
                  <p-button icon="pi pi-trash" [rounded]="true" [text]="true" severity="danger" size="small" (onClick)="confirmDelete(l)" />
                </div>
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td colspan="6" class="text-center py-8 text-gray-500">No leads yet.</td></tr>
          </ng-template>
        </p-table>
      </div>
    }
    <p-dialog [header]="editItem ? 'Edit Lead' : 'Create Lead'" [(visible)]="formVisible" [modal]="true" [style]="{width:'550px'}">
      <form [formGroup]="form" class="flex flex-col gap-4 pt-2">
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Title *</label>
          <input pInputText formControlName="title" placeholder="e.g. Smart City CCTV Project" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Business Unit *</label>
          <p-select appendTo="body" formControlName="businessUnitId" [options]="buOptions()" optionLabel="name" optionValue="id" [filter]="true" filterBy="name" placeholder="Select BU" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Account</label>
          <p-select appendTo="body" formControlName="accountId" [options]="accountOptions()" optionLabel="name" optionValue="id" [filter]="true" filterBy="name" [showClear]="true" placeholder="Select account" class="w-full" />
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Source *</label>
            <p-select appendTo="body" formControlName="source" [options]="sourceOptions" optionLabel="label" optionValue="value" class="w-full" />
          </div>
          @if (editItem) {
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Status</label>
              <p-select appendTo="body" formControlName="status" [options]="statusOptions" optionLabel="label" optionValue="value" class="w-full" />
            </div>
          }
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Estimated Value (₹)</label>
          <p-inputNumber formControlName="estimatedValueRupees" mode="currency" currency="INR" locale="en-IN" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Description</label>
          <textarea pTextarea formControlName="description" rows="3" class="w-full"></textarea>
        </div>
        @if (serverError) { <div class="p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">{{ serverError }}</div> }
      </form>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="formVisible=false" />
        <p-button [label]="editItem ? 'Save' : 'Create'" [loading]="saving" [disabled]="form.invalid||saving" (onClick)="onSubmit()" />
      </ng-template>
    </p-dialog>
  `,
})
export class LeadListComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly confirm = inject(ConfirmationService);
  private readonly msg = inject(MessageService);

  leads = signal<Lead[]>([]);
  accountOptions = signal<SelectOption[]>([]);
  buOptions = signal<SelectOption[]>([]);
  loading = signal(true);
  formVisible = false;
  editItem: Lead | null = null;
  saving = false;
  serverError = '';

  sourceOptions = [
    { label: 'Website', value: 'WEBSITE' }, { label: 'Referral', value: 'REFERRAL' },
    { label: 'Conference', value: 'CONFERENCE' }, { label: 'GeM Portal', value: 'GEM_PORTAL' },
    { label: 'CPPP', value: 'CPPP' }, { label: 'Cold Outreach', value: 'COLD_OUTREACH' },
    { label: 'Existing Account', value: 'EXISTING_ACCOUNT' }, { label: 'Other', value: 'OTHER' },
  ];
  statusOptions = [
    { label: 'New', value: 'NEW' }, { label: 'Contacted', value: 'CONTACTED' },
    { label: 'Qualified', value: 'QUALIFIED' }, { label: 'Lost', value: 'LOST' },
  ];

  form = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(255)]],
    businessUnitId: ['', Validators.required],
    accountId: [''],
    source: ['REFERRAL', Validators.required],
    status: ['NEW'],
    estimatedValueRupees: [null as number | null],
    description: [''],
  });

  ngOnInit(): void { this.load(); this.loadAccounts(); this.loadBUs(); }

  load(): void {
    this.loading.set(true);
    this.http.get<{ data: Lead[] }>(`${environment.apiBaseUrl}/leads?limit=200`).subscribe({
      next: (r) => { this.leads.set(r.data); this.loading.set(false); },
      error: () => { this.loading.set(false); },
    });
  }

  private loadAccounts(): void {
    this.http.get<{ data: SelectOption[] }>(`${environment.apiBaseUrl}/accounts?limit=200`).subscribe({
      next: (r) => this.accountOptions.set(r.data),
    });
  }

  private loadBUs(): void {
    this.http.get<{ data: SelectOption[] }>(`${environment.apiBaseUrl}/business-units?limit=200`).subscribe({
      next: (r) => this.buOptions.set(r.data),
    });
  }

  formatSource(s: string): string { return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }

  statusSeverity(s: string): 'info' | 'success' | 'warn' | 'danger' {
    switch (s) { case 'QUALIFIED': return 'success'; case 'CONVERTED': return 'info'; case 'LOST': return 'danger'; case 'CONTACTED': return 'warn'; default: return 'info'; }
  }

  openCreate(): void { this.editItem = null; this.form.reset({ source: 'REFERRAL', status: 'NEW' }); this.serverError = ''; this.formVisible = true; }

  openEdit(l: Lead): void {
    this.editItem = l;
    this.form.patchValue({ title: l.title, businessUnitId: l.businessUnitId ?? '', accountId: l.accountId ?? '', source: l.source, status: l.status, estimatedValueRupees: l.estimatedValuePaise ? l.estimatedValuePaise / 100 : null, description: '' });
    this.serverError = ''; this.formVisible = true;
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    this.saving = true; this.serverError = '';
    const v = this.form.value;
    const body: Record<string, unknown> = { title: v.title, source: v.source, businessUnitId: v.businessUnitId };
    if (v.status && this.editItem) body['status'] = v.status;
    if (v.accountId) body['accountId'] = v.accountId;
    if (v.estimatedValueRupees != null) body['estimatedValuePaise'] = Math.round(v.estimatedValueRupees * 100);
    if (v.description) body['description'] = v.description;

    const url = `${environment.apiBaseUrl}/leads`;
    const req$ = this.editItem ? this.http.patch(`${url}/${this.editItem.id}`, body) : this.http.post(url, body);
    req$.subscribe({
      next: () => { this.saving = false; this.formVisible = false; this.msg.add({ severity: 'success', summary: 'Success' }); this.load(); },
      error: (err: HttpErrorResponse) => { this.saving = false; this.serverError = err.error?.error?.message ?? 'Error'; },
    });
  }

  convertLead(l: Lead): void {
    this.confirm.confirm({
      message: `Convert "${l.title}" to an Opportunity?`, header: 'Convert Lead', icon: 'pi pi-arrow-right',
      accept: () => {
        this.http.post<{ data: { id: string; title: string } }>(`${environment.apiBaseUrl}/leads/${l.id}/convert`, {}).subscribe({
          next: (r) => {
            this.msg.add({ severity: 'success', summary: 'Converted', detail: `Opportunity "${r.data.title}" created`, life: 5000 });
            this.load();
          },
          error: (err: HttpErrorResponse) => this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed to convert' }),
        });
      },
    });
  }

  confirmDelete(l: Lead): void {
    this.confirm.confirm({
      message: `Delete "${l.title}"?`, header: 'Delete Lead', icon: 'pi pi-exclamation-triangle', acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.http.delete(`${environment.apiBaseUrl}/leads/${l.id}`).subscribe({
          next: () => { this.msg.add({ severity: 'success', summary: 'Deleted' }); this.load(); },
          error: (err: HttpErrorResponse) => this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed' }),
        });
      },
    });
  }
}
