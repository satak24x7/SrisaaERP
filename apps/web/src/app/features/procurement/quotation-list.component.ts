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
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';
import { QuotationImportComponent } from './quotation-import.component';

interface Quotation {
  id: string; quotationNo: string; vendorId: string; vendorName: string;
  quotationDate: string; validUntil: string | null;
  grandTotalPaise: number; status: string; lineCount: number;
  createdAt: string;
}

interface VendorOption { id: string; name: string; }

const STATUS_OPTIONS = [
  { label: 'All Statuses', value: '' },
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Expired', value: 'EXPIRED' },
  { label: 'Cancelled', value: 'CANCELLED' },
];

@Component({
  selector: 'app-quotation-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, TableModule, TagModule, ButtonModule, SelectModule, InputTextModule, ToastModule, QuotationImportComponent],
  providers: [MessageService],
  template: `
    <p-toast />
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-semibold text-gray-800">Quotations</h2>
        <p class="text-sm text-gray-500 mt-1">Vendor quotations for rate comparison</p>
      </div>
      <div class="flex gap-2">
        <p-button label="Import from Excel" icon="pi pi-file-excel" severity="secondary" (onClick)="importDialog.open()" />
        <p-button label="New Quotation" icon="pi pi-plus" (onClick)="router.navigate(['/procurement/quotations/new'])" />
      </div>
    </div>

    <div class="flex gap-3 mb-4">
      <p-select [options]="vendorOptions()" [(ngModel)]="filterVendor" optionLabel="name" optionValue="id"
        placeholder="Filter by vendor" [showClear]="true" styleClass="w-56" (onChange)="load()" />
      <p-select [options]="statusOptions" [(ngModel)]="filterStatus" optionLabel="label" optionValue="value"
        placeholder="Status" styleClass="w-44" (onChange)="load()" />
    </div>

    @if (loading()) {
      <div class="flex items-center gap-2 text-gray-500 py-12 justify-center"><i class="pi pi-spin pi-spinner text-2xl"></i> Loading...</div>
    } @else {
      <div class="bg-white rounded-lg shadow-sm border border-gray-200">
        <p-table [value]="quotations()" styleClass="p-datatable-sm p-datatable-striped"
          [rowHover]="true" (onRowSelect)="onRowSelect($event)" selectionMode="single">
          <ng-template pTemplate="header">
            <tr>
              <th class="font-semibold">Quotation No</th>
              <th class="font-semibold">Vendor</th>
              <th class="font-semibold">Date</th>
              <th class="font-semibold">Valid Until</th>
              <th class="font-semibold text-right">Grand Total</th>
              <th class="font-semibold">Status</th>
              <th class="font-semibold text-right">Lines</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-q>
            <tr class="cursor-pointer" (click)="router.navigate(['/procurement/quotations', q.id])">
              <td><span class="font-mono font-semibold text-sm">{{ q.quotationNo }}</span></td>
              <td>{{ q.vendorName }}</td>
              <td>{{ q.quotationDate | date:'dd-MMM-yyyy' }}</td>
              <td>{{ q.validUntil ? (q.validUntil | date:'dd-MMM-yyyy') : '—' }}</td>
              <td class="text-right font-mono">{{ formatRupees(q.grandTotalPaise) }}</td>
              <td><p-tag [value]="q.status" [severity]="statusSeverity(q.status)" /></td>
              <td class="text-right">{{ q.lineCount }}</td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td colspan="7" class="text-center py-8 text-gray-500">No quotations found.</td></tr>
          </ng-template>
        </p-table>
      </div>
    }

    <app-quotation-import #importDialog (imported)="load()" />
  `,
  styles: [`:host { display: block; padding: 1.5rem; }`],
})
export class QuotationListComponent implements OnInit {
  private http = inject(HttpClient);
  router = inject(Router);
  private msg = inject(MessageService);
  @ViewChild('importDialog') importDialog!: QuotationImportComponent;

  quotations = signal<Quotation[]>([]);
  vendorOptions = signal<VendorOption[]>([]);
  loading = signal(false);
  statusOptions = STATUS_OPTIONS;
  filterVendor = '';
  filterStatus = '';

  ngOnInit() {
    this.loadVendors();
    this.load();
  }

  loadVendors() {
    this.http.get<{ data: VendorOption[] }>(`${environment.apiBaseUrl}/vendors?status=ACTIVE&limit=200`).subscribe({
      next: (r) => this.vendorOptions.set(r.data),
    });
  }

  load() {
    this.loading.set(true);
    let url = `${environment.apiBaseUrl}/quotations?limit=200`;
    if (this.filterVendor) url += `&vendorId=${this.filterVendor}`;
    if (this.filterStatus) url += `&status=${this.filterStatus}`;
    this.http.get<{ data: Quotation[] }>(url).subscribe({
      next: (r) => { this.quotations.set(r.data); this.loading.set(false); },
      error: () => { this.msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to load quotations' }); this.loading.set(false); },
    });
  }

  onRowSelect(event: unknown) {
    const data = (event as { data: Quotation }).data;
    if (!data) return;
    this.router.navigate(['/procurement/quotations', data.id]);
  }

  formatRupees(paise: number) { return '\u20B9' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 }); }

  statusSeverity(s: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    switch (s) {
      case 'ACTIVE': return 'success';
      case 'DRAFT': return 'secondary';
      case 'EXPIRED': return 'warn';
      case 'CANCELLED': return 'danger';
      default: return 'info';
    }
  }
}
