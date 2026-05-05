import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ReactiveFormsModule, FormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { InputNumberModule } from 'primeng/inputnumber';
import { DatePickerModule } from 'primeng/datepicker';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';
import { ActivityPanelComponent } from '../../shared/components/activity-panel.component';

interface Ref { id: string; name: string; }
interface LeadRef { id: string; title: string; status: string; }
interface OpportunityRef { id: string; title: string; stage: string; contractValuePaise: number | null; }

interface Initiative {
  id: string; title: string; description: string | null; status: string;
  targetValuePaise: number | null; startDate: string | null; endDate: string | null;
  businessUnitId: string; businessUnitName: string | null;
  ownerUserId: string; ownerName: string | null;
  accounts: Ref[]; contacts: Ref[];
  leads: LeadRef[]; opportunities: OpportunityRef[];
  createdAt: string; updatedAt: string;
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
  selector: 'app-initiative-detail',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, ButtonModule, InputTextModule, TextareaModule, SelectModule, MultiSelectModule, InputNumberModule, DatePickerModule, TagModule, DialogModule, ToastModule, ConfirmDialogModule, ActivityPanelComponent],
  providers: [MessageService, ConfirmationService],
  template: `
    <p-toast /><p-confirmDialog />

    @if (loading()) {
      <div class="flex items-center gap-2 text-gray-500 py-12 justify-center"><i class="pi pi-spin pi-spinner text-2xl"></i> Loading...</div>
    } @else if (!initiative()) {
      <div class="text-center py-12 text-gray-500">Initiative not found</div>
    } @else {
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-3">
          <p-button icon="pi pi-arrow-left" [rounded]="true" [text]="true" severity="secondary" (onClick)="goBack()" />
          <div>
            <h2 class="text-2xl font-semibold text-gray-800">{{ initiative()!.title }}</h2>
            <p class="text-sm text-gray-500 mt-0.5">Created {{ initiative()!.createdAt | date:'dd-MMM-yyyy' }}</p>
          </div>
          <p-tag [value]="formatStatus(initiative()!.status)" [severity]="statusSeverity(initiative()!.status)" />
        </div>
        <div class="flex gap-2">
          @if (!editing()) {
            <p-button label="Edit" icon="pi pi-pencil" severity="info" [outlined]="true" (onClick)="startEdit()" />
            <p-button label="Delete" icon="pi pi-trash" severity="danger" [outlined]="true" (onClick)="confirmDelete()" />
          } @else {
            <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="cancelEdit()" />
            <p-button label="Save" icon="pi pi-check" [loading]="saving" (onClick)="save()" />
          }
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Left: Initiative Details (2/3) -->
        <div class="lg:col-span-2 space-y-6">
          <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 class="text-lg font-semibold text-gray-700 mb-4">Initiative Details</h3>
            @if (!editing()) {
              <!-- Read-only view -->
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <span class="text-xs text-gray-400 uppercase">Title</span>
                  <p class="text-sm font-medium text-gray-800 mt-0.5">{{ initiative()!.title }}</p>
                </div>
                <div>
                  <span class="text-xs text-gray-400 uppercase">Status</span>
                  <p class="mt-0.5"><p-tag [value]="formatStatus(initiative()!.status)" [severity]="statusSeverity(initiative()!.status)" /></p>
                </div>
                <div>
                  <span class="text-xs text-gray-400 uppercase">Business Unit</span>
                  <p class="text-sm text-gray-800 mt-0.5">{{ initiative()!.businessUnitName || '—' }}</p>
                </div>
                <div>
                  <span class="text-xs text-gray-400 uppercase">Owner</span>
                  <p class="text-sm text-gray-800 mt-0.5">{{ initiative()!.ownerName || '—' }}</p>
                </div>
                <div>
                  <span class="text-xs text-gray-400 uppercase">Target Value</span>
                  <p class="text-sm font-medium text-gray-800 mt-0.5">{{ initiative()!.targetValuePaise ? '₹' + (initiative()!.targetValuePaise! / 100 | number:'1.0-0') : '—' }}</p>
                </div>
                <div>
                  <span class="text-xs text-gray-400 uppercase">Period</span>
                  <p class="text-sm text-gray-800 mt-0.5">{{ initiative()!.startDate ? (initiative()!.startDate | date:'dd-MMM-yy') : '—' }} — {{ initiative()!.endDate ? (initiative()!.endDate | date:'dd-MMM-yy') : '—' }}</p>
                </div>
              </div>
              @if (initiative()!.description) {
                <div class="mt-4">
                  <span class="text-xs text-gray-400 uppercase">Description</span>
                  <p class="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{{ initiative()!.description }}</p>
                </div>
              }
            } @else {
              <!-- Edit form -->
              <form [formGroup]="form" class="flex flex-col gap-4">
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Title *</label>
                  <input pInputText formControlName="title" class="w-full" />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Description</label>
                  <textarea pTextarea formControlName="description" [rows]="3" class="w-full"></textarea>
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-gray-700">Business Unit *</label>
                    <p-select appendTo="body" formControlName="businessUnitId" [options]="buOptions()" optionLabel="name" optionValue="id" [filter]="true" class="w-full" />
                  </div>
                  <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-gray-700">Owner *</label>
                    <p-select appendTo="body" formControlName="ownerUserId" [options]="userOptions()" optionLabel="fullName" optionValue="id" [filter]="true" class="w-full" />
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
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Leads</label>
                  <p-multiSelect appendTo="body" formControlName="leadIds" [options]="leadOptions()" optionLabel="title" optionValue="id" [filter]="true" placeholder="Link leads..." class="w-full" />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Opportunities</label>
                  <p-multiSelect appendTo="body" formControlName="opportunityIds" [options]="opportunityOptions()" optionLabel="title" optionValue="id" [filter]="true" placeholder="Link opportunities..." class="w-full" />
                </div>
              </form>
            }
          </div>
        </div>

        <!-- Right: Associations (1/3) -->
        <div class="space-y-4">
          <!-- Accounts -->
          <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <h4 class="text-sm font-semibold text-gray-600 uppercase mb-3">Accounts ({{ initiative()!.accounts.length }})</h4>
            @if (initiative()!.accounts.length === 0) {
              <p class="text-sm text-gray-400">No accounts linked</p>
            } @else {
              <div class="flex flex-wrap gap-2">
                @for (a of initiative()!.accounts; track a.id) {
                  <span class="inline-flex items-center gap-1 bg-blue-50 border border-blue-200 rounded-full px-3 py-1 text-sm text-blue-800">
                    <i class="pi pi-building text-xs"></i> {{ a.name }}
                  </span>
                }
              </div>
            }
          </div>

          <!-- Contacts -->
          <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <h4 class="text-sm font-semibold text-gray-600 uppercase mb-3">Contacts ({{ initiative()!.contacts.length }})</h4>
            @if (initiative()!.contacts.length === 0) {
              <p class="text-sm text-gray-400">No contacts linked</p>
            } @else {
              <div class="flex flex-wrap gap-2">
                @for (c of initiative()!.contacts; track c.id) {
                  <span class="inline-flex items-center gap-1 bg-purple-50 border border-purple-200 rounded-full px-3 py-1 text-sm text-purple-800">
                    <i class="pi pi-user text-xs"></i> {{ c.name }}
                  </span>
                }
              </div>
            }
          </div>

          <!-- Leads -->
          <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <h4 class="text-sm font-semibold text-gray-600 uppercase mb-3">Leads ({{ initiative()!.leads.length }})</h4>
            @if (initiative()!.leads.length === 0) {
              <p class="text-sm text-gray-400">No leads linked</p>
            } @else {
              <div class="flex flex-col gap-2">
                @for (l of initiative()!.leads; track l.id) {
                  <div class="flex items-center justify-between bg-gray-50 rounded px-3 py-2 cursor-pointer hover:bg-gray-100" (click)="navigateTo('/sales/leads')">
                    <span class="text-sm text-gray-800">{{ l.title }}</span>
                    <p-tag [value]="l.status" [severity]="leadSeverity(l.status)" [style]="{'font-size':'0.6rem'}" />
                  </div>
                }
              </div>
            }
          </div>

          <!-- Opportunities -->
          <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <h4 class="text-sm font-semibold text-gray-600 uppercase mb-3">Opportunities ({{ initiative()!.opportunities.length }})</h4>
            @if (initiative()!.opportunities.length === 0) {
              <p class="text-sm text-gray-400">No opportunities linked</p>
            } @else {
              <div class="flex flex-col gap-2">
                @for (o of initiative()!.opportunities; track o.id) {
                  <div class="flex items-center justify-between bg-gray-50 rounded px-3 py-2 cursor-pointer hover:bg-gray-100" (click)="navigateTo('/sales/opportunities/' + o.id)">
                    <div>
                      <span class="text-sm text-blue-700 font-medium">{{ o.title }}</span>
                      @if (o.contractValuePaise) {
                        <span class="text-xs text-gray-500 ml-2">₹{{ o.contractValuePaise / 100 | number:'1.0-0' }}</span>
                      }
                    </div>
                    <p-tag [value]="formatStage(o.stage)" severity="info" [style]="{'font-size':'0.6rem'}" />
                  </div>
                }
              </div>
            }
          </div>
        </div>
      </div>

      <!-- Documents Section -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mt-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-gray-700 flex items-center gap-2">
            <i class="pi pi-folder-open text-blue-600"></i> Documents
          </h3>
          <div>
            <input #fileInput type="file" class="hidden" (change)="onFileSelect($event)" />
            <p-button label="Upload Document" icon="pi pi-upload" size="small" (onClick)="fileInput.click()" [loading]="uploadingDoc" />
          </div>
        </div>
        @if (documents().length > 0) {
          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            @for (doc of documents(); track doc.id) {
              <div class="border border-gray-200 rounded-lg p-3 hover:shadow-md transition-shadow">
                <div class="flex items-start gap-2">
                  <i [class]="getDocIcon(doc.mimeType) + ' text-2xl mt-0.5'"></i>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-gray-800 truncate" [title]="doc.name">{{ doc.name }}</p>
                    <p class="text-xs text-gray-400">{{ formatFileSize(doc.fileSize) }}</p>
                  </div>
                </div>
                <div class="flex justify-end gap-1 mt-2">
                  <button (click)="viewDocument(doc)" class="p-1 text-gray-400 hover:text-blue-600" title="View"><i class="pi pi-eye text-sm"></i></button>
                  <button (click)="deleteDocument(doc)" class="p-1 text-gray-400 hover:text-red-600" title="Delete"><i class="pi pi-trash text-sm"></i></button>
                </div>
              </div>
            }
          </div>
        } @else {
          <div class="text-center py-6 text-gray-400 text-sm">No documents uploaded yet</div>
        }
      </div>

      <!-- Activity Panel -->
      <div class="mt-6">
        <app-activity-panel entityType="INITIATIVE" [entityId]="initiative()!.id" />
      </div>
    }
  `,
})
export class InitiativeDetailComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly msg = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  initiative = signal<Initiative | null>(null);
  loading = signal(true);
  editing = signal(false);
  saving = false;

  // Documents
  documents = signal<Array<{ id: string; name: string; fileName: string; mimeType: string; fileSize: number }>>([]);
  uploadingDoc = false;

  buOptions = signal<SelectOption[]>([]);
  userOptions = signal<UserOption[]>([]);
  accountOptions = signal<SelectOption[]>([]);
  contactOptions = signal<Array<{ id: string; name: string }>>([]);
  leadOptions = signal<Array<{ id: string; title: string }>>([]);
  opportunityOptions = signal<Array<{ id: string; title: string }>>([]);

  statusOptions = STATUS_OPTIONS;

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
    leadIds: [[] as string[]],
    opportunityIds: [[] as string[]],
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.loadInitiative(id);
  }

  private loadInitiative(id: string): void {
    this.loading.set(true);
    this.http.get<{ data: Initiative }>(`${environment.apiBaseUrl}/initiatives/${id}`).subscribe({
      next: (r) => { this.initiative.set(r.data); this.loading.set(false); this.loadDocuments(id); },
      error: () => { this.loading.set(false); },
    });
  }

  startEdit(): void {
    this.loadDropdowns();
    const i = this.initiative()!;
    this.form.patchValue({
      title: i.title,
      description: i.description ?? '',
      businessUnitId: i.businessUnitId,
      ownerUserId: i.ownerUserId,
      status: i.status,
      targetValueRupees: i.targetValuePaise != null ? i.targetValuePaise / 100 : null,
      startDate: i.startDate ? new Date(i.startDate) : null,
      endDate: i.endDate ? new Date(i.endDate) : null,
      accountIds: i.accounts.map((a) => a.id),
      contactIds: i.contacts.map((c) => c.id),
      leadIds: i.leads.map((l) => l.id),
      opportunityIds: i.opportunities.map((o) => o.id),
    });
    this.editing.set(true);
  }

  cancelEdit(): void { this.editing.set(false); }

  save(): void {
    if (this.form.invalid) return;
    this.saving = true;
    const v = this.form.value;
    const body: Record<string, unknown> = {
      title: v.title,
      description: v.description || null,
      businessUnitId: v.businessUnitId,
      ownerUserId: v.ownerUserId,
      status: v.status,
      targetValuePaise: v.targetValueRupees != null ? Math.round(v.targetValueRupees * 100) : null,
      startDate: v.startDate ? (v.startDate as Date).toISOString().slice(0, 10) : null,
      endDate: v.endDate ? (v.endDate as Date).toISOString().slice(0, 10) : null,
      accountIds: v.accountIds ?? [],
      contactIds: v.contactIds ?? [],
      leadIds: v.leadIds ?? [],
      opportunityIds: v.opportunityIds ?? [],
    };

    this.http.patch<{ data: Initiative }>(`${environment.apiBaseUrl}/initiatives/${this.initiative()!.id}`, body).subscribe({
      next: (r) => {
        this.saving = false;
        this.initiative.set(r.data);
        this.editing.set(false);
        this.msg.add({ severity: 'success', summary: 'Saved', detail: 'Initiative updated' });
      },
      error: (err: HttpErrorResponse) => {
        this.saving = false;
        this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Save failed' });
      },
    });
  }

  confirmDelete(): void {
    this.confirm.confirm({
      message: 'Are you sure you want to delete this initiative?',
      header: 'Confirm Delete',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.http.delete(`${environment.apiBaseUrl}/initiatives/${this.initiative()!.id}`).subscribe({
          next: () => {
            this.msg.add({ severity: 'success', summary: 'Deleted', detail: 'Initiative deleted' });
            this.router.navigate(['/sales/initiatives']);
          },
          error: () => { this.msg.add({ severity: 'error', summary: 'Error', detail: 'Delete failed' }); },
        });
      },
    });
  }

  private loadDropdowns(): void {
    this.http.get<{ data: SelectOption[] }>(`${environment.apiBaseUrl}/business-units?limit=200`).subscribe({ next: (r) => this.buOptions.set(r.data) });
    this.http.get<{ data: UserOption[] }>(`${environment.apiBaseUrl}/users?limit=200`).subscribe({ next: (r) => this.userOptions.set(r.data) });
    this.http.get<{ data: SelectOption[] }>(`${environment.apiBaseUrl}/accounts?limit=200`).subscribe({ next: (r) => this.accountOptions.set(r.data) });
    this.http.get<{ data: Array<{ id: string; firstName: string; lastName: string | null }> }>(`${environment.apiBaseUrl}/contacts?limit=200`).subscribe({
      next: (r) => this.contactOptions.set(r.data.map((c) => ({ id: c.id, name: `${c.firstName}${c.lastName ? ' ' + c.lastName : ''}` }))),
    });
    this.http.get<{ data: Array<{ id: string; title: string }> }>(`${environment.apiBaseUrl}/leads?limit=200`).subscribe({ next: (r) => this.leadOptions.set(r.data) });
    this.http.get<{ data: Array<{ id: string; title: string }> }>(`${environment.apiBaseUrl}/opportunities?limit=200`).subscribe({ next: (r) => this.opportunityOptions.set(r.data) });
  }

  goBack(): void { this.router.navigate(['/sales/initiatives']); }
  navigateTo(path: string): void { this.router.navigateByUrl(path); }

  formatStatus(s: string): string { return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()); }
  formatStage(s: string): string { return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()); }

  statusSeverity(s: string): 'info' | 'success' | 'warn' | 'danger' | 'contrast' {
    switch (s) {
      case 'ACTIVE': return 'success';
      case 'ON_HOLD': return 'warn';
      case 'COMPLETED': return 'contrast';
      case 'CANCELLED': return 'danger';
      default: return 'info';
    }
  }

  leadSeverity(s: string): 'info' | 'success' | 'warn' | 'danger' {
    switch (s) {
      case 'CONVERTED': return 'success';
      case 'LOST': return 'danger';
      case 'QUALIFIED': return 'warn';
      default: return 'info';
    }
  }

  // ---- Documents ----

  private loadDocuments(initId: string): void {
    this.http.get<{ data: Array<{ id: string; name: string; fileName: string; mimeType: string; fileSize: number }> }>(
      `${environment.apiBaseUrl}/initiatives/${initId}/documents`,
    ).subscribe({ next: (r) => this.documents.set(r.data) });
  }

  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !this.initiative()) return;
    input.value = '';
    this.uploadingDoc = true;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('name', file.name.replace(/\.[^.]+$/, ''));
    this.http.post(`${environment.apiBaseUrl}/initiatives/${this.initiative()!.id}/documents`, fd).subscribe({
      next: () => { this.uploadingDoc = false; this.loadDocuments(this.initiative()!.id); this.msg.add({ severity: 'success', summary: 'Uploaded', detail: file.name }); },
      error: (err: HttpErrorResponse) => { this.uploadingDoc = false; this.msg.add({ severity: 'error', summary: 'Upload Failed', detail: err.error?.error?.message ?? 'Error' }); },
    });
  }

  viewDocument(doc: { id: string }): void {
    this.http.get(`${environment.apiBaseUrl}/initiatives/${this.initiative()!.id}/documents/${doc.id}/download`, { responseType: 'blob' }).subscribe({
      next: (blob) => { window.open(URL.createObjectURL(blob), '_blank'); },
    });
  }

  deleteDocument(doc: { id: string; name: string }): void {
    this.confirm.confirm({
      message: `Delete "${doc.name}"?`,
      accept: () => {
        this.http.delete(`${environment.apiBaseUrl}/initiatives/${this.initiative()!.id}/documents/${doc.id}`).subscribe({
          next: () => { this.loadDocuments(this.initiative()!.id); this.msg.add({ severity: 'success', summary: 'Deleted' }); },
        });
      },
    });
  }

  getDocIcon(mime: string): string {
    if (mime.includes('pdf')) return 'pi pi-file-pdf text-red-500';
    if (mime.includes('word') || mime.includes('document')) return 'pi pi-file-word text-blue-600';
    if (mime.includes('sheet') || mime.includes('excel')) return 'pi pi-file-excel text-green-600';
    if (mime.includes('image')) return 'pi pi-image text-purple-500';
    return 'pi pi-file text-gray-400';
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
