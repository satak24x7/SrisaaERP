import { Component, ChangeDetectionStrategy, OnInit, inject, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { DialogModule } from 'primeng/dialog';
import { DatePickerModule } from 'primeng/datepicker';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';
import { PriceListImportComponent } from './price-list-import.component';

interface PriceList {
  id: string; vendorId: string; vendorName: string;
  name: string; priceDate: string; status: string;
  itemCount: number; attachmentName: string | null;
}
interface VendorOption { id: string; name: string; }

@Component({
  selector: 'app-price-list-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, TableModule, TagModule, ButtonModule, SelectModule,
    InputTextModule, DialogModule, DatePickerModule, ToastModule, TooltipModule, PriceListImportComponent],
  providers: [MessageService],
  template: `
    <p-toast />
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-semibold text-gray-800">Price Lists</h2>
        <p class="text-sm text-gray-500 mt-1">OEM / vendor price catalogs</p>
      </div>
      <div class="flex gap-2">
        <p-button label="Import from Excel" icon="pi pi-file-excel" severity="secondary" (onClick)="importDialog.open()" />
      </div>
    </div>

    <div class="flex gap-3 mb-4">
      <p-select [options]="vendorOptions()" [(ngModel)]="filterVendor" optionLabel="name" optionValue="id"
        placeholder="Filter by vendor" [showClear]="true" [filter]="true" filterBy="name" styleClass="w-56" (onChange)="load()" appendTo="body" />
      <p-select [options]="statusOptions" [(ngModel)]="filterStatus" optionLabel="label" optionValue="value"
        placeholder="Status" styleClass="w-44" (onChange)="load()" appendTo="body" />
    </div>

    @if (loading()) {
      <div class="flex items-center gap-2 text-gray-500 py-12 justify-center"><i class="pi pi-spin pi-spinner text-2xl"></i> Loading...</div>
    } @else {
      <div class="bg-white rounded-lg shadow-sm border border-gray-200">
        <p-table [value]="priceLists()" styleClass="p-datatable-sm p-datatable-striped" [rowHover]="true">
          <ng-template pTemplate="header">
            <tr>
              <th class="font-semibold">Name</th>
              <th class="font-semibold">Vendor</th>
              <th class="font-semibold">Price Date</th>
              <th class="font-semibold text-right">Items</th>
              <th class="font-semibold">Status</th>
              <th class="font-semibold w-24">Actions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-pl>
            <tr>
              <td>
                <span class="font-semibold text-sm cursor-pointer hover:text-indigo-600"
                  (click)="router.navigate(['/procurement/oem-catalog'], {queryParams: {priceListId: pl.id}})">{{ pl.name }}</span>
                @if (pl.attachmentName) {
                  <i class="pi pi-paperclip text-xs text-gray-400 ml-1" [pTooltip]="pl.attachmentName" tooltipPosition="top"></i>
                }
              </td>
              <td>{{ pl.vendorName }}</td>
              <td>{{ pl.priceDate | date:'dd-MMM-yyyy' }}</td>
              <td class="text-right font-mono">{{ pl.itemCount }}</td>
              <td><p-tag [value]="pl.status" [severity]="statusSeverity(pl.status)" /></td>
              <td>
                <div class="flex gap-1">
                  <button class="p-1 text-gray-500 hover:text-red-600" (click)="deletePl(pl)" pTooltip="Delete" tooltipPosition="top">
                    <i class="pi pi-trash text-sm"></i>
                  </button>
                </div>
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td colspan="6" class="text-center py-8 text-gray-500">No price lists found. Import one from Excel.</td></tr>
          </ng-template>
        </p-table>
      </div>
    }

    <app-price-list-import #importDialog (imported)="load()" />
  `,
  styles: [`:host { display: block; padding: 1.5rem; }`],
})
export class PriceListListComponent implements OnInit {
  private http = inject(HttpClient);
  router = inject(Router);
  private msg = inject(MessageService);
  @ViewChild('importDialog') importDialog!: PriceListImportComponent;

  priceLists = signal<PriceList[]>([]);
  vendorOptions = signal<VendorOption[]>([]);
  loading = signal(false);
  filterVendor = '';
  filterStatus = '';
  statusOptions = [
    { label: 'All', value: '' },
    { label: 'Active', value: 'ACTIVE' },
    { label: 'Expired', value: 'EXPIRED' },
    { label: 'Superseded', value: 'SUPERSEDED' },
  ];

  ngOnInit() {
    this.loadVendors();
    this.load();
  }

  loadVendors() {
    this.http.get<{ data: VendorOption[] }>(`${environment.apiBaseUrl}/vendors?limit=200`).subscribe({
      next: (r) => this.vendorOptions.set(r.data),
    });
  }

  load() {
    this.loading.set(true);
    let url = `${environment.apiBaseUrl}/price-lists?limit=200`;
    if (this.filterVendor) url += `&vendorId=${this.filterVendor}`;
    if (this.filterStatus) url += `&status=${this.filterStatus}`;
    this.http.get<{ data: PriceList[] }>(url).subscribe({
      next: (r) => { this.priceLists.set(r.data); this.loading.set(false); },
      error: () => { this.msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to load price lists' }); this.loading.set(false); },
    });
  }

  deletePl(pl: PriceList) {
    if (!confirm(`Delete price list "${pl.name}"?`)) return;
    this.http.delete(`${environment.apiBaseUrl}/price-lists/${pl.id}`).subscribe({
      next: () => { this.msg.add({ severity: 'success', summary: 'Deleted' }); this.load(); },
      error: () => this.msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete' }),
    });
  }

  statusSeverity(s: string): 'success' | 'warn' | 'danger' | 'secondary' {
    switch (s) {
      case 'ACTIVE': return 'success';
      case 'EXPIRED': return 'warn';
      case 'SUPERSEDED': return 'secondary';
      default: return 'secondary';
    }
  }
}
