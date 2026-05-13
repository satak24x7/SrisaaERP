import { Component, ChangeDetectionStrategy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';

interface OemItem {
  id: string; masterItemId: string; vendorId: string;
  masterItem: { id: string; sku: string; name: string; category: string | null };
  vendor: { id: string; name: string };
  priceList: { id: string; name: string } | null;
  oemPartNo: string | null; modelName: string; brand: string | null;
  description: string | null; unitPricePaise: number;
  moq: number; leadTimeDays: number | null; warranty: string | null;
  uom: string; hsn: string | null; gstRateBps: number;
  validFrom: string | null; validTo: string | null; status: string;
}
interface VendorOption { id: string; name: string; }
interface MasterItemOption { id: string; sku: string; name: string; }

@Component({
  selector: 'app-oem-catalog-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, TableModule, TagModule, ButtonModule, SelectModule, InputTextModule, ToastModule, TooltipModule],
  providers: [MessageService],
  template: `
    <p-toast />
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-semibold text-gray-800">OEM Catalog</h2>
        <p class="text-sm text-gray-500 mt-1">Vendor-specific products linked to master items</p>
      </div>
    </div>

    <div class="flex gap-3 mb-4 flex-wrap">
      <p-select [options]="vendorOptions()" [(ngModel)]="filterVendor" optionLabel="name" optionValue="id"
        placeholder="Filter by vendor" [showClear]="true" [filter]="true" filterBy="name" styleClass="w-56" (onChange)="load()" appendTo="body" />
      <p-select [options]="masterItemOptions()" [(ngModel)]="filterMasterItem" optionLabel="name" optionValue="id"
        placeholder="Filter by master item" [showClear]="true" [filter]="true" filterBy="name" styleClass="w-56" (onChange)="load()" appendTo="body" />
      <span class="p-input-icon-left">
        <i class="pi pi-search"></i>
        <input pInputText [(ngModel)]="searchQuery" placeholder="Search model, part no..." class="w-56"
          (keyup.enter)="load()" (blur)="load()" />
      </span>
    </div>

    @if (loading()) {
      <div class="flex items-center gap-2 text-gray-500 py-12 justify-center"><i class="pi pi-spin pi-spinner text-2xl"></i> Loading...</div>
    } @else {
      <div class="bg-white rounded-lg shadow-sm border border-gray-200">
        <p-table [value]="items()" styleClass="p-datatable-sm p-datatable-striped" [rowHover]="true">
          <ng-template pTemplate="header">
            <tr>
              <th class="font-semibold">Model</th>
              <th class="font-semibold">Part No</th>
              <th class="font-semibold">Brand</th>
              <th class="font-semibold">Vendor</th>
              <th class="font-semibold">Master Item</th>
              <th class="font-semibold text-right">Price (₹)</th>
              <th class="font-semibold">UOM</th>
              <th class="font-semibold">Warranty</th>
              <th class="font-semibold">Status</th>
              <th class="font-semibold w-16">Actions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-item>
            <tr>
              <td>
                <span class="font-semibold text-sm">{{ item.modelName }}</span>
                @if (item.description) {
                  <p class="text-xs text-gray-400 truncate max-w-xs" [pTooltip]="item.description" tooltipPosition="top">{{ item.description }}</p>
                }
              </td>
              <td><span class="font-mono text-xs">{{ item.oemPartNo || '—' }}</span></td>
              <td>{{ item.brand || '—' }}</td>
              <td>{{ item.vendor.name }}</td>
              <td>
                <span class="text-sm">{{ item.masterItem.name }}</span>
                <span class="text-xs text-gray-400 font-mono ml-1">{{ item.masterItem.sku }}</span>
              </td>
              <td class="text-right font-mono">{{ formatRupees(item.unitPricePaise) }}</td>
              <td>{{ item.uom }}</td>
              <td class="text-xs">{{ item.warranty || '—' }}</td>
              <td><p-tag [value]="item.status" [severity]="item.status === 'ACTIVE' ? 'success' : 'danger'" /></td>
              <td>
                <button class="p-1 text-gray-500 hover:text-red-600" (click)="deleteItem(item)" pTooltip="Delete" tooltipPosition="top">
                  <i class="pi pi-trash text-sm"></i>
                </button>
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td colspan="10" class="text-center py-8 text-gray-500">No OEM catalog items found. Import a price list first.</td></tr>
          </ng-template>
        </p-table>
      </div>
    }
  `,
  styles: [`:host { display: block; padding: 1.5rem; }`],
})
export class OemCatalogListComponent implements OnInit {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  router = inject(Router);
  private msg = inject(MessageService);

  items = signal<OemItem[]>([]);
  vendorOptions = signal<VendorOption[]>([]);
  masterItemOptions = signal<MasterItemOption[]>([]);
  loading = signal(false);
  filterVendor = '';
  filterMasterItem = '';
  searchQuery = '';

  ngOnInit() {
    // Check query params for pre-filtering
    const params = this.route.snapshot.queryParams;
    if (params['vendorId']) this.filterVendor = params['vendorId'];
    if (params['masterItemId']) this.filterMasterItem = params['masterItemId'];
    if (params['priceListId']) this.searchQuery = ''; // handled separately

    this.loadVendors();
    this.loadMasterItems();
    this.load();
  }

  loadVendors() {
    this.http.get<{ data: VendorOption[] }>(`${environment.apiBaseUrl}/vendors?limit=200`).subscribe({
      next: (r) => this.vendorOptions.set(r.data),
    });
  }

  loadMasterItems() {
    this.http.get<{ data: MasterItemOption[] }>(`${environment.apiBaseUrl}/items?limit=200`).subscribe({
      next: (r) => this.masterItemOptions.set(r.data),
    });
  }

  load() {
    this.loading.set(true);
    let url = `${environment.apiBaseUrl}/oem-catalog?limit=200`;
    if (this.filterVendor) url += `&vendorId=${this.filterVendor}`;
    if (this.filterMasterItem) url += `&masterItemId=${this.filterMasterItem}`;
    if (this.searchQuery) url += `&q=${encodeURIComponent(this.searchQuery)}`;
    const params = this.route.snapshot.queryParams;
    if (params['priceListId']) url += `&priceListId=${params['priceListId']}`;

    this.http.get<{ data: OemItem[] }>(url).subscribe({
      next: (r) => { this.items.set(r.data); this.loading.set(false); },
      error: () => { this.msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to load' }); this.loading.set(false); },
    });
  }

  deleteItem(item: OemItem) {
    if (!confirm(`Delete "${item.modelName}"?`)) return;
    this.http.delete(`${environment.apiBaseUrl}/oem-catalog/${item.id}`).subscribe({
      next: () => { this.msg.add({ severity: 'success', summary: 'Deleted' }); this.load(); },
      error: () => this.msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete' }),
    });
  }

  formatRupees(paise: number) { return '\u20B9' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 }); }
}
