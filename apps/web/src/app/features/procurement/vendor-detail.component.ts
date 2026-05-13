import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';

interface VendorDoc {
  id: string; docType: string; fileName: string; mimeType: string; fileSize: number;
  expiresAt: string | null; createdAt: string;
}
interface VendorBank {
  id: string; accountName: string; accountNo: string; ifsc: string; branch: string | null;
  isPrimary: boolean; verifiedByUserId: string | null; verifiedAt: string | null; createdBy: string;
}
interface Vendor {
  id: string; vendorCode: string | null; name: string; gstin: string | null; pan: string | null;
  category: string | null; contactName: string | null; email: string | null;
  phone: string | null; address: string | null; city: string | null;
  state: string | null; pincode: string | null;
  bankAccountName: string | null; bankAccountNo: string | null;
  bankIfsc: string | null; bankBranch: string | null;
  paymentTermsDays: number | null; rating: number | null;
  notes: string | null; status: string; kycStatus: string;
  msmeNumber: string | null; msmeCategory: string | null;
  tdsSection: string | null; defaultTdsRateBps: number | null;
  isOem: boolean; oemPrincipals: string | null;
  createdAt: string; updatedAt: string;
  documents: VendorDoc[]; bankDetails: VendorBank[];
}

interface LookupItem { label: string; value: string; }

const STATUS_OPTIONS = [
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Inactive', value: 'INACTIVE' },
  { label: 'Blacklisted', value: 'BLACKLISTED' },
];

@Component({
  selector: 'app-vendor-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, ButtonModule, InputTextModule, TextareaModule, SelectModule, InputNumberModule, TagModule, ToastModule],
  providers: [MessageService],
  template: `
    <p-toast />

    @if (loading()) {
      <div class="flex items-center gap-2 text-gray-500 py-12 justify-center"><i class="pi pi-spin pi-spinner text-2xl"></i> Loading...</div>
    } @else if (!vendor()) {
      <div class="text-center py-12 text-gray-500">Vendor not found</div>
    } @else {
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-3">
          <p-button icon="pi pi-arrow-left" [rounded]="true" [text]="true" severity="secondary" (onClick)="goBack()" />
          <div>
            <h2 class="text-2xl font-semibold text-gray-800">{{ vendor()!.name }}</h2>
            <p class="text-sm text-gray-500 mt-0.5">Created {{ vendor()!.createdAt | date:'dd-MMM-yyyy' }}</p>
          </div>
          <p-tag [value]="vendor()!.status" [severity]="statusSeverity(vendor()!.status)" />
          @if (vendor()!.kycStatus) {
            <p-tag [value]="'KYC: ' + vendor()!.kycStatus" [severity]="kycSeverity(vendor()!.kycStatus)" />
          }
          @if (vendor()!.vendorCode) {
            <span class="text-sm text-gray-500 font-mono">{{ vendor()!.vendorCode }}</span>
          }
        </div>
        <div class="flex gap-2">
          @if (!editing()) {
            <p-button label="Edit" icon="pi pi-pencil" severity="info" [outlined]="true" (onClick)="startEdit()" />
          } @else {
            <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="cancelEdit()" />
            <p-button label="Save" icon="pi pi-check" [loading]="saving" [disabled]="form.invalid||saving" (onClick)="save()" />
          }
        </div>
      </div>

      @if (!editing()) {
        <!-- Read-only view -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 class="text-lg font-semibold text-gray-700 mb-4">Basic Information</h3>
            <div class="grid grid-cols-2 gap-y-4">
              <div><span class="text-sm text-gray-500">Name</span><p class="font-medium">{{ vendor()!.name }}</p></div>
              <div><span class="text-sm text-gray-500">Category</span><p class="font-medium">{{ formatCategory(vendor()!.category) }}</p></div>
              <div><span class="text-sm text-gray-500">GSTIN</span><p class="font-medium font-mono">{{ vendor()!.gstin || '—' }}</p></div>
              <div><span class="text-sm text-gray-500">PAN</span><p class="font-medium font-mono">{{ vendor()!.pan || '—' }}</p></div>
              <div><span class="text-sm text-gray-500">Contact Name</span><p class="font-medium">{{ vendor()!.contactName || '—' }}</p></div>
              <div><span class="text-sm text-gray-500">Email</span><p class="font-medium">{{ vendor()!.email || '—' }}</p></div>
              <div><span class="text-sm text-gray-500">Phone</span><p class="font-medium">{{ vendor()!.phone || '—' }}</p></div>
              <div>
                <span class="text-sm text-gray-500">Rating</span>
                <p class="font-medium">
                  @for (s of starsArray(vendor()!.rating); track s) {
                    <i class="pi pi-star-fill text-yellow-500"></i>
                  }
                  @for (s of emptyStarsArray(vendor()!.rating); track s) {
                    <i class="pi pi-star text-gray-300"></i>
                  }
                  @if (!vendor()!.rating) { <span class="text-gray-400">Not rated</span> }
                </p>
              </div>
            </div>
          </div>

          <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 class="text-lg font-semibold text-gray-700 mb-4">Address</h3>
            <div class="grid grid-cols-2 gap-y-4">
              <div class="col-span-2"><span class="text-sm text-gray-500">Address</span><p class="font-medium">{{ vendor()!.address || '—' }}</p></div>
              <div><span class="text-sm text-gray-500">City</span><p class="font-medium">{{ vendor()!.city || '—' }}</p></div>
              <div><span class="text-sm text-gray-500">State</span><p class="font-medium">{{ vendor()!.state || '—' }}</p></div>
              <div><span class="text-sm text-gray-500">Pincode</span><p class="font-medium">{{ vendor()!.pincode || '—' }}</p></div>
            </div>

            <h3 class="text-lg font-semibold text-gray-700 mt-6 mb-4">Bank Details</h3>
            <div class="grid grid-cols-2 gap-y-4">
              <div><span class="text-sm text-gray-500">Account Name</span><p class="font-medium">{{ vendor()!.bankAccountName || '—' }}</p></div>
              <div><span class="text-sm text-gray-500">Account No.</span><p class="font-medium font-mono">{{ vendor()!.bankAccountNo || '—' }}</p></div>
              <div><span class="text-sm text-gray-500">IFSC</span><p class="font-medium font-mono">{{ vendor()!.bankIfsc || '—' }}</p></div>
              <div><span class="text-sm text-gray-500">Branch</span><p class="font-medium">{{ vendor()!.bankBranch || '—' }}</p></div>
              <div><span class="text-sm text-gray-500">Payment Terms</span><p class="font-medium">{{ vendor()!.paymentTermsDays ? vendor()!.paymentTermsDays + ' days' : '—' }}</p></div>
            </div>
          </div>
        </div>

        @if (vendor()!.notes) {
          <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mt-6">
            <h3 class="text-lg font-semibold text-gray-700 mb-2">Notes</h3>
            <p class="text-sm text-gray-600 whitespace-pre-wrap">{{ vendor()!.notes }}</p>
          </div>
        }

        <!-- KYC Actions -->
        <div class="flex gap-2 mt-4">
          @if (vendor()!.kycStatus === 'DRAFT') {
            <p-button label="Submit for KYC" icon="pi pi-send" severity="info" (onClick)="submitKyc()" />
          }
          @if (vendor()!.kycStatus === 'KYC_PENDING') {
            <p-button label="Activate Vendor" icon="pi pi-check-circle" severity="success" (onClick)="activateVendor()" />
          }
          @if (vendor()!.kycStatus === 'ACTIVE') {
            <p-button label="Block Vendor" icon="pi pi-ban" severity="danger" [outlined]="true" (onClick)="blockVendor()" />
          }
          @if (vendor()!.kycStatus === 'BLOCKED') {
            <p-button label="Unblock Vendor" icon="pi pi-lock-open" severity="success" [outlined]="true" (onClick)="unblockVendor()" />
          }
        </div>

        <!-- KYC Documents -->
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mt-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-gray-700">KYC Documents</h3>
            <label class="cursor-pointer">
              <input type="file" class="hidden" (change)="onDocFileSelect($event)" accept=".pdf,.jpg,.png,.jpeg" />
              <span class="text-sm text-indigo-600 hover:underline flex items-center gap-1"><i class="pi pi-upload"></i> Upload</span>
            </label>
          </div>
          @if (vendor()!.documents?.length) {
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              @for (doc of vendor()!.documents; track doc.id) {
                <div class="flex items-center justify-between border rounded-lg px-4 py-3">
                  <div>
                    <div class="font-medium text-sm">{{ doc.docType }}</div>
                    <div class="text-xs text-gray-500">{{ doc.fileName }} ({{ (doc.fileSize / 1024).toFixed(0) }} KB)</div>
                    @if (doc.expiresAt) { <div class="text-xs text-gray-400">Expires: {{ doc.expiresAt | date:'dd MMM yyyy' }}</div> }
                  </div>
                  <p-button icon="pi pi-trash" [text]="true" severity="danger" size="small" (onClick)="deleteDoc(doc)" />
                </div>
              }
            </div>
          } @else {
            <p class="text-sm text-gray-400">No documents uploaded</p>
          }
        </div>

        <!-- Bank Details (dual-control) -->
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mt-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-gray-700">Bank Details (Verified)</h3>
            <p-button label="Add Bank" icon="pi pi-plus" size="small" [text]="true" (onClick)="addBankDialog()" />
          </div>
          @if (vendor()!.bankDetails?.length) {
            @for (bd of vendor()!.bankDetails; track bd.id) {
              <div class="border rounded-lg px-4 py-3 mb-2 flex items-center justify-between">
                <div>
                  <div class="font-medium text-sm">{{ bd.accountName }} — {{ bd.accountNo }}</div>
                  <div class="text-xs text-gray-500">IFSC: {{ bd.ifsc }} {{ bd.branch ? '| ' + bd.branch : '' }}</div>
                  @if (bd.isPrimary) { <p-tag value="Primary" severity="info" class="mt-1" /> }
                </div>
                <div class="flex items-center gap-2">
                  @if (bd.verifiedAt) {
                    <p-tag value="Verified" severity="success" />
                  } @else {
                    <p-button label="Verify" icon="pi pi-check" size="small" severity="success" [outlined]="true" (onClick)="verifyBank(bd)" />
                  }
                  <p-button icon="pi pi-trash" [text]="true" severity="danger" size="small" (onClick)="deleteBank(bd)" />
                </div>
              </div>
            }
          } @else {
            <p class="text-sm text-gray-400">No bank details added</p>
          }
        </div>
      } @else {
        <!-- Edit form -->
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <form [formGroup]="form" class="flex flex-col gap-4">
            <div class="grid grid-cols-2 gap-4">
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Name *</label>
                <input pInputText formControlName="name" class="w-full" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Category</label>
                <p-select appendTo="body" formControlName="category" [options]="categoryOptions()" optionLabel="label" optionValue="value" [showClear]="true" placeholder="Select category" class="w-full" />
              </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">GSTIN</label>
                <input pInputText formControlName="gstin" placeholder="22AAAAA0000A1Z5" class="w-full font-mono" maxlength="15" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">PAN</label>
                <input pInputText formControlName="pan" placeholder="AAAAA0000A" class="w-full font-mono" maxlength="10" />
              </div>
            </div>
            <div class="grid grid-cols-3 gap-4">
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Contact Name</label>
                <input pInputText formControlName="contactName" class="w-full" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Email</label>
                <input pInputText formControlName="email" type="email" class="w-full" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Phone</label>
                <input pInputText formControlName="phone" class="w-full" />
              </div>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Address</label>
              <textarea pTextarea formControlName="address" rows="2" class="w-full"></textarea>
            </div>
            <div class="grid grid-cols-3 gap-4">
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">City</label>
                <input pInputText formControlName="city" class="w-full" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">State</label>
                <input pInputText formControlName="state" class="w-full" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Pincode</label>
                <input pInputText formControlName="pincode" class="w-full" maxlength="6" />
              </div>
            </div>
            <hr class="border-gray-200" />
            <p class="text-sm font-semibold text-gray-600">Bank Details</p>
            <div class="grid grid-cols-2 gap-4">
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Account Name</label>
                <input pInputText formControlName="bankAccountName" class="w-full" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Account No.</label>
                <input pInputText formControlName="bankAccountNo" class="w-full font-mono" />
              </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">IFSC</label>
                <input pInputText formControlName="bankIfsc" class="w-full font-mono" maxlength="11" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Branch</label>
                <input pInputText formControlName="bankBranch" class="w-full" />
              </div>
            </div>
            <hr class="border-gray-200" />
            <div class="grid grid-cols-3 gap-4">
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Payment Terms (days)</label>
                <p-inputNumber formControlName="paymentTermsDays" [min]="0" [max]="365" [showButtons]="true" class="w-full" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Rating (1-5)</label>
                <p-inputNumber formControlName="rating" [min]="1" [max]="5" [showButtons]="true" class="w-full" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Status</label>
                <p-select appendTo="body" formControlName="status" [options]="statusOptions" optionLabel="label" optionValue="value" class="w-full" />
              </div>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Notes</label>
              <textarea pTextarea formControlName="notes" rows="3" class="w-full"></textarea>
            </div>
            @if (serverError) { <div class="p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">{{ serverError }}</div> }
          </form>
        </div>
      }
    }
  `,
})
export class VendorDetailComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly msg = inject(MessageService);
  private readonly cdr = inject(ChangeDetectorRef);

  vendor = signal<Vendor | null>(null);
  loading = signal(true);
  editing = signal(false);
  saving = false;
  serverError = '';

  categoryOptions = signal<Array<{ label: string; value: string }>>([]);
  statusOptions = STATUS_OPTIONS;

  form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    gstin: [''], pan: [''], category: [''],
    contactName: [''], email: [''], phone: [''],
    address: [''], city: [''], state: [''], pincode: [''],
    bankAccountName: [''], bankAccountNo: [''], bankIfsc: [''], bankBranch: [''],
    paymentTermsDays: [30 as number | null], rating: [null as number | null],
    status: ['ACTIVE'], notes: [''],
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.loadVendor(id);
    this.http.get<{ data: LookupItem[] }>(`${environment.apiBaseUrl}/lookup-lists/by-code/vendor_category/items`).subscribe({
      next: (r) => this.categoryOptions.set(r.data.map((i) => ({ label: i.label, value: i.value }))),
    });
  }

  private loadVendor(id: string): void {
    this.loading.set(true);
    this.http.get<{ data: Vendor }>(`${environment.apiBaseUrl}/vendors/${id}`).subscribe({
      next: (r) => { this.vendor.set(r.data); this.loading.set(false); },
      error: () => { this.loading.set(false); },
    });
  }

  formatCategory(c: string | null): string {
    if (!c) return '—';
    const found = this.categoryOptions().find((o) => o.value === c);
    return found ? found.label : c.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
  }

  starsArray(rating: number | null): number[] {
    return Array.from({ length: rating ?? 0 }, (_, i) => i);
  }

  emptyStarsArray(rating: number | null): number[] {
    return Array.from({ length: 5 - (rating ?? 0) }, (_, i) => i);
  }

  statusSeverity(status: string): 'success' | 'danger' | 'warn' | 'info' | 'secondary' {
    switch (status) {
      case 'ACTIVE': return 'success';
      case 'INACTIVE': return 'secondary';
      case 'BLACKLISTED': return 'danger';
      default: return 'info';
    }
  }

  goBack(): void { this.router.navigate(['/procurement/vendors']); }

  startEdit(): void {
    const v = this.vendor()!;
    this.form.patchValue({
      name: v.name, gstin: v.gstin ?? '', pan: v.pan ?? '', category: v.category ?? '',
      contactName: v.contactName ?? '', email: v.email ?? '', phone: v.phone ?? '',
      address: v.address ?? '', city: v.city ?? '', state: v.state ?? '', pincode: v.pincode ?? '',
      bankAccountName: v.bankAccountName ?? '', bankAccountNo: v.bankAccountNo ?? '',
      bankIfsc: v.bankIfsc ?? '', bankBranch: v.bankBranch ?? '',
      paymentTermsDays: v.paymentTermsDays ?? 30, rating: v.rating,
      status: v.status, notes: v.notes ?? '',
    });
    this.serverError = '';
    this.editing.set(true);
  }

  cancelEdit(): void { this.editing.set(false); this.serverError = ''; }

  save(): void {
    if (this.form.invalid) return;
    const v = this.vendor()!;
    this.saving = true; this.serverError = '';
    const body: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(this.form.value)) { if (val !== null && val !== undefined && val !== '') body[k] = val; }
    this.http.patch<{ data: Vendor }>(`${environment.apiBaseUrl}/vendors/${v.id}`, body).subscribe({
      next: (r) => {
        this.saving = false;
        this.vendor.set(r.data);
        this.editing.set(false);
        this.msg.add({ severity: 'success', summary: 'Vendor updated' });
        this.cdr.markForCheck();
      },
      error: (err: HttpErrorResponse) => {
        this.saving = false;
        this.serverError = err.error?.error?.message ?? 'An error occurred';
        this.cdr.markForCheck();
      },
    });
  }

  // ===== KYC Methods =====

  kycSeverity(s: string): 'success' | 'danger' | 'warn' | 'info' | 'secondary' {
    const map: Record<string, 'success' | 'danger' | 'warn' | 'info' | 'secondary'> = {
      DRAFT: 'secondary', KYC_PENDING: 'warn', ACTIVE: 'success', BLOCKED: 'danger', BLACKLISTED: 'danger',
    };
    return map[s] ?? 'secondary';
  }

  submitKyc(): void {
    this.http.post<{ data: Vendor }>(`${environment.apiBaseUrl}/vendors/${this.vendor()!.id}/submit-kyc`, {}).subscribe({
      next: (r) => { this.vendor.set(r.data); this.msg.add({ severity: 'success', summary: 'KYC submitted' }); this.loadVendor(this.vendor()!.id); },
      error: (err: HttpErrorResponse) => this.msg.add({ severity: 'error', summary: err.error?.error?.message ?? 'Failed' }),
    });
  }

  activateVendor(): void {
    this.http.post<{ data: Vendor }>(`${environment.apiBaseUrl}/vendors/${this.vendor()!.id}/activate`, {}).subscribe({
      next: (r) => { this.vendor.set(r.data); this.msg.add({ severity: 'success', summary: 'Vendor activated' }); this.loadVendor(this.vendor()!.id); },
      error: (err: HttpErrorResponse) => this.msg.add({ severity: 'error', summary: err.error?.error?.message ?? 'Missing KYC requirements' }),
    });
  }

  blockVendor(): void {
    this.http.post<{ data: Vendor }>(`${environment.apiBaseUrl}/vendors/${this.vendor()!.id}/block`, { reason: 'Blocked by admin' }).subscribe({
      next: (r) => { this.vendor.set(r.data); this.msg.add({ severity: 'success', summary: 'Vendor blocked' }); this.loadVendor(this.vendor()!.id); },
      error: (err: HttpErrorResponse) => this.msg.add({ severity: 'error', summary: err.error?.error?.message ?? 'Failed' }),
    });
  }

  unblockVendor(): void {
    this.http.post<{ data: Vendor }>(`${environment.apiBaseUrl}/vendors/${this.vendor()!.id}/unblock`, {}).subscribe({
      next: (r) => { this.vendor.set(r.data); this.msg.add({ severity: 'success', summary: 'Vendor unblocked' }); this.loadVendor(this.vendor()!.id); },
      error: (err: HttpErrorResponse) => this.msg.add({ severity: 'error', summary: err.error?.error?.message ?? 'Failed' }),
    });
  }

  // KYC document upload
  selectedDocType = 'GST_CERT';
  docTypeOptions = ['GST_CERT', 'PAN_CARD', 'MSME', 'CANCELLED_CHEQUE', 'NDA', 'ISO', 'OEM_AUTH', 'COMPANY_REG', 'OTHER'];

  onDocFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input?.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('docType', this.selectedDocType);

    this.http.post(`${environment.apiBaseUrl}/vendors/${this.vendor()!.id}/documents`, formData).subscribe({
      next: () => { this.msg.add({ severity: 'success', summary: 'Document uploaded' }); this.loadVendor(this.vendor()!.id); },
      error: () => this.msg.add({ severity: 'error', summary: 'Upload failed' }),
    });
    input.value = '';
  }

  deleteDoc(doc: VendorDoc): void {
    this.http.delete(`${environment.apiBaseUrl}/vendors/${this.vendor()!.id}/documents/${doc.id}`).subscribe({
      next: () => { this.msg.add({ severity: 'success', summary: 'Document deleted' }); this.loadVendor(this.vendor()!.id); },
      error: () => this.msg.add({ severity: 'error', summary: 'Delete failed' }),
    });
  }

  // Bank detail management
  addBankDialog(): void {
    const name = prompt('Account Name:');
    if (!name) return;
    const accountNo = prompt('Account Number:');
    if (!accountNo) return;
    const ifsc = prompt('IFSC Code:');
    if (!ifsc) return;
    const branch = prompt('Branch (optional):') || undefined;

    this.http.post(`${environment.apiBaseUrl}/vendors/${this.vendor()!.id}/bank-details`, {
      accountName: name, accountNo, ifsc, branch, isPrimary: false,
    }).subscribe({
      next: () => { this.msg.add({ severity: 'success', summary: 'Bank detail added' }); this.loadVendor(this.vendor()!.id); },
      error: () => this.msg.add({ severity: 'error', summary: 'Add failed' }),
    });
  }

  verifyBank(bd: VendorBank): void {
    this.http.post(`${environment.apiBaseUrl}/vendors/${this.vendor()!.id}/bank-details/${bd.id}/verify`, {}).subscribe({
      next: () => { this.msg.add({ severity: 'success', summary: 'Bank detail verified' }); this.loadVendor(this.vendor()!.id); },
      error: (err: HttpErrorResponse) => this.msg.add({ severity: 'error', summary: err.error?.error?.message ?? 'Verification failed' }),
    });
  }

  deleteBank(bd: VendorBank): void {
    this.http.delete(`${environment.apiBaseUrl}/vendors/${this.vendor()!.id}/bank-details/${bd.id}`).subscribe({
      next: () => { this.msg.add({ severity: 'success', summary: 'Bank detail deleted' }); this.loadVendor(this.vendor()!.id); },
      error: () => this.msg.add({ severity: 'error', summary: 'Delete failed' }),
    });
  }
}
