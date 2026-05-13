import { Component, ChangeDetectionStrategy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';

interface VendorInvoice {
  id: string; invoiceNo: string; vendorInvoiceNo: string;
  vendorId: string; vendorName: string;
  poId: string; poNumber: string;
  invoiceDate: string; dueDate: string;
  invoiceAmountPaise: number; gstAmountPaise: number;
  paidAmountPaise: number; balancePaise: number;
  matchStatus: string; status: string;
  createdAt: string;
}

interface VendorOption { id: string; name: string; }

const STATUS_OPTIONS = [
  { label: 'All Statuses', value: '' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Partially Paid', value: 'PARTIALLY_PAID' },
  { label: 'Paid', value: 'PAID' },
  { label: 'Cancelled', value: 'CANCELLED' },
];

@Component({
  selector: 'app-invoice-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, TableModule, TagModule, ButtonModule, SelectModule, ToastModule],
  providers: [MessageService],
  template: `
    <p-toast />
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-semibold text-gray-800">Vendor Invoices</h2>
        <p class="text-sm text-gray-500 mt-1">Accounts payable — invoice tracking and payments</p>
      </div>
      <p-button label="Record Invoice" icon="pi pi-plus" (onClick)="router.navigate(['/procurement/invoices/new'])" />
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
        <p-table [value]="invoices()" styleClass="p-datatable-sm p-datatable-striped" [rowHover]="true">
          <ng-template pTemplate="header">
            <tr>
              <th class="font-semibold">Invoice No</th>
              <th class="font-semibold">Vendor</th>
              <th class="font-semibold">PO No</th>
              <th class="font-semibold">Invoice Date</th>
              <th class="font-semibold">Due Date</th>
              <th class="font-semibold text-right">Amount</th>
              <th class="font-semibold text-right">Paid</th>
              <th class="font-semibold text-right">Balance</th>
              <th class="font-semibold">Match</th>
              <th class="font-semibold">Status</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-inv>
            <tr class="cursor-pointer" (click)="router.navigate(['/procurement/invoices', inv.id])"
              [ngClass]="agingClass(inv)">
              <td><span class="font-mono font-semibold text-sm">{{ inv.invoiceNo }}</span></td>
              <td>{{ inv.vendorName }}</td>
              <td><span class="font-mono text-sm">{{ inv.poNumber }}</span></td>
              <td>{{ inv.invoiceDate | date:'dd-MMM-yyyy' }}</td>
              <td>{{ inv.dueDate | date:'dd-MMM-yyyy' }}</td>
              <td class="text-right font-mono">{{ formatRupees(inv.invoiceAmountPaise) }}</td>
              <td class="text-right font-mono">{{ formatRupees(inv.paidAmountPaise) }}</td>
              <td class="text-right font-mono font-semibold">{{ formatRupees(inv.balancePaise) }}</td>
              <td><p-tag [value]="inv.matchStatus" [severity]="matchSeverity(inv.matchStatus)" [style]="{'font-size':'0.65rem'}" /></td>
              <td><p-tag [value]="inv.status" [severity]="statusSeverity(inv.status)" /></td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td colspan="10" class="text-center py-8 text-gray-500">No invoices found.</td></tr>
          </ng-template>
        </p-table>
      </div>
    }
  `,
  styles: [`:host { display: block; padding: 1.5rem; }`],
})
export class InvoiceListComponent implements OnInit {
  private http = inject(HttpClient);
  router = inject(Router);
  private msg = inject(MessageService);

  invoices = signal<VendorInvoice[]>([]);
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
    let url = `${environment.apiBaseUrl}/vendor-invoices?limit=200`;
    if (this.filterVendor) url += `&vendorId=${this.filterVendor}`;
    if (this.filterStatus) url += `&status=${this.filterStatus}`;
    this.http.get<{ data: VendorInvoice[] }>(url).subscribe({
      next: (r) => { this.invoices.set(r.data); this.loading.set(false); },
      error: () => { this.msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to load invoices' }); this.loading.set(false); },
    });
  }

  agingClass(inv: VendorInvoice): Record<string, boolean> {
    if (inv.status === 'PAID' || inv.status === 'CANCELLED') return {};
    const due = new Date(inv.dueDate);
    const now = new Date();
    const days = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
    return {
      'bg-red-50': days > 60,
      'bg-amber-50': days > 30 && days <= 60,
      'bg-green-50': days <= 0,
    };
  }

  formatRupees(paise: number) { return '\u20B9' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 }); }

  matchSeverity(s: string): 'success' | 'warn' | 'danger' | 'info' | 'secondary' {
    switch (s) {
      case 'MATCHED': return 'success';
      case 'PARTIAL_MATCH': return 'warn';
      case 'MISMATCH': return 'danger';
      case 'PENDING': return 'secondary';
      default: return 'info';
    }
  }

  statusSeverity(s: string): 'success' | 'warn' | 'danger' | 'info' | 'secondary' {
    switch (s) {
      case 'PAID': return 'success';
      case 'PARTIALLY_PAID': return 'warn';
      case 'PENDING': return 'secondary';
      case 'CANCELLED': return 'danger';
      default: return 'info';
    }
  }
}
