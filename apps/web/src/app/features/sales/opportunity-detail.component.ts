import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ReactiveFormsModule, FormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { InputNumberModule } from 'primeng/inputnumber';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TabsModule } from 'primeng/tabs';
import { TableModule } from 'primeng/table';
import { DatePickerModule } from 'primeng/datepicker';
import { TextareaModule } from 'primeng/textarea';
import { ConfirmationService, MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';
import { ActivityPanelComponent } from '../../shared/components/activity-panel.component';

interface Ref { id: string; name: string; }
interface InfluencerRef { id: string; name: string; rating: number | null; }
interface Opportunity {
  id: string; title: string; stage: string; entryPath: string;
  contractValuePaise: number | null; probabilityPct: number | null;
  submissionDue: string | null;
  businessUnitId: string; businessUnitName: string | null;
  accountId: string | null; accountName: string | null;
  endClientAccountId: string | null; endClientName: string | null;
  ownerUserId: string | null; ownerName: string | null;
  contacts: Ref[]; influencers: InfluencerRef[];
  createdAt: string; updatedAt: string;
}
interface LookupItem { label: string; value: string; isActive?: boolean; }

interface CosEntry {
  id: string; opportunityId: string; category: string; entryDate: string;
  description: string; amountPaise: number; status: string;
  receiptRef: string | null; createdAt: string; updatedAt: string;
}
interface CosSummary {
  byCategory: Record<string, number>;
  byStatus: Record<string, number>;
  grandTotal: number;
}

const COS_CATEGORIES = [
  { label: 'Travel', value: 'TRAVEL' },
  { label: 'Accommodation', value: 'ACCOMMODATION' },
  { label: 'Demo / Presentation', value: 'DEMO_PRESENTATION' },
  { label: 'Consulting', value: 'CONSULTING' },
  { label: 'Documentation', value: 'DOCUMENTATION' },
  { label: 'Stationery / Printing', value: 'STATIONERY_PRINTING' },
  { label: 'Communication', value: 'COMMUNICATION' },
  { label: 'Other', value: 'OTHER' },
];

const COS_STATUSES = [
  { label: 'Spent', value: 'SPENT' },
  { label: 'Committed', value: 'COMMITTED' },
  { label: 'Projected', value: 'PROJECTED' },
];

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(COS_CATEGORIES.map((c) => [c.value, c.label]));

@Component({
  selector: 'app-opportunity-detail',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, ButtonModule, InputTextModule, SelectModule, MultiSelectModule, InputNumberModule, TagModule, DialogModule, ToastModule, ConfirmDialogModule, TabsModule, TableModule, DatePickerModule, TextareaModule, ActivityPanelComponent],
  providers: [MessageService, ConfirmationService],
  template: `
    <p-toast /><p-confirmDialog />

    @if (loading()) {
      <div class="flex items-center gap-2 text-gray-500 py-12 justify-center"><i class="pi pi-spin pi-spinner text-2xl"></i> Loading...</div>
    } @else if (!opp()) {
      <div class="text-center py-12 text-gray-500">Opportunity not found</div>
    } @else {
      <div class="flex items-center justify-between mb-6">
        <div>
          <div class="flex items-center gap-3">
            <p-button icon="pi pi-arrow-left" [text]="true" [rounded]="true" (onClick)="goBack()" />
            <h2 class="text-2xl font-semibold text-gray-800">{{ opp()!.title }}</h2>
            <p-tag [value]="opp()!.stage" [severity]="stageSeverity(opp()!.stage)" />
          </div>
          <p class="text-sm text-gray-500 mt-1 ml-12">{{ opp()!.entryPath }} &middot; Created {{ opp()!.createdAt | date:'mediumDate' }}
            @if (opp()!.ownerName) { &middot; Owner: {{ opp()!.ownerName }} }
          </p>
        </div>
      </div>

      <form [formGroup]="form" (ngSubmit)="onSave()">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <!-- Left: Core -->
          <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 class="text-lg font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <i class="pi pi-star text-blue-600"></i> Opportunity Details
            </h3>
            <div class="flex flex-col gap-4">
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Title *</label>
                <input pInputText formControlName="title" class="w-full" />
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Stage</label>
                  <p-select appendTo="body" formControlName="stage" [options]="stageOptions()" optionLabel="label" optionValue="value" class="w-full" />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Entry Path</label>
                  <p-select appendTo="body" formControlName="entryPath" [options]="entryPathOptions()" optionLabel="label" optionValue="value" class="w-full" />
                </div>
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Contract Value (₹)</label>
                  <p-inputNumber formControlName="contractValueRupees" mode="currency" currency="INR" locale="en-IN" class="w-full" />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Probability %</label>
                  <p-inputNumber formControlName="probabilityPct" [min]="0" [max]="100" suffix="%" class="w-full" />
                </div>
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Business Unit *</label>
                  <p-select appendTo="body" formControlName="businessUnitId" [options]="buOptions()" optionLabel="name" optionValue="id" [filter]="true" class="w-full" />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Owner</label>
                  <p-select appendTo="body" formControlName="ownerUserId" [options]="userOptions()" optionLabel="name" optionValue="id" [filter]="true" [showClear]="true" placeholder="Select owner" class="w-full" />
                </div>
              </div>
            </div>
          </div>

          <!-- Right: Relationships -->
          <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 class="text-lg font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <i class="pi pi-link text-green-600"></i> Relationships
            </h3>
            <div class="flex flex-col gap-4">
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Account</label>
                <p-select appendTo="body" formControlName="accountId" [options]="accountOptions()" optionLabel="name" optionValue="id" [filter]="true" [showClear]="true" placeholder="Select account" class="w-full" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">End Client</label>
                <p-select appendTo="body" formControlName="endClientAccountId" [options]="accountOptions()" optionLabel="name" optionValue="id" [filter]="true" [showClear]="true" placeholder="Select end client" class="w-full" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Contacts</label>
                <p-multiSelect appendTo="body" formControlName="contactIds" [options]="contactOptions()" optionLabel="name" optionValue="id" placeholder="Select contacts" display="chip" class="w-full" />
              </div>

              <!-- Influencers -->
              <div class="border-t pt-3 mt-1">
                <div class="flex items-center justify-between mb-2">
                  <label class="text-sm font-semibold text-gray-700">Influencers</label>
                  <p-button icon="pi pi-user-plus" size="small" [text]="true" (onClick)="linkDialogVisible=true" />
                </div>
                <div class="flex flex-wrap gap-2">
                  @for (inf of opp()!.influencers; track inf.id) {
                    <div class="flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-full px-3 py-1 text-sm">
                      <span>{{ inf.name }}</span>
                      @if (inf.rating) { <span class="text-amber-600">★{{ inf.rating }}</span> }
                      <button type="button" class="text-red-400 hover:text-red-600 ml-1" (click)="unlinkInfluencer(inf.id)">×</button>
                    </div>
                  }
                  @if (opp()!.influencers.length === 0) {
                    <span class="text-sm text-gray-400">None linked</span>
                  }
                </div>
              </div>
            </div>
          </div>
        </div>

        @if (serverError) {
          <div class="p-3 mb-4 bg-red-50 border border-red-200 rounded text-sm text-red-700">{{ serverError }}</div>
        }

        <div class="flex justify-end gap-2 mb-6">
          <p-button label="Cancel" severity="secondary" [outlined]="true" (onClick)="goBack()" />
          <p-button label="Save Changes" type="submit" icon="pi pi-save" [loading]="saving" [disabled]="form.pristine || form.invalid || saving" />
        </div>
      </form>

      <!-- Cost of Sale Section -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-gray-700 flex items-center gap-2">
            <i class="pi pi-wallet text-purple-600"></i> Cost of Sale
          </h3>
          <p-button label="Add Cost Entry" icon="pi pi-plus" size="small" (onClick)="openCosDialog()" />
        </div>

        <!-- Summary Cards -->
        @if (cosSummary()) {
          <div class="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
            <div class="bg-green-50 rounded-lg p-3 border border-green-200">
              <div class="text-xs text-green-600 font-medium">Spent</div>
              <div class="text-lg font-bold text-green-800">{{ formatRupees(cosSummary()!.byStatus['SPENT'] || 0) }}</div>
            </div>
            <div class="bg-yellow-50 rounded-lg p-3 border border-yellow-200">
              <div class="text-xs text-yellow-600 font-medium">Committed</div>
              <div class="text-lg font-bold text-yellow-800">{{ formatRupees(cosSummary()!.byStatus['COMMITTED'] || 0) }}</div>
            </div>
            <div class="bg-blue-50 rounded-lg p-3 border border-blue-200">
              <div class="text-xs text-blue-600 font-medium">Projected</div>
              <div class="text-lg font-bold text-blue-800">{{ formatRupees(cosSummary()!.byStatus['PROJECTED'] || 0) }}</div>
            </div>
            <div class="bg-purple-50 rounded-lg p-3 border border-purple-200">
              <div class="text-xs text-purple-600 font-medium">Grand Total</div>
              <div class="text-lg font-bold text-purple-800">{{ formatRupees(cosSummary()!.grandTotal) }}</div>
            </div>
            <div class="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <div class="text-xs text-gray-500 font-medium">Contract Value</div>
              <div class="text-lg font-bold text-gray-800">{{ formatRupees(opp()!.contractValuePaise || 0) }}</div>
            </div>
          </div>
        }

        <!-- Entries Table -->
        <p-table [value]="cosEntries()" styleClass="p-datatable-sm" [rows]="20">
          <ng-template pTemplate="header">
            <tr>
              <th>Date</th><th>Category</th><th>Description</th><th class="text-right">Amount (₹)</th><th>Status</th><th style="width:100px">Actions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-entry>
            <tr>
              <td>{{ entry.entryDate | date:'mediumDate' }}</td>
              <td>{{ categoryLabel(entry.category) }}</td>
              <td>{{ entry.description }}</td>
              <td class="text-right font-medium">{{ formatRupees(entry.amountPaise) }}</td>
              <td><p-tag [value]="entry.status" [severity]="cosStatusSeverity(entry.status)" /></td>
              <td>
                <div class="flex gap-1">
                  <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small" (onClick)="openCosDialog(entry)" />
                  <p-button icon="pi pi-trash" [text]="true" [rounded]="true" size="small" severity="danger" (onClick)="deleteCosEntry(entry.id)" />
                </div>
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td colspan="6" class="text-center text-gray-400 py-4">No cost entries yet</td></tr>
          </ng-template>
        </p-table>
      </div>

      <!-- Activities Panel -->
      <div class="mt-6">
        <app-activity-panel entityType="OPPORTUNITY" [entityId]="opp()!.id" />
      </div>

      <!-- Link Influencer Dialog -->
      <p-dialog header="Link Influencer" [(visible)]="linkDialogVisible" [modal]="true" [style]="{width:'400px'}">
        <div class="flex flex-col gap-3 pt-2">
          <p-select appendTo="body" [(ngModel)]="selectedInfluencerId" [options]="influencerOptions()" optionLabel="name" optionValue="id"
                    [filter]="true" filterBy="name" placeholder="Select influencer" class="w-full" />
        </div>
        <ng-template pTemplate="footer">
          <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="linkDialogVisible=false" />
          <p-button label="Link" icon="pi pi-link" [disabled]="!selectedInfluencerId" (onClick)="linkInfluencer()" />
        </ng-template>
      </p-dialog>

      <!-- Cost of Sale Entry Dialog -->
      <p-dialog [header]="cosEditId ? 'Edit Cost Entry' : 'Add Cost Entry'" [(visible)]="cosDialogVisible" [modal]="true" [style]="{width:'500px'}">
        <form [formGroup]="cosForm" class="flex flex-col gap-4 pt-2">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Category *</label>
            <p-select appendTo="body" formControlName="category" [options]="cosCategories" optionLabel="label" optionValue="value" class="w-full" />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Date *</label>
              <p-datepicker appendTo="body" formControlName="entryDate" dateFormat="yy-mm-dd" class="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Status</label>
              <p-select appendTo="body" formControlName="status" [options]="cosStatuses" optionLabel="label" optionValue="value" class="w-full" />
            </div>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Amount (₹) *</label>
            <p-inputNumber formControlName="amountRupees" mode="currency" currency="INR" locale="en-IN" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Description *</label>
            <textarea pTextarea formControlName="description" [rows]="2" class="w-full"></textarea>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Receipt Ref</label>
            <input pInputText formControlName="receiptRef" class="w-full" />
          </div>
        </form>
        <ng-template pTemplate="footer">
          <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="cosDialogVisible=false" />
          <p-button [label]="cosEditId ? 'Update' : 'Add'" icon="pi pi-check" [disabled]="cosForm.invalid" (onClick)="saveCosEntry()" />
        </ng-template>
      </p-dialog>
    }
  `,
})
export class OpportunityDetailComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly msg = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  opp = signal<Opportunity | null>(null);
  loading = signal(true);
  saving = false;
  serverError = '';

  buOptions = signal<Ref[]>([]);
  accountOptions = signal<Ref[]>([]);
  contactOptions = signal<Ref[]>([]);
  userOptions = signal<Ref[]>([]);
  influencerOptions = signal<Ref[]>([]);
  stageOptions = signal<LookupItem[]>([]);
  entryPathOptions = signal<LookupItem[]>([]);
  linkDialogVisible = false;
  selectedInfluencerId = '';

  // Cost of Sale
  cosEntries = signal<CosEntry[]>([]);
  cosSummary = signal<CosSummary | null>(null);
  cosDialogVisible = false;
  cosEditId: string | null = null;
  cosCategories = COS_CATEGORIES;
  cosStatuses = COS_STATUSES;

  form = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(255)]],
    stage: [''],
    entryPath: [''],
    contractValueRupees: [null as number | null],
    probabilityPct: [null as number | null],
    businessUnitId: ['', Validators.required],
    ownerUserId: [''],
    accountId: [''],
    endClientAccountId: [''],
    contactIds: [[] as string[]],
  });

  cosForm = this.fb.group({
    category: ['', Validators.required],
    entryDate: [null as Date | null, Validators.required],
    amountRupees: [null as number | null, [Validators.required, Validators.min(0)]],
    status: ['SPENT', Validators.required],
    description: ['', [Validators.required, Validators.maxLength(500)]],
    receiptRef: [''],
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.loadOpp(id);
    this.loadOptions();
  }

  private loadOpp(id: string): void {
    this.loading.set(true);
    this.http.get<{ data: Opportunity }>(`${environment.apiBaseUrl}/opportunities/${id}`).subscribe({
      next: (r) => {
        this.opp.set(r.data);
        this.form.patchValue({
          title: r.data.title, stage: r.data.stage, entryPath: r.data.entryPath,
          contractValueRupees: r.data.contractValuePaise ? r.data.contractValuePaise / 100 : null,
          probabilityPct: r.data.probabilityPct,
          businessUnitId: r.data.businessUnitId,
          ownerUserId: r.data.ownerUserId ?? '',
          accountId: r.data.accountId ?? '', endClientAccountId: r.data.endClientAccountId ?? '',
          contactIds: r.data.contacts.map((c) => c.id),
        });
        this.form.markAsPristine();
        this.loading.set(false);
        this.loadCostOfSale(id);
      },
      error: () => { this.opp.set(null); this.loading.set(false); },
    });
  }

  private loadOptions(): void {
    this.http.get<{ data: Ref[] }>(`${environment.apiBaseUrl}/business-units?limit=200`).subscribe({ next: (r) => this.buOptions.set(r.data) });
    this.http.get<{ data: Ref[] }>(`${environment.apiBaseUrl}/accounts?limit=200`).subscribe({ next: (r) => this.accountOptions.set(r.data) });
    this.http.get<{ data: Array<{ id: string; firstName: string; lastName: string | null }> }>(`${environment.apiBaseUrl}/contacts?limit=200`).subscribe({
      next: (r) => this.contactOptions.set(r.data.map((c) => ({ id: c.id, name: `${c.firstName}${c.lastName ? ' ' + c.lastName : ''}` }))),
    });
    this.http.get<{ data: Array<{ id: string; fullName: string }> }>(`${environment.apiBaseUrl}/users?limit=200`).subscribe({
      next: (r) => this.userOptions.set(r.data.map((u) => ({ id: u.id, name: u.fullName }))),
    });
    this.http.get<{ data: Ref[] }>(`${environment.apiBaseUrl}/influencers?limit=200`).subscribe({ next: (r) => this.influencerOptions.set(r.data) });
    this.http.get<{ data: LookupItem[] }>(`${environment.apiBaseUrl}/lookup-lists/by-code/opportunity_stage/items`).subscribe({
      next: (r) => this.stageOptions.set(r.data.filter((i) => i.isActive !== false)),
      error: () => {},
    });
    this.http.get<{ data: LookupItem[] }>(`${environment.apiBaseUrl}/lookup-lists/by-code/entry_path/items`).subscribe({
      next: (r) => this.entryPathOptions.set(r.data.filter((i) => i.isActive !== false)),
      error: () => {},
    });
  }

  // ---- Cost of Sale ----

  private loadCostOfSale(oppId: string): void {
    this.http.get<{ data: CosEntry[]; summary: CosSummary }>(`${environment.apiBaseUrl}/opportunities/${oppId}/cost-of-sale?limit=200`).subscribe({
      next: (r) => { this.cosEntries.set(r.data); this.cosSummary.set(r.summary); },
      error: () => {},
    });
  }

  openCosDialog(entry?: CosEntry): void {
    if (entry) {
      this.cosEditId = entry.id;
      this.cosForm.patchValue({
        category: entry.category,
        entryDate: new Date(entry.entryDate),
        amountRupees: entry.amountPaise / 100,
        status: entry.status,
        description: entry.description,
        receiptRef: entry.receiptRef ?? '',
      });
    } else {
      this.cosEditId = null;
      this.cosForm.reset({ status: 'SPENT' });
    }
    this.cosDialogVisible = true;
  }

  saveCosEntry(): void {
    if (this.cosForm.invalid || !this.opp()) return;
    const v = this.cosForm.value;
    const body: Record<string, unknown> = {
      category: v.category,
      entryDate: v.entryDate instanceof Date ? v.entryDate.toISOString().slice(0, 10) : v.entryDate,
      amountPaise: v.amountRupees != null ? Math.round(v.amountRupees * 100) : 0,
      status: v.status,
      description: v.description,
      receiptRef: v.receiptRef || undefined,
    };

    const url = `${environment.apiBaseUrl}/opportunities/${this.opp()!.id}/cost-of-sale`;
    const req$ = this.cosEditId
      ? this.http.patch(`${url}/${this.cosEditId}`, body)
      : this.http.post(url, body);

    req$.subscribe({
      next: () => {
        this.cosDialogVisible = false;
        this.loadCostOfSale(this.opp()!.id);
        this.msg.add({ severity: 'success', summary: 'Saved', detail: `Cost entry ${this.cosEditId ? 'updated' : 'added'}` });
      },
      error: (err: HttpErrorResponse) => this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed' }),
    });
  }

  deleteCosEntry(entryId: string): void {
    this.confirm.confirm({
      message: 'Delete this cost entry?',
      accept: () => {
        this.http.delete(`${environment.apiBaseUrl}/opportunities/${this.opp()!.id}/cost-of-sale/${entryId}`).subscribe({
          next: () => {
            this.loadCostOfSale(this.opp()!.id);
            this.msg.add({ severity: 'success', summary: 'Deleted' });
          },
        });
      },
    });
  }

  categoryLabel(code: string): string { return CATEGORY_LABELS[code] ?? code; }

  cosStatusSeverity(s: string): 'success' | 'warn' | 'info' {
    if (s === 'SPENT') return 'success';
    if (s === 'COMMITTED') return 'warn';
    return 'info';
  }

  formatRupees(paise: number): string {
    return '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  // ---- Opportunity Save ----

  onSave(): void {
    if (this.form.invalid || !this.opp()) return;
    this.saving = true; this.serverError = '';
    const v = this.form.value;
    const body: Record<string, unknown> = {
      title: v.title, stage: v.stage, entryPath: v.entryPath,
      businessUnitId: v.businessUnitId,
      accountId: v.accountId || null,
      endClientAccountId: v.endClientAccountId || null,
      ownerUserId: v.ownerUserId || null,
      probabilityPct: v.probabilityPct,
      contactIds: v.contactIds,
    };
    if (v.contractValueRupees != null) body['contractValuePaise'] = Math.round(v.contractValueRupees * 100);
    else body['contractValuePaise'] = null;

    this.http.patch<{ data: Opportunity }>(`${environment.apiBaseUrl}/opportunities/${this.opp()!.id}`, body).subscribe({
      next: (r) => {
        this.saving = false; this.opp.set(r.data); this.form.markAsPristine();
        this.msg.add({ severity: 'success', summary: 'Saved', detail: 'Opportunity updated' });
      },
      error: (err: HttpErrorResponse) => { this.saving = false; this.serverError = err.error?.error?.message ?? 'Error'; },
    });
  }

  linkInfluencer(): void {
    if (!this.opp() || !this.selectedInfluencerId) return;
    this.http.post(`${environment.apiBaseUrl}/opportunities/${this.opp()!.id}/influencers`, { influencerId: this.selectedInfluencerId }).subscribe({
      next: () => { this.linkDialogVisible = false; this.selectedInfluencerId = ''; this.loadOpp(this.opp()!.id); },
      error: (err: HttpErrorResponse) => this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed' }),
    });
  }

  unlinkInfluencer(influencerId: string): void {
    this.http.delete(`${environment.apiBaseUrl}/opportunities/${this.opp()!.id}/influencers/${influencerId}`).subscribe({
      next: () => this.loadOpp(this.opp()!.id),
    });
  }

  goBack(): void { this.router.navigate(['/sales/opportunities']); }

  stageSeverity(s: string): 'info' | 'success' | 'warn' | 'danger' {
    const sl = s.toLowerCase();
    if (sl.includes('award')) return 'success';
    if (sl.includes('lost')) return 'danger';
    if (sl.includes('bid')) return 'warn';
    return 'info';
  }
}
