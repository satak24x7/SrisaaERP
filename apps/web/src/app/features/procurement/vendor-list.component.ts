import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
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

interface Vendor {
  id: string; name: string; gstin: string | null; pan: string | null;
  category: string | null; contactName: string | null; email: string | null;
  phone: string | null; address: string | null; city: string | null;
  state: string | null; pincode: string | null;
  bankAccountName: string | null; bankAccountNo: string | null;
  bankIfsc: string | null; bankBranch: string | null;
  paymentTermsDays: number | null; rating: number | null;
  notes: string | null; status: string;
  createdAt: string;
}

interface LookupItem { label: string; value: string; }

const STATUS_OPTIONS = [
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Inactive', value: 'INACTIVE' },
  { label: 'Blacklisted', value: 'BLACKLISTED' },
];

@Component({
  selector: 'app-vendor-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, TableModule, TagModule, ButtonModule, DialogModule, InputTextModule, TextareaModule, SelectModule, InputNumberModule, ConfirmDialogModule, ToastModule],
  providers: [ConfirmationService, MessageService],
  template: `
    <p-toast /><p-confirmDialog />
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-semibold text-gray-800">Vendors</h2>
        <p class="text-sm text-gray-500 mt-1">Manage supplier and vendor records</p>
      </div>
      <p-button label="Add Vendor" icon="pi pi-plus" (onClick)="openCreate()" />
    </div>

    <!-- Filters -->
    <div class="flex gap-3 mb-4">
      <p-select [options]="categoryFilterOptions()" [(ngModel)]="filterCategory" optionLabel="label" optionValue="value" placeholder="All Categories" class="w-48" (onChange)="applyFilters()" />
      <span class="p-input-icon-left">
        <i class="pi pi-search"></i>
        <input pInputText [(ngModel)]="filterText" placeholder="Search vendors..." class="w-64" (input)="applyFilters()" />
      </span>
    </div>

    @if (loading()) {
      <div class="flex items-center gap-2 text-gray-500 py-12 justify-center"><i class="pi pi-spin pi-spinner text-2xl"></i> Loading...</div>
    } @else {
      <div class="bg-white rounded-lg shadow-sm border border-gray-200">
        <p-table [value]="filteredVendors()" styleClass="p-datatable-sm" [rowHover]="true" (onRowSelect)="onRowClick($event)" selectionMode="single">
          <ng-template pTemplate="header">
            <tr>
              <th class="font-semibold">Name</th>
              <th class="font-semibold">GSTIN</th>
              <th class="font-semibold">Category</th>
              <th class="font-semibold">Contact</th>
              <th class="font-semibold">Phone</th>
              <th class="font-semibold">City</th>
              <th class="font-semibold">Rating</th>
              <th class="font-semibold">Status</th>
              <th class="font-semibold" style="width:120px">Actions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-v>
            <tr [pSelectableRow]="v" class="cursor-pointer">
              <td><span class="font-medium">{{ v.name }}</span></td>
              <td><span class="text-sm font-mono">{{ v.gstin || '—' }}</span></td>
              <td><span class="text-sm">{{ formatCategory(v.category) }}</span></td>
              <td><span class="text-sm">{{ v.contactName || '—' }}</span></td>
              <td><span class="text-sm">{{ v.phone || '—' }}</span></td>
              <td><span class="text-sm">{{ v.city || '—' }}</span></td>
              <td>
                <span class="text-sm">
                  @for (s of starsArray(v.rating); track s) {
                    <i class="pi pi-star-fill text-yellow-500 text-xs"></i>
                  }
                  @for (s of emptyStarsArray(v.rating); track s) {
                    <i class="pi pi-star text-gray-300 text-xs"></i>
                  }
                </span>
              </td>
              <td><p-tag [value]="v.status" [severity]="statusSeverity(v.status)" [style]="{'font-size':'0.7rem'}" /></td>
              <td>
                <div class="flex gap-1" (click)="$event.stopPropagation()">
                  <p-button icon="pi pi-pencil" [rounded]="true" [text]="true" severity="info" size="small" (onClick)="openEdit(v)" />
                  <p-button icon="pi pi-trash" [rounded]="true" [text]="true" severity="danger" size="small" (onClick)="confirmDelete(v)" />
                </div>
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td colspan="9" class="text-center py-8 text-gray-500">No vendors found.</td></tr>
          </ng-template>
        </p-table>
      </div>
    }

    <p-dialog [header]="editItem ? 'Edit Vendor' : 'Add Vendor'" [(visible)]="formVisible" [modal]="true" [style]="{width:'720px'}" [contentStyle]="{'max-height':'70vh','overflow':'auto'}">
      <form [formGroup]="form" class="flex flex-col gap-4 pt-2">
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
          <textarea pTextarea formControlName="notes" rows="2" class="w-full"></textarea>
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
export class VendorListComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly confirm = inject(ConfirmationService);
  private readonly msg = inject(MessageService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  vendors = signal<Vendor[]>([]);
  filteredVendors = signal<Vendor[]>([]);
  loading = signal(true);
  formVisible = false;
  editItem: Vendor | null = null;
  saving = false;
  serverError = '';
  filterCategory = '';
  filterText = '';

  categoryFilterOptions = signal<Array<{ label: string; value: string }>>([{ label: 'All Categories', value: '' }]);
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
    this.load();
    this.loadCategories();
  }

  loadCategories(): void {
    this.http.get<{ data: LookupItem[] }>(`${environment.apiBaseUrl}/lookup-lists/by-code/vendor_category/items`).subscribe({
      next: (r) => {
        const items = r.data.map((i) => ({ label: i.label, value: i.value }));
        this.categoryOptions.set(items);
        this.categoryFilterOptions.set([{ label: 'All Categories', value: '' }, ...items]);
      },
    });
  }

  load(): void {
    this.loading.set(true);
    this.http.get<{ data: Vendor[] }>(`${environment.apiBaseUrl}/vendors?limit=200`).subscribe({
      next: (r) => { this.vendors.set(r.data); this.applyFilters(); this.loading.set(false); },
      error: () => { this.loading.set(false); },
    });
  }

  applyFilters(): void {
    let list = this.vendors();
    if (this.filterCategory) {
      list = list.filter((v) => v.category === this.filterCategory);
    }
    if (this.filterText) {
      const q = this.filterText.toLowerCase();
      list = list.filter((v) =>
        v.name.toLowerCase().includes(q) ||
        (v.gstin && v.gstin.toLowerCase().includes(q)) ||
        (v.contactName && v.contactName.toLowerCase().includes(q)) ||
        (v.city && v.city.toLowerCase().includes(q))
      );
    }
    this.filteredVendors.set(list);
  }

  formatCategory(c: string | null): string {
    if (!c) return '—';
    return c.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
  }

  starsArray(rating: number | null): number[] {
    const r = rating ?? 0;
    return Array.from({ length: r }, (_, i) => i);
  }

  emptyStarsArray(rating: number | null): number[] {
    const r = rating ?? 0;
    return Array.from({ length: 5 - r }, (_, i) => i);
  }

  statusSeverity(status: string): 'success' | 'danger' | 'warn' | 'info' | 'secondary' {
    switch (status) {
      case 'ACTIVE': return 'success';
      case 'INACTIVE': return 'secondary';
      case 'BLACKLISTED': return 'danger';
      default: return 'info';
    }
  }

  onRowClick(event: unknown): void {
    const data = (event as { data: Vendor }).data;
    if (!data) return;
    this.router.navigate(['/procurement/vendors', data.id]);
  }

  openCreate(): void {
    this.editItem = null;
    this.form.reset({ status: 'ACTIVE', paymentTermsDays: 30 });
    this.serverError = '';
    this.formVisible = true;
  }

  openEdit(v: Vendor): void {
    this.editItem = v;
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
    this.formVisible = true;
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    this.saving = true; this.serverError = '';
    const body: Record<string, unknown> = {};
    const v = this.form.value;
    for (const [k, val] of Object.entries(v)) { if (val !== null && val !== undefined && val !== '') body[k] = val; }
    const url = `${environment.apiBaseUrl}/vendors`;
    const req$ = this.editItem ? this.http.patch(`${url}/${this.editItem.id}`, body) : this.http.post(url, body);
    req$.subscribe({
      next: () => { this.saving = false; this.formVisible = false; this.msg.add({ severity: 'success', summary: this.editItem ? 'Vendor updated' : 'Vendor created' }); this.load(); this.cdr.markForCheck(); },
      error: (err: HttpErrorResponse) => {
        this.saving = false;
        const details = err.error?.error?.details;
        if (details?.length) {
          this.serverError = details.map((d: { path: string; message: string }) => `${d.path}: ${d.message}`).join(', ');
        } else {
          this.serverError = err.error?.error?.message ?? 'An error occurred';
        }
        this.cdr.markForCheck();
      },
    });
  }

  confirmDelete(v: Vendor): void {
    this.confirm.confirm({
      message: `Delete vendor "${v.name}"?`, header: 'Delete Vendor', icon: 'pi pi-exclamation-triangle', acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.http.delete(`${environment.apiBaseUrl}/vendors/${v.id}`).subscribe({
          next: () => { this.msg.add({ severity: 'success', summary: 'Vendor deleted' }); this.load(); },
          error: (err: HttpErrorResponse) => this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Delete failed' }),
        });
      },
    });
  }
}
