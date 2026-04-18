import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { DialogModule } from 'primeng/dialog';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';

interface Company {
  id: string;
  legalName: string;
  cin: string | null;
  logoUri: string | null;
  registeredAddress: string | null;
  corporateAddress: string | null;
  pan: string | null;
  tan: string | null;
  gstin: string | null;
}

interface BankAccount {
  id: string;
  bankName: string;
  accountName: string;
  accountNo: string;
  ifsc: string;
  branch: string | null;
  purpose: string;
}

interface CompanyDocument {
  id: string;
  name: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
}

@Component({
  selector: 'app-company-profile',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, FormsModule, DragDropModule, ButtonModule,
    InputTextModule, TextareaModule, SelectModule, TableModule, TagModule,
    ToastModule, DialogModule, ConfirmDialogModule,
  ],
  providers: [MessageService, ConfirmationService],
  template: `
    <p-toast />
    <p-confirmDialog />

    <div class="mb-6">
      <h2 class="text-2xl font-semibold text-gray-800">Company Profile</h2>
      <p class="text-sm text-gray-500 mt-1">Your organization's legal, contact and financial details</p>
    </div>

    @if (loading()) {
      <div class="flex items-center gap-2 text-gray-500 py-12 justify-center">
        <i class="pi pi-spin pi-spinner text-2xl"></i> Loading...
      </div>
    } @else {
      <form [formGroup]="form" (ngSubmit)="onSave()">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

          <!-- Organization Details (left) -->
          <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 class="text-lg font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <i class="pi pi-building text-blue-600"></i>
              Organization Details
            </h3>
            <div class="flex flex-col gap-4">
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Legal Name *</label>
                <input pInputText formControlName="legalName" class="w-full" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Logo URL</label>
                <input pInputText formControlName="logoUri" placeholder="https://..." class="w-full" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Registered Address</label>
                <textarea pTextarea formControlName="registeredAddress" rows="3" class="w-full"></textarea>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Corporate Address</label>
                <textarea pTextarea formControlName="corporateAddress" rows="3" class="w-full"></textarea>
              </div>
            </div>
          </div>

          <!-- Statutory Information (right) -->
          <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 class="text-lg font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <i class="pi pi-id-card text-green-600"></i>
              Statutory Information
            </h3>
            <div class="flex flex-col gap-4">
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">CIN (Corporate Identity Number)</label>
                <input pInputText formControlName="cin" placeholder="U74999MH2020PTC123456" class="w-full" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">PAN Number</label>
                <input pInputText formControlName="pan" placeholder="ABCDE1234F"
                       maxlength="10" class="w-full uppercase" />
                @if (form.controls.pan.touched && form.controls.pan.errors) {
                  <small class="text-red-500">Format: XXXXX9999X (10 characters)</small>
                }
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">TAN Number</label>
                <input pInputText formControlName="tan" placeholder="MUMB12345A"
                       maxlength="10" class="w-full uppercase" />
                @if (form.controls.tan.touched && form.controls.tan.errors) {
                  <small class="text-red-500">Format: XXXX99999X (10 characters)</small>
                }
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">GST Number</label>
                <input pInputText formControlName="gstin" placeholder="22ABCDE1234F1Z5"
                       maxlength="15" class="w-full uppercase" />
                @if (form.controls.gstin.touched && form.controls.gstin.errors) {
                  <small class="text-red-500">Format: 99XXXXX0000X9XX (15 characters)</small>
                }
              </div>
            </div>
          </div>
        </div>

        @if (serverError) {
          <div class="p-3 mb-4 bg-red-50 border border-red-200 rounded text-sm text-red-700">{{ serverError }}</div>
        }

        <div class="flex justify-end mb-6">
          <p-button label="Save Profile" type="submit" icon="pi pi-save"
                    [loading]="saving" [disabled]="form.pristine || form.invalid || saving" />
        </div>
      </form>

      <!-- Bank Accounts (separate section) -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-gray-700 flex items-center gap-2">
            <i class="pi pi-credit-card text-indigo-600"></i>
            Bank Accounts
          </h3>
          <p-button label="Add Account" icon="pi pi-plus" size="small" (onClick)="openBankDialog()" />
        </div>
        @if (bankAccounts().length === 0) {
          <p class="text-sm text-gray-400 text-center py-6">No bank accounts added</p>
        } @else {
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            @for (ba of bankAccounts(); track ba.id) {
              <div class="flex items-center justify-between bg-gray-50 rounded-lg border border-gray-200 px-4 py-3">
                <div class="min-w-0">
                  <div class="text-sm font-medium text-gray-800 truncate">{{ ba.accountName }}</div>
                  <div class="text-xs text-gray-500">{{ ba.bankName }} &middot; {{ ba.ifsc }}
                    @if (ba.branch) { &middot; {{ ba.branch }} }
                  </div>
                  <div class="text-xs text-gray-400 font-mono">A/C: {{ ba.accountNo }}</div>
                </div>
                <div class="flex items-center gap-1 shrink-0 ml-3">
                  <p-tag [value]="ba.purpose" [severity]="purposeSeverity(ba.purpose)" [style]="{'font-size':'0.65rem'}" />
                  <p-button icon="pi pi-pencil" [text]="true" size="small" severity="info" (onClick)="editBank(ba)" />
                  <p-button icon="pi pi-trash" [text]="true" size="small" severity="danger" (onClick)="confirmDeleteBank(ba)" />
                </div>
              </div>
            }
          </div>
        }
      </div>

      <!-- Company Documents -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-gray-700 flex items-center gap-2">
            <i class="pi pi-folder text-amber-600"></i>
            Company Documents
          </h3>
          <p-button label="Add Document" icon="pi pi-plus" size="small" (onClick)="openDocDialog()" />
        </div>

        @if (docsLoading()) {
          <div class="flex items-center gap-2 text-gray-500 py-6 justify-center">
            <i class="pi pi-spin pi-spinner"></i> Loading documents...
          </div>
        } @else if (documents().length === 0) {
          <div class="text-center py-8 text-gray-400">
            <i class="pi pi-inbox text-4xl mb-2"></i>
            <p>No documents uploaded yet</p>
          </div>
        } @else {
          <div cdkDropListGroup class="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-12 gap-2"
               cdkDropList [cdkDropListData]="documents()" (cdkDropListDropped)="onDocDrop($event)"
               cdkDropListOrientation="mixed">
            @for (doc of documents(); track doc.id) {
              <div cdkDrag class="bg-gray-50 rounded border border-gray-200 px-2 py-3 flex flex-col items-center text-center
                          hover:shadow hover:border-gray-300 transition-shadow cursor-grab active:cursor-grabbing">
                <i [class]="docTypeIcon(doc.mimeType) + ' text-xl mb-1'"
                   [style.color]="docTypeColor(doc.mimeType)"></i>
                <span class="text-[9px] font-bold uppercase tracking-wider px-1.5 py-px rounded-full mb-1.5"
                      [style.background-color]="docTypeColor(doc.mimeType) + '20'"
                      [style.color]="docTypeColor(doc.mimeType)">
                  {{ docTypeLabel(doc.mimeType) }}
                </span>
                <h4 class="text-xs font-medium text-gray-800 line-clamp-2 w-full leading-tight">{{ doc.name }}</h4>
                <p class="text-[10px] text-gray-400 mt-0.5">{{ formatSize(doc.fileSize) }}</p>
                <div class="flex gap-0 mt-1.5" (click)="$event.stopPropagation()">
                  <p-button icon="pi pi-eye" severity="info" [text]="true" size="small"
                            [style]="{'padding':'0.15rem'}" (onClick)="viewDocument(doc)" />
                  <p-button icon="pi pi-pencil" severity="warn" [text]="true" size="small"
                            [style]="{'padding':'0.15rem'}" (onClick)="editDocument(doc)" />
                  <p-button icon="pi pi-trash" severity="danger" [text]="true" size="small"
                            [style]="{'padding':'0.15rem'}" (onClick)="confirmDeleteDocument(doc)" />
                </div>
                <div *cdkDragPlaceholder class="bg-blue-100 border-2 border-dashed border-blue-300 rounded w-full h-full min-h-[80px]"></div>
              </div>
            }
          </div>
        }
      </div>

      <!-- Add/Edit Document Dialog -->
      <p-dialog [header]="editingDoc ? 'Change Document' : 'Add Document'"
                [(visible)]="docDialogVisible" [modal]="true" [style]="{width: '480px'}">
        <div class="flex flex-col gap-4 pt-2">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Document Name *</label>
            <input pInputText [(ngModel)]="docName" placeholder="e.g. GST Certificate" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">
              {{ editingDoc ? 'Replace File (optional)' : 'Select File *' }}
            </label>
            <input type="file" (change)="onFileSelect($event)"
                   class="block w-full text-sm text-gray-500
                          file:mr-4 file:py-2 file:px-4 file:rounded file:border-0
                          file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700
                          hover:file:bg-blue-100" />
            @if (editingDoc && !selectedFile) {
              <small class="text-gray-500">Current: {{ editingDoc.fileName }}</small>
            }
          </div>
          @if (docError) {
            <div class="p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">{{ docError }}</div>
          }
        </div>
        <ng-template pTemplate="footer">
          <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="docDialogVisible = false" />
          <p-button [label]="editingDoc ? 'Update' : 'Upload'" icon="pi pi-upload"
                    [loading]="docSaving" [disabled]="!docName.trim() || (!editingDoc && !selectedFile)"
                    (onClick)="saveDocument()" />
        </ng-template>
      </p-dialog>

      <!-- Add/Edit Bank Account Dialog -->
      <p-dialog [header]="editingBank ? 'Edit Bank Account' : 'Add Bank Account'"
                [(visible)]="bankDialogVisible" [modal]="true" [style]="{width: '500px'}">
        <form [formGroup]="bankForm" class="flex flex-col gap-4 pt-2">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Account Name *</label>
            <input pInputText formControlName="accountName" placeholder="e.g. Operating Account" class="w-full" />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Bank Name *</label>
              <input pInputText formControlName="bankName" placeholder="State Bank of India" class="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Branch</label>
              <input pInputText formControlName="branch" placeholder="MG Road, Mumbai" class="w-full" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Account Number *</label>
              <input pInputText formControlName="accountNo" class="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">IFSC Code *</label>
              <input pInputText formControlName="ifsc" placeholder="SBIN0001234" maxlength="11" class="w-full uppercase" />
              @if (bankForm.controls.ifsc.touched && bankForm.controls.ifsc.errors) {
                <small class="text-red-500">11 chars (e.g. SBIN0001234)</small>
              }
            </div>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Purpose *</label>
            <p-select formControlName="purpose" [options]="purposeOptions" optionLabel="label" optionValue="value" class="w-full" />
          </div>
          @if (bankError) {
            <div class="p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">{{ bankError }}</div>
          }
        </form>
        <ng-template pTemplate="footer">
          <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="bankDialogVisible = false" />
          <p-button [label]="editingBank ? 'Save' : 'Add'" icon="pi pi-check"
                    [loading]="bankSaving" [disabled]="bankForm.invalid || bankSaving"
                    (onClick)="saveBank()" />
        </ng-template>
      </p-dialog>
    }
  `,
})
export class CompanyProfileComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly msg = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  loading = signal(true);
  saving = false;
  serverError = '';

  // Bank accounts
  bankAccounts = signal<BankAccount[]>([]);
  bankDialogVisible = false;
  editingBank: BankAccount | null = null;
  bankSaving = false;
  bankError = '';
  purposeOptions = [
    { label: 'EMD', value: 'EMD' },
    { label: 'Receivables', value: 'RECEIVABLES' },
    { label: 'Payroll', value: 'PAYROLL' },
    { label: 'General', value: 'GENERAL' },
  ];
  bankForm = this.fb.group({
    bankName: ['', Validators.required],
    accountName: ['', Validators.required],
    accountNo: ['', Validators.required],
    ifsc: ['', [Validators.required, Validators.pattern(/^[A-Z]{4}0[A-Z0-9]{6}$/)]],
    branch: [''],
    purpose: ['GENERAL', Validators.required],
  });

  // Documents
  documents = signal<CompanyDocument[]>([]);
  docsLoading = signal(true);
  docDialogVisible = false;
  docName = '';
  selectedFile: File | null = null;
  editingDoc: CompanyDocument | null = null;
  docSaving = false;
  docError = '';

  form = this.fb.group({
    legalName: [''],
    cin: [''],
    logoUri: [''],
    registeredAddress: [''],
    corporateAddress: [''],
    pan: ['', [Validators.pattern(/^[A-Z]{5}[0-9]{4}[A-Z]$/)]],
    tan: ['', [Validators.pattern(/^[A-Z]{4}[0-9]{5}[A-Z]$/)]],
    gstin: ['', [Validators.pattern(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z][Z][0-9A-Z]$/)]],
  });

  ngOnInit(): void {
    this.loadCompany();
    this.loadBankAccounts();
    this.loadDocuments();
  }

  private loadCompany(): void {
    this.http.get<{ data: Company }>(`${environment.apiBaseUrl}/company`).subscribe({
      next: (r) => {
        this.form.patchValue({
          legalName: r.data.legalName,
          cin: r.data.cin ?? '',
          logoUri: r.data.logoUri ?? '',
          registeredAddress: r.data.registeredAddress ?? '',
          corporateAddress: r.data.corporateAddress ?? '',
          pan: r.data.pan ?? '',
          tan: r.data.tan ?? '',
          gstin: r.data.gstin ?? '',
        });
        this.form.markAsPristine();
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); },
    });
  }

  private loadBankAccounts(): void {
    this.http.get<{ data: BankAccount[] }>(`${environment.apiBaseUrl}/bank-accounts`).subscribe({
      next: (r) => this.bankAccounts.set(r.data),
    });
  }

  private loadDocuments(): void {
    this.docsLoading.set(true);
    this.http.get<{ data: CompanyDocument[] }>(`${environment.apiBaseUrl}/company-documents`).subscribe({
      next: (r) => { this.documents.set(r.data); this.docsLoading.set(false); },
      error: () => { this.docsLoading.set(false); },
    });
  }

  onSave(): void {
    this.saving = true; this.serverError = '';
    const body: Record<string, unknown> = {};
    const v = this.form.value;
    if (v.legalName) body['legalName'] = v.legalName;
    if (v.cin) body['cin'] = v.cin;
    if (v.logoUri) body['logoUri'] = v.logoUri;
    if (v.registeredAddress) body['registeredAddress'] = v.registeredAddress;
    if (v.corporateAddress) body['corporateAddress'] = v.corporateAddress;
    if (v.pan) body['pan'] = v.pan.toUpperCase();
    if (v.tan) body['tan'] = v.tan.toUpperCase();
    if (v.gstin) body['gstin'] = v.gstin.toUpperCase();

    this.http.patch<{ data: Company }>(`${environment.apiBaseUrl}/company`, body).subscribe({
      next: () => {
        this.saving = false;
        this.form.markAsPristine();
        this.msg.add({ severity: 'success', summary: 'Saved', detail: 'Company profile updated' });
      },
      error: (err: HttpErrorResponse) => {
        this.saving = false;
        this.serverError = err.error?.error?.message ?? 'Failed to save';
      },
    });
  }

  // --- Bank account management ---

  purposeSeverity(purpose: string): 'info' | 'success' | 'warn' | 'danger' {
    switch (purpose) {
      case 'EMD': return 'warn';
      case 'RECEIVABLES': return 'success';
      case 'PAYROLL': return 'info';
      default: return 'info';
    }
  }

  openBankDialog(): void {
    this.editingBank = null;
    this.bankForm.reset({ purpose: 'GENERAL' });
    this.bankError = '';
    this.bankDialogVisible = true;
  }

  editBank(ba: BankAccount): void {
    this.editingBank = ba;
    this.bankForm.patchValue({
      bankName: ba.bankName, accountName: ba.accountName,
      accountNo: ba.accountNo, ifsc: ba.ifsc,
      branch: ba.branch ?? '', purpose: ba.purpose,
    });
    this.bankError = '';
    this.bankDialogVisible = true;
  }

  saveBank(): void {
    if (this.bankForm.invalid) return;
    this.bankSaving = true; this.bankError = '';
    const body = { ...this.bankForm.value };
    if (!body.branch) delete body.branch;

    const url = `${environment.apiBaseUrl}/bank-accounts`;
    const req$ = this.editingBank
      ? this.http.patch(`${url}/${this.editingBank.id}`, body)
      : this.http.post(url, body);

    req$.subscribe({
      next: () => {
        this.bankSaving = false;
        this.bankDialogVisible = false;
        this.msg.add({ severity: 'success', summary: 'Success', detail: this.editingBank ? 'Bank account updated' : 'Bank account added' });
        this.loadBankAccounts();
      },
      error: (err: HttpErrorResponse) => {
        this.bankSaving = false;
        this.bankError = err.error?.error?.message ?? 'Failed to save';
      },
    });
  }

  confirmDeleteBank(ba: BankAccount): void {
    this.confirm.confirm({
      message: `Delete bank account "${ba.accountName}"?`,
      header: 'Delete Bank Account',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.http.delete(`${environment.apiBaseUrl}/bank-accounts/${ba.id}`).subscribe({
          next: () => {
            this.msg.add({ severity: 'success', summary: 'Deleted', detail: 'Bank account removed' });
            this.loadBankAccounts();
          },
          error: (err: HttpErrorResponse) => {
            this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed to delete' });
          },
        });
      },
    });
  }

  // --- Document management ---

  openDocDialog(): void {
    this.editingDoc = null; this.docName = ''; this.selectedFile = null; this.docError = '';
    this.docDialogVisible = true;
  }

  editDocument(doc: CompanyDocument): void {
    this.editingDoc = doc; this.docName = doc.name; this.selectedFile = null; this.docError = '';
    this.docDialogVisible = true;
  }

  onFileSelect(event: Event): void {
    this.selectedFile = (event.target as HTMLInputElement).files?.[0] ?? null;
  }

  saveDocument(): void {
    this.docSaving = true; this.docError = '';
    const formData = new FormData();
    formData.append('name', this.docName.trim());
    if (this.selectedFile) formData.append('file', this.selectedFile);

    const url = `${environment.apiBaseUrl}/company-documents`;
    const req$ = this.editingDoc
      ? this.http.patch(`${url}/${this.editingDoc.id}`, formData)
      : this.http.post(url, formData);

    req$.subscribe({
      next: () => {
        this.docSaving = false; this.docDialogVisible = false;
        this.msg.add({ severity: 'success', summary: 'Success', detail: this.editingDoc ? 'Document updated' : 'Document added' });
        this.loadDocuments();
      },
      error: (err: HttpErrorResponse) => {
        this.docSaving = false;
        this.docError = err.error?.error?.message ?? 'Failed to save document';
      },
    });
  }

  viewDocument(doc: CompanyDocument): void {
    this.http.get(`${environment.apiBaseUrl}/company-documents/${doc.id}/download`, { responseType: 'blob' }).subscribe({
      next: (blob) => window.open(URL.createObjectURL(blob), '_blank'),
      error: () => this.msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to open document' }),
    });
  }

  confirmDeleteDocument(doc: CompanyDocument): void {
    this.confirm.confirm({
      message: `Delete "${doc.name}"?`, header: 'Confirm Delete',
      icon: 'pi pi-exclamation-triangle', acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.http.delete(`${environment.apiBaseUrl}/company-documents/${doc.id}`).subscribe({
          next: () => { this.msg.add({ severity: 'success', summary: 'Deleted', detail: 'Document removed' }); this.loadDocuments(); },
          error: (err: HttpErrorResponse) => this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed' }),
        });
      },
    });
  }

  onDocDrop(event: CdkDragDrop<CompanyDocument[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const docs = [...this.documents()];
    moveItemInArray(docs, event.previousIndex, event.currentIndex);
    this.documents.set(docs);
    this.http.put(`${environment.apiBaseUrl}/company-documents/reorder`, { ids: docs.map(d => d.id) }).subscribe({
      error: () => { this.msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to save order' }); this.loadDocuments(); },
    });
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  docTypeIcon(mime: string): string {
    if (mime.startsWith('image/')) return 'pi pi-image';
    if (mime === 'application/pdf') return 'pi pi-file-pdf';
    if (mime.includes('word') || mime.includes('.document')) return 'pi pi-file-word';
    if (mime.includes('presentation') || mime.includes('powerpoint')) return 'pi pi-desktop';
    if (mime.includes('spreadsheet') || mime.includes('excel')) return 'pi pi-table';
    return 'pi pi-file';
  }

  docTypeLabel(mime: string): string {
    if (mime.startsWith('image/')) return 'Image';
    if (mime === 'application/pdf') return 'PDF';
    if (mime.includes('word') || mime.includes('.document')) return 'Word';
    if (mime.includes('presentation') || mime.includes('powerpoint')) return 'PPT';
    if (mime.includes('spreadsheet') || mime.includes('excel')) return 'Excel';
    return 'File';
  }

  docTypeColor(mime: string): string {
    if (mime.startsWith('image/')) return '#8B5CF6';
    if (mime === 'application/pdf') return '#EF4444';
    if (mime.includes('word') || mime.includes('.document')) return '#3B82F6';
    if (mime.includes('presentation') || mime.includes('powerpoint')) return '#F97316';
    if (mime.includes('spreadsheet') || mime.includes('excel')) return '#22C55E';
    return '#6B7280';
  }
}
