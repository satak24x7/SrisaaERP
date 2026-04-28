import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ReactiveFormsModule, FormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TableModule } from 'primeng/table';
import { DatePickerModule } from 'primeng/datepicker';
import { TextareaModule } from 'primeng/textarea';
import { ConfirmationService, MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';

interface Ref { id: string; name: string; }
interface LineRow { id: string; category: string; vendorName: string | null; expenseDate: string; description: string; amountPaise: number; gstPaise: number; paymentMode: string; attachmentName: string | null; attachmentPath: string | null; }
interface ExpenseSheet {
  id: string; title: string; sheetType: string; status: string;
  claimantId: string; claimantName: string;
  businessUnitId: string | null; businessUnitName: string | null;
  opportunityId: string | null; projectId: string | null; costCentre: string | null;
  periodFrom: string; periodTo: string; notes: string | null;
  totalPaise: number; linesTotal: number; gstTotal: number; grandTotal: number; lineCount: number;
  paymentPaise: number; paymentDate: string | null; paymentRef: string | null;
  lines: LineRow[];
  createdAt: string; updatedAt: string;
}

const SHEET_TYPES = [
  { label: 'Pre-Project', value: 'PRE_PROJECT' }, { label: 'During Project', value: 'DURING_PROJECT' },
  { label: 'Admin / General', value: 'ADMIN_GENERAL' }, { label: 'Reimbursement', value: 'REIMBURSEMENT' },
];
const PAYMENT_MODES = [
  { label: 'NEFT', value: 'NEFT' }, { label: 'Cheque', value: 'CHEQUE' },
  { label: 'Cash', value: 'CASH' }, { label: 'UPI', value: 'UPI' },
  { label: 'Card', value: 'CARD' }, { label: 'Other', value: 'OTHER' },
];

@Component({
  selector: 'app-expense-sheet-detail',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, ButtonModule, InputTextModule, SelectModule, InputNumberModule, TagModule, DialogModule, ToastModule, ConfirmDialogModule, TableModule, DatePickerModule, TextareaModule],
  providers: [MessageService, ConfirmationService],
  template: `
    <p-toast /><p-confirmDialog />

    @if (loading()) {
      <div class="flex items-center justify-center h-64"><i class="pi pi-spin pi-spinner text-4xl text-blue-500"></i></div>
    } @else {
      <div class="p-6 max-w-6xl mx-auto">
        <!-- Header -->
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            <p-button icon="pi pi-arrow-left" [text]="true" [rounded]="true" (onClick)="goBack()" />
            <h2 class="text-2xl font-bold text-gray-800">{{ isCreateMode ? 'New Expense Sheet' : sheet()?.title }}</h2>
            @if (!isCreateMode && sheet()) {
              <p-tag [value]="sheet()!.status" [severity]="statusSeverity(sheet()!.status)" />
            }
          </div>
          @if (!isCreateMode && sheet()) {
            <div class="flex gap-2">
              @if (sheet()!.status === 'DRAFT') {
                <p-button label="Submit for Approval" icon="pi pi-send" severity="info" (onClick)="transition('submit')" />
              }
              @if (sheet()!.status === 'SUBMITTED') {
                <p-button label="Approve" icon="pi pi-check" severity="success" (onClick)="transition('approve')" />
                <p-button label="Reject" icon="pi pi-times" severity="danger" (onClick)="transition('reject')" />
              }
              @if (sheet()!.status === 'REJECTED') {
                <p-button label="Revise" icon="pi pi-refresh" severity="warn" (onClick)="transition('revise')" />
              }
            </div>
          }
        </div>

        <!-- Form -->
        <form [formGroup]="form" (ngSubmit)="onSave()">
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 class="text-lg font-semibold text-gray-700 mb-4"><i class="pi pi-file-edit text-blue-600"></i> Sheet Details</h3>
              <div class="flex flex-col gap-4">
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Title *</label>
                  <input pInputText formControlName="title" class="w-full" />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Type *</label>
                  <p-select appendTo="body" formControlName="sheetType" [options]="sheetTypes" optionLabel="label" optionValue="value" class="w-full" />
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-gray-700">Period From *</label>
                    <p-datepicker appendTo="body" formControlName="periodFrom" dateFormat="yy-mm-dd" class="w-full" />
                  </div>
                  <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-gray-700">Period To *</label>
                    <p-datepicker appendTo="body" formControlName="periodTo" dateFormat="yy-mm-dd" class="w-full" />
                  </div>
                </div>
              </div>
            </div>
            <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 class="text-lg font-semibold text-gray-700 mb-4"><i class="pi pi-users text-green-600"></i> Assignment</h3>
              <div class="flex flex-col gap-4">
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Claimant *</label>
                  <p-select appendTo="body" formControlName="claimantUserId" [options]="userOptions()" optionLabel="name" optionValue="id" [filter]="true" class="w-full" />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Business Unit</label>
                  <p-select appendTo="body" formControlName="businessUnitId" [options]="buOptions()" optionLabel="name" optionValue="id" [filter]="true" [showClear]="true" class="w-full" />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Notes</label>
                  <textarea pTextarea formControlName="notes" [rows]="2" class="w-full"></textarea>
                </div>
              </div>
            </div>
          </div>

          @if (serverError) {
            <div class="p-3 mb-4 bg-red-50 border border-red-200 rounded text-sm text-red-700">{{ serverError }}</div>
          }
          <div class="flex justify-end gap-2 mb-6">
            <p-button label="Cancel" severity="secondary" [outlined]="true" (onClick)="goBack()" />
            <p-button [label]="isCreateMode ? 'Create Expense Sheet' : 'Save Changes'" type="submit" icon="pi pi-save" [loading]="saving" [disabled]="(!isCreateMode && form.pristine) || form.invalid || saving" />
          </div>
        </form>

        <!-- Lines (only in edit mode) -->
        @if (!isCreateMode && sheet()) {
          <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-semibold text-gray-700"><i class="pi pi-list text-indigo-600"></i> Expense Lines</h3>
              @if (sheet()!.status === 'DRAFT') {
                <p-button label="Add Line" icon="pi pi-plus" size="small" (onClick)="openLineDialog()" />
              }
            </div>
            <p-table [value]="sheet()!.lines" styleClass="p-datatable-sm">
              <ng-template pTemplate="header">
                <tr>
                  <th>Date</th><th>Category</th><th>Vendor</th><th>Description</th><th class="text-right">Amount (₹)</th><th class="text-right">GST (₹)</th><th>Mode</th><th>Proof</th><th style="width:100px">Actions</th>
                </tr>
              </ng-template>
              <ng-template pTemplate="body" let-l>
                <tr>
                  <td>{{ l.expenseDate | date:'mediumDate' }}</td>
                  <td><p-tag [value]="l.category" severity="info" /></td>
                  <td>{{ l.vendorName || '-' }}</td>
                  <td>{{ l.description }}</td>
                  <td class="text-right font-medium">{{ formatRupees(l.amountPaise) }}</td>
                  <td class="text-right">{{ formatRupees(l.gstPaise) }}</td>
                  <td>{{ l.paymentMode }}</td>
                  <td>
                    @if (l.attachmentName) {
                      <a class="text-blue-600 hover:underline cursor-pointer text-sm flex items-center gap-1" (click)="downloadAttachment(l)">
                        <i class="pi pi-paperclip"></i> {{ l.attachmentName }}
                      </a>
                    } @else { <span class="text-gray-400">-</span> }
                  </td>
                  <td>
                    <div class="flex gap-1">
                      @if (sheet()!.status === 'DRAFT') {
                        <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small" (onClick)="openLineDialog(l)" />
                        <p-button icon="pi pi-trash" [text]="true" [rounded]="true" size="small" severity="danger" (onClick)="deleteLine(l.id)" />
                      }
                    </div>
                  </td>
                </tr>
              </ng-template>
              <ng-template pTemplate="emptymessage">
                <tr><td colspan="9" class="text-center text-gray-400 py-4">No expense lines yet</td></tr>
              </ng-template>
            </p-table>

            <!-- Summary -->
            @if (sheet()!.lines.length > 0) {
              <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
                <div class="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <div class="text-xs text-blue-600 font-medium">Lines Total</div>
                  <div class="text-xl font-bold text-blue-800">{{ formatRupees(sheet()!.linesTotal) }}</div>
                </div>
                <div class="bg-purple-50 rounded-lg p-4 border border-purple-200">
                  <div class="text-xs text-purple-600 font-medium">GST Total</div>
                  <div class="text-xl font-bold text-purple-800">{{ formatRupees(sheet()!.gstTotal) }}</div>
                </div>
                <div class="bg-green-50 rounded-lg p-4 border border-green-200">
                  <div class="text-xs text-green-600 font-medium">Grand Total</div>
                  <div class="text-xl font-bold text-green-800">{{ formatRupees(sheet()!.grandTotal) }}</div>
                </div>
                <div class="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <div class="text-xs text-gray-500 font-medium">{{ sheet()!.lines.length }} line(s)</div>
                  <div class="text-lg font-semibold">{{ sheet()!.status }}</div>
                </div>
              </div>
            }
          </div>
        }
      </div>
    }

    <!-- Line Dialog -->
    <p-dialog [header]="lineEditId ? 'Edit Expense Line' : 'Add Expense Line'" [(visible)]="lineDialogVisible" [modal]="true" [style]="{width:'550px'}">
      <form [formGroup]="lineForm" class="flex flex-col gap-4 pt-2">
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Date *</label>
            <p-datepicker appendTo="body" formControlName="expenseDate" dateFormat="yy-mm-dd" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Category *</label>
            <input pInputText formControlName="category" class="w-full" placeholder="e.g. Stationery, Hardware" />
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Vendor Name</label>
          <input pInputText formControlName="vendorName" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Description *</label>
          <textarea pTextarea formControlName="description" [rows]="2" class="w-full"></textarea>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Amount (₹) *</label>
            <p-inputNumber formControlName="amountRupees" mode="currency" currency="INR" locale="en-IN" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">GST (₹)</label>
            <p-inputNumber formControlName="gstRupees" mode="currency" currency="INR" locale="en-IN" class="w-full" />
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Payment Mode</label>
          <p-select appendTo="body" formControlName="paymentMode" [options]="paymentModes" optionLabel="label" optionValue="value" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Bill / Receipt Attachment</label>
          <input type="file" (change)="onFileSelect($event)" accept="image/*,.pdf" class="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
          @if (existingFileName && !selectedFile) {
            <div class="flex items-center gap-2 mt-1 text-sm text-gray-600">
              <i class="pi pi-paperclip"></i>
              <span>{{ existingFileName }}</span>
              <p-button icon="pi pi-times" [text]="true" [rounded]="true" size="small" severity="danger" (onClick)="removeAttachment = true; existingFileName = ''" />
            </div>
          }
        </div>
      </form>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="lineDialogVisible=false" />
        <p-button [label]="lineEditId ? 'Update' : 'Add'" icon="pi pi-check" [disabled]="lineForm.invalid" (onClick)="saveLine()" />
      </ng-template>
    </p-dialog>
  `,
})
export class ExpenseSheetDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly msg = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  sheet = signal<ExpenseSheet | null>(null);
  loading = signal(true);
  saving = false;
  serverError = '';
  isCreateMode = false;

  userOptions = signal<Ref[]>([]);
  buOptions = signal<Ref[]>([]);

  sheetTypes = SHEET_TYPES;
  paymentModes = PAYMENT_MODES;

  // Line dialog
  lineDialogVisible = false;
  lineEditId: string | null = null;
  selectedFile: File | null = null;
  existingFileName = '';
  removeAttachment = false;

  form = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(255)]],
    sheetType: ['ADMIN_GENERAL', Validators.required],
    claimantUserId: ['', Validators.required],
    businessUnitId: [''],
    periodFrom: [null as Date | null, Validators.required],
    periodTo: [null as Date | null, Validators.required],
    notes: [''],
  });

  lineForm = this.fb.group({
    expenseDate: [null as Date | null, Validators.required],
    category: ['', [Validators.required, Validators.maxLength(64)]],
    vendorName: [''],
    description: ['', [Validators.required, Validators.maxLength(500)]],
    amountRupees: [null as number | null, [Validators.required, Validators.min(0)]],
    gstRupees: [null as number | null],
    paymentMode: ['NEFT'],
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.isCreateMode = !id || id === 'new';
    if (this.isCreateMode) {
      this.loading.set(false);
    } else {
      this.loadSheet(id!);
    }
    this.loadOptions();
  }

  private loadSheet(id: string, restoreScroll = false): void {
    const scrollY = restoreScroll ? window.scrollY : 0;
    this.http.get<{ data: ExpenseSheet }>(`${environment.apiBaseUrl}/expense-sheets/${id}`).subscribe({
      next: (r) => {
        this.sheet.set(r.data);
        this.form.patchValue({
          title: r.data.title, sheetType: r.data.sheetType,
          claimantUserId: r.data.claimantId,
          businessUnitId: r.data.businessUnitId ?? '',
          periodFrom: new Date(r.data.periodFrom + 'T00:00:00'),
          periodTo: new Date(r.data.periodTo + 'T00:00:00'),
          notes: r.data.notes ?? '',
        });
        this.form.markAsPristine();
        this.loading.set(false);
        if (restoreScroll) setTimeout(() => window.scrollTo({ top: scrollY }), 0);
      },
      error: () => { this.sheet.set(null); this.loading.set(false); },
    });
  }

  private loadOptions(): void {
    this.http.get<{ data: Array<{ id: string; fullName: string }> }>(`${environment.apiBaseUrl}/users?limit=200`).subscribe({
      next: (r) => this.userOptions.set(r.data.map((u) => ({ id: u.id, name: u.fullName }))),
    });
    this.http.get<{ data: Ref[] }>(`${environment.apiBaseUrl}/business-units?limit=200`).subscribe({
      next: (r) => this.buOptions.set(r.data),
    });
  }

  goBack(): void { this.router.navigate(['/work-area/expense-sheets']); }

  onSave(): void {
    if (this.form.invalid) return;
    this.saving = true;
    this.serverError = '';
    const v = this.form.value;
    const body: Record<string, unknown> = {
      title: v.title, sheetType: v.sheetType,
      claimantUserId: v.claimantUserId,
      businessUnitId: v.businessUnitId || null,
      periodFrom: v.periodFrom instanceof Date ? this.toLocalDateStr(v.periodFrom) : v.periodFrom,
      periodTo: v.periodTo instanceof Date ? this.toLocalDateStr(v.periodTo) : v.periodTo,
      notes: v.notes || null,
    };

    if (this.isCreateMode) {
      this.http.post<{ data: ExpenseSheet }>(`${environment.apiBaseUrl}/expense-sheets`, body).subscribe({
        next: (r) => { this.saving = false; this.msg.add({ severity: 'success', summary: 'Created' }); this.router.navigate(['/work-area/expense-sheets', r.data.id]); },
        error: (err: HttpErrorResponse) => { this.saving = false; this.serverError = err.error?.error?.message ?? 'Error'; },
      });
    } else {
      this.http.patch<{ data: ExpenseSheet }>(`${environment.apiBaseUrl}/expense-sheets/${this.sheet()!.id}`, body).subscribe({
        next: () => { this.saving = false; this.msg.add({ severity: 'success', summary: 'Saved' }); this.loadSheet(this.sheet()!.id); },
        error: (err: HttpErrorResponse) => { this.saving = false; this.serverError = err.error?.error?.message ?? 'Error'; },
      });
    }
  }

  transition(action: string): void {
    this.http.post(`${environment.apiBaseUrl}/expense-sheets/${this.sheet()!.id}/${action}`, {}).subscribe({
      next: () => { this.msg.add({ severity: 'success', summary: 'Updated', detail: action }); this.loadSheet(this.sheet()!.id); },
      error: (err: HttpErrorResponse) => { this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed' }); },
    });
  }

  // --- Lines ---

  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFile = input.files?.[0] ?? null;
  }

  openLineDialog(line?: LineRow): void {
    if (line) {
      this.lineEditId = line.id;
      this.lineForm.patchValue({
        expenseDate: new Date(line.expenseDate), category: line.category,
        vendorName: line.vendorName ?? '', description: line.description,
        amountRupees: line.amountPaise / 100, gstRupees: line.gstPaise / 100,
        paymentMode: line.paymentMode,
      });
      this.existingFileName = line.attachmentName ?? '';
    } else {
      this.lineEditId = null;
      this.lineForm.reset({ paymentMode: 'NEFT' });
      this.existingFileName = '';
    }
    this.selectedFile = null;
    this.removeAttachment = false;
    this.lineDialogVisible = true;
  }

  saveLine(): void {
    if (this.lineForm.invalid || !this.sheet()) return;
    const v = this.lineForm.value;
    const fd = new FormData();
    fd.append('expenseDate', v.expenseDate instanceof Date ? this.toLocalDateStr(v.expenseDate) : (v.expenseDate ?? ''));
    fd.append('category', v.category ?? '');
    fd.append('vendorName', v.vendorName ?? '');
    fd.append('description', v.description ?? '');
    fd.append('amountPaise', String(v.amountRupees != null ? Math.round(v.amountRupees * 100) : 0));
    fd.append('gstPaise', String(v.gstRupees != null ? Math.round(v.gstRupees * 100) : 0));
    fd.append('paymentMode', v.paymentMode ?? 'NEFT');
    if (this.selectedFile) fd.append('file', this.selectedFile);
    if (this.removeAttachment) fd.append('removeAttachment', 'true');

    const baseUrl = `${environment.apiBaseUrl}/expense-sheets/${this.sheet()!.id}/lines`;
    const req$ = this.lineEditId
      ? this.http.patch(`${baseUrl}/${this.lineEditId}`, fd)
      : this.http.post(baseUrl, fd);

    req$.subscribe({
      next: () => {
        this.lineDialogVisible = false;
        this.selectedFile = null;
        this.msg.add({ severity: 'success', summary: 'Saved', detail: `Line ${this.lineEditId ? 'updated' : 'added'}` });
        this.loadSheet(this.sheet()!.id, true);
      },
      error: (err: HttpErrorResponse) => {
        this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed to save line' });
      },
    });
  }

  deleteLine(lineId: string): void {
    this.confirm.confirm({
      message: 'Delete this line?',
      accept: () => {
        this.http.delete(`${environment.apiBaseUrl}/expense-sheets/${this.sheet()!.id}/lines/${lineId}`).subscribe({
          next: () => { this.msg.add({ severity: 'success', summary: 'Deleted' }); this.loadSheet(this.sheet()!.id, true); },
          error: (err: HttpErrorResponse) => { this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed' }); },
        });
      },
    });
  }

  downloadAttachment(line: LineRow): void {
    if (!line.attachmentPath || !this.sheet()) return;
    this.http.get(`${environment.apiBaseUrl}/expense-sheets/${this.sheet()!.id}/lines/${line.id}/download`, { responseType: 'blob' }).subscribe({
      next: (blob) => { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = line.attachmentName ?? 'attachment'; a.click(); URL.revokeObjectURL(url); },
      error: () => { this.msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to download' }); },
    });
  }

  formatRupees(paise: number): string { return '\u20B9' + ((paise ?? 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
  toLocalDateStr(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  statusSeverity(s: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    switch (s) { case 'PAID': return 'success'; case 'APPROVED': return 'info'; case 'SUBMITTED': return 'warn'; case 'REJECTED': return 'danger'; default: return 'secondary'; }
  }
}
