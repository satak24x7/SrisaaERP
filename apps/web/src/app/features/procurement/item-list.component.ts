import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
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

interface Item {
  id: string; sku: string; name: string; description: string | null;
  uom: string; category: string | null; hsn: string | null;
  sacCode: string | null; defaultGstRateBps: number | null;
  makeModel: string | null;
  oemCatalogItemCount?: number;
  createdAt: string;
}

// Categories loaded from lookup list 'item_category'

const UOM_OPTIONS = [
  { label: 'Nos', value: 'NOS' },
  { label: 'Kg', value: 'KG' },
  { label: 'Metre', value: 'MTR' },
  { label: 'Sq. Metre', value: 'SQM' },
  { label: 'Cu. Metre', value: 'CUM' },
  { label: 'Litre', value: 'LTR' },
  { label: 'Set', value: 'SET' },
  { label: 'Lot', value: 'LOT' },
  { label: 'Pack', value: 'PACK' },
  { label: 'Box', value: 'BOX' },
  { label: 'Roll', value: 'ROLL' },
  { label: 'Pair', value: 'PAIR' },
  { label: 'Hour', value: 'HR' },
  { label: 'Day', value: 'DAY' },
  { label: 'Month', value: 'MONTH' },
  { label: 'Lump Sum', value: 'LS' },
];

@Component({
  selector: 'app-item-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterLink, TableModule, TagModule, ButtonModule, DialogModule, InputTextModule, TextareaModule, SelectModule, InputNumberModule, ConfirmDialogModule, ToastModule],
  providers: [ConfirmationService, MessageService],
  template: `
    <p-toast /><p-confirmDialog />
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-semibold text-gray-800">Items</h2>
        <p class="text-sm text-gray-500 mt-1">Material and service item master</p>
      </div>
      <p-button label="Add Item" icon="pi pi-plus" (onClick)="openCreate()" />
    </div>

    <!-- Filters -->
    <div class="flex gap-3 mb-4">
      <p-select [options]="categoryFilterOptions()" [(ngModel)]="filterCategory" optionLabel="label" optionValue="value" placeholder="All Categories" class="w-48" (onChange)="applyFilters()" />
      <span class="p-input-icon-left">
        <i class="pi pi-search"></i>
        <input pInputText [(ngModel)]="filterText" placeholder="Search items..." class="w-64" (input)="applyFilters()" />
      </span>
    </div>

    @if (loading()) {
      <div class="flex items-center gap-2 text-gray-500 py-12 justify-center"><i class="pi pi-spin pi-spinner text-2xl"></i> Loading...</div>
    } @else {
      <div class="bg-white rounded-lg shadow-sm border border-gray-200">
        <p-table [value]="filteredItems()" styleClass="p-datatable-sm" [rowHover]="true">
          <ng-template pTemplate="header">
            <tr>
              <th class="font-semibold">SKU</th>
              <th class="font-semibold">Name</th>
              <th class="font-semibold">UoM</th>
              <th class="font-semibold">Category</th>
              <th class="font-semibold">HSN</th>
              <th class="font-semibold">SAC</th>
              <th class="font-semibold">Default GST%</th>
              <th class="font-semibold">Make/Model</th>
              <th class="font-semibold text-center">OEM Options</th>
              <th class="font-semibold" style="width:120px">Actions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-item>
            <tr>
              <td><span class="text-sm font-mono font-semibold">{{ item.sku }}</span></td>
              <td>
                <span class="font-medium">{{ item.name }}</span>
                @if (item.description) { <p class="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{{ item.description }}</p> }
              </td>
              <td><span class="text-sm">{{ item.uom }}</span></td>
              <td><span class="text-sm">{{ formatCategory(item.category) }}</span></td>
              <td><span class="text-sm font-mono">{{ item.hsn || '—' }}</span></td>
              <td><span class="text-sm font-mono">{{ item.sacCode || '—' }}</span></td>
              <td><span class="text-sm">{{ item.defaultGstRateBps != null ? (item.defaultGstRateBps / 100) + '%' : '—' }}</span></td>
              <td><span class="text-sm">{{ item.makeModel || '—' }}</span></td>
              <td class="text-center">
                @if (item.oemCatalogItemCount) {
                  <a class="text-indigo-600 font-semibold cursor-pointer hover:underline" [routerLink]="['/procurement/oem-catalog']" [queryParams]="{masterItemId: item.id}">{{ item.oemCatalogItemCount }}</a>
                } @else {
                  <span class="text-gray-300">0</span>
                }
              </td>
              <td>
                <div class="flex gap-1">
                  <p-button icon="pi pi-pencil" [rounded]="true" [text]="true" severity="info" size="small" (onClick)="openEdit(item)" />
                  <p-button icon="pi pi-trash" [rounded]="true" [text]="true" severity="danger" size="small" (onClick)="confirmDelete(item)" />
                </div>
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td colspan="9" class="text-center py-8 text-gray-500">No items found.</td></tr>
          </ng-template>
        </p-table>
      </div>
    }

    <p-dialog [header]="editItem ? 'Edit Item' : 'Add Item'" [(visible)]="formVisible" [modal]="true" [style]="{width:'640px'}" [contentStyle]="{'max-height':'70vh','overflow':'auto'}">
      <form [formGroup]="form" class="flex flex-col gap-4 pt-2">
        <div class="grid grid-cols-3 gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">SKU *</label>
            <input pInputText formControlName="sku" placeholder="ITM-001" class="w-full font-mono" />
          </div>
          <div class="flex flex-col gap-1 col-span-2">
            <label class="text-sm font-medium text-gray-700">Name *</label>
            <input pInputText formControlName="name" class="w-full" />
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Description</label>
          <textarea pTextarea formControlName="description" rows="2" class="w-full"></textarea>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">UoM *</label>
            <p-select appendTo="body" formControlName="uom" [options]="uomOptions" optionLabel="label" optionValue="value" placeholder="Select unit" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Category</label>
            <p-select appendTo="body" formControlName="category" [options]="categoryOptions()" optionLabel="label" optionValue="value" [showClear]="true" placeholder="Select category" class="w-full" />
          </div>
        </div>
        <div class="grid grid-cols-3 gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">HSN Code</label>
            <input pInputText formControlName="hsn" class="w-full font-mono" maxlength="8" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">SAC Code</label>
            <input pInputText formControlName="sacCode" class="w-full font-mono" maxlength="6" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Default GST %</label>
            <p-inputNumber formControlName="gstPercent" [min]="0" [max]="28" [minFractionDigits]="0" [maxFractionDigits]="2" suffix="%" class="w-full" />
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Make / Model</label>
          <input pInputText formControlName="makeModel" class="w-full" />
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
export class ItemListComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly confirm = inject(ConfirmationService);
  private readonly msg = inject(MessageService);
  private readonly cdr = inject(ChangeDetectorRef);

  items = signal<Item[]>([]);
  filteredItems = signal<Item[]>([]);
  loading = signal(true);
  formVisible = false;
  editItem: Item | null = null;
  saving = false;
  serverError = '';
  filterCategory = '';
  filterText = '';

  categoryFilterOptions = signal<Array<{ label: string; value: string }>>([{ label: 'All Categories', value: '' }]);
  categoryOptions = signal<Array<{ label: string; value: string }>>([]);
  uomOptions = UOM_OPTIONS;

  form = this.fb.group({
    sku: ['', [Validators.required, Validators.maxLength(50)]],
    name: ['', [Validators.required, Validators.maxLength(255)]],
    description: [''],
    uom: ['NOS', Validators.required],
    category: [''],
    hsn: [''],
    sacCode: [''],
    gstPercent: [null as number | null],
    makeModel: [''],
  });

  ngOnInit(): void {
    this.loadCategories();
    this.load();
  }

  private loadCategories(): void {
    this.http.get<{ data: Array<{ label: string; value: string }> }>(`${environment.apiBaseUrl}/lookup-lists/by-code/item_category/items`).subscribe({
      next: (r) => {
        this.categoryOptions.set(r.data);
        this.categoryFilterOptions.set([{ label: 'All Categories', value: '' }, ...r.data]);
      },
    });
  }

  load(): void {
    this.loading.set(true);
    this.http.get<{ data: Item[] }>(`${environment.apiBaseUrl}/items?limit=200`).subscribe({
      next: (r) => { this.items.set(r.data); this.applyFilters(); this.loading.set(false); },
      error: () => { this.loading.set(false); },
    });
  }

  applyFilters(): void {
    let list = this.items();
    if (this.filterCategory) {
      list = list.filter((i) => i.category === this.filterCategory);
    }
    if (this.filterText) {
      const q = this.filterText.toLowerCase();
      list = list.filter((i) =>
        i.name.toLowerCase().includes(q) ||
        i.sku.toLowerCase().includes(q) ||
        (i.hsn && i.hsn.toLowerCase().includes(q)) ||
        (i.makeModel && i.makeModel.toLowerCase().includes(q))
      );
    }
    this.filteredItems.set(list);
  }

  formatCategory(c: string | null): string {
    if (!c) return '—';
    return c.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
  }

  openCreate(): void {
    this.editItem = null;
    this.form.reset({ uom: 'NOS' });
    this.serverError = '';
    this.formVisible = true;
  }

  openEdit(item: Item): void {
    this.editItem = item;
    this.form.patchValue({
      sku: item.sku, name: item.name, description: item.description ?? '',
      uom: item.uom, category: item.category ?? '',
      hsn: item.hsn ?? '', sacCode: item.sacCode ?? '',
      gstPercent: item.defaultGstRateBps != null ? item.defaultGstRateBps / 100 : null,
      makeModel: item.makeModel ?? '',
    });
    this.serverError = '';
    this.formVisible = true;
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    this.saving = true; this.serverError = '';
    const v = this.form.value;
    const body: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      if (k === 'gstPercent') continue; // handled separately
      if (val !== null && val !== undefined && val !== '') body[k] = val;
    }
    // Convert percentage to BPS (basis points)
    if (v.gstPercent != null) {
      body['defaultGstRateBps'] = Math.round(v.gstPercent * 100);
    }
    const url = `${environment.apiBaseUrl}/items`;
    const req$ = this.editItem ? this.http.patch(`${url}/${this.editItem.id}`, body) : this.http.post(url, body);
    req$.subscribe({
      next: () => { this.saving = false; this.formVisible = false; this.msg.add({ severity: 'success', summary: this.editItem ? 'Item updated' : 'Item created' }); this.load(); this.cdr.markForCheck(); },
      error: (err: HttpErrorResponse) => { this.saving = false; this.serverError = err.error?.error?.message ?? 'An error occurred'; this.cdr.markForCheck(); },
    });
  }

  confirmDelete(item: Item): void {
    this.confirm.confirm({
      message: `Delete item "${item.name}" (${item.sku})?`, header: 'Delete Item', icon: 'pi pi-exclamation-triangle', acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.http.delete(`${environment.apiBaseUrl}/items/${item.id}`).subscribe({
          next: () => { this.msg.add({ severity: 'success', summary: 'Item deleted' }); this.load(); },
          error: (err: HttpErrorResponse) => this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Delete failed' }),
        });
      },
    });
  }
}
