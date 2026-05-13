import { Component, ChangeDetectionStrategy, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';

interface PoRow {
  id: string; poNumber: string; poType: string; status: string;
  vendorName: string; projectName: string | null;
  poDate: string; grandTotalPaise: number;
}

@Component({
  selector: 'app-po-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ButtonModule, TableModule, TagModule, SelectModule, InputTextModule, ToastModule, ConfirmDialogModule],
  providers: [MessageService, ConfirmationService],
  template: `
    <p-toast /><p-confirmDialog />
    <div class="p-6">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <i class="pi pi-file-edit text-indigo-600"></i> Purchase Orders
        </h2>
        <p-button label="New PO" icon="pi pi-plus" (onClick)="router.navigate(['/procurement/purchase-orders/new'])" />
      </div>

      <!-- Summary Cards -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-white rounded-lg border p-4">
          <div class="text-sm text-gray-500">Total POs</div>
          <div class="text-2xl font-bold text-gray-800">{{ totalCount() }}</div>
        </div>
        <div class="bg-white rounded-lg border p-4">
          <div class="text-sm text-gray-500">Draft</div>
          <div class="text-2xl font-bold text-blue-600">{{ draftCount() }}</div>
        </div>
        <div class="bg-white rounded-lg border p-4">
          <div class="text-sm text-gray-500">Issued</div>
          <div class="text-2xl font-bold text-green-600">{{ issuedCount() }}</div>
        </div>
        <div class="bg-white rounded-lg border p-4">
          <div class="text-sm text-gray-500">Total Value</div>
          <div class="text-2xl font-bold text-gray-800">{{ formatRupees(totalValue()) }}</div>
        </div>
      </div>

      <!-- Filters -->
      <div class="flex gap-3 mb-4 flex-wrap items-end">
        <div class="flex flex-col gap-1">
          <label class="text-xs text-gray-500">Status</label>
          <p-select [(ngModel)]="filterStatus" [options]="statusOptions" optionLabel="label" optionValue="value" placeholder="All" [showClear]="true" (onChange)="loadPos()" class="w-44" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs text-gray-500">Type</label>
          <p-select [(ngModel)]="filterType" [options]="typeOptions" optionLabel="label" optionValue="value" placeholder="All" [showClear]="true" (onChange)="loadPos()" class="w-40" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs text-gray-500">Search</label>
          <input pInputText [(ngModel)]="filterQ" placeholder="PO No, Vendor..." class="w-48" (keyup.enter)="loadPos()" />
        </div>
        <p-button icon="pi pi-search" [outlined]="true" (onClick)="loadPos()" />
      </div>

      <!-- Table -->
      <p-table [value]="pos()" [loading]="loading()" styleClass="p-datatable-sm p-datatable-striped">
        <ng-template pTemplate="header">
          <tr>
            <th>PO No</th><th>Label</th><th>Type</th><th>Vendor</th><th>Project</th><th>Date</th>
            <th class="text-right">Grand Total (₹)</th><th>Status</th><th style="width:80px">Actions</th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-po>
          <tr class="cursor-pointer" (click)="router.navigate(['/procurement/purchase-orders', po.id])">
            <td class="font-medium font-mono">{{ po.poNo }}</td>
            <td class="text-sm text-gray-600">{{ po.label || '-' }}</td>
            <td><p-tag [value]="po.poType" [severity]="typeSeverity(po.poType)" /></td>
            <td>{{ po.vendorName }}</td>
            <td>{{ po.projectName || '-' }}</td>
            <td class="text-sm">{{ po.poDate | date:'mediumDate' }}</td>
            <td class="text-right font-medium">{{ formatRupees(po.grandTotalPaise) }}</td>
            <td><p-tag [value]="po.status.replace('_', ' ')" [severity]="statusSeverity(po.status)" /></td>
            <td>
              @if (po.status === 'DRAFT') {
                <p-button icon="pi pi-trash" [text]="true" [rounded]="true" size="small" severity="danger"
                  (onClick)="deletePo($event, po.id)" />
              }
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr><td colspan="9" class="text-center text-gray-400 py-8">No purchase orders found</td></tr>
        </ng-template>
      </p-table>
    </div>
  `,
})
export class PoListComponent implements OnInit {
  readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly msg = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  pos = signal<PoRow[]>([]);
  loading = signal(false);
  filterStatus = '';
  filterType = '';
  filterQ = '';

  totalCount = computed(() => this.pos().length);
  draftCount = computed(() => this.pos().filter(p => p.status === 'DRAFT').length);
  issuedCount = computed(() => this.pos().filter(p => p.status === 'ISSUED').length);
  totalValue = computed(() => this.pos().reduce((sum, p) => sum + p.grandTotalPaise, 0));

  statusOptions = [
    { label: 'Draft', value: 'DRAFT' }, { label: 'Approved', value: 'APPROVED' },
    { label: 'Issued', value: 'ISSUED' }, { label: 'Partially Received', value: 'PARTIALLY_RECEIVED' },
    { label: 'Completed', value: 'COMPLETED' }, { label: 'Cancelled', value: 'CANCELLED' },
  ];
  typeOptions = [
    { label: 'Admin', value: 'ADMIN' }, { label: 'Marketing', value: 'MARKETING' },
    { label: 'Project', value: 'PROJECT' },
  ];

  ngOnInit(): void { this.loadPos(); }

  loadPos(): void {
    this.loading.set(true);
    const params: string[] = ['limit=200'];
    if (this.filterStatus) params.push(`status=${this.filterStatus}`);
    if (this.filterType) params.push(`poType=${this.filterType}`);
    if (this.filterQ) params.push(`q=${encodeURIComponent(this.filterQ)}`);
    this.http.get<{ data: PoRow[] }>(`${environment.apiBaseUrl}/purchase-orders?${params.join('&')}`).subscribe({
      next: (r) => { this.pos.set(r.data); this.loading.set(false); },
      error: () => { this.loading.set(false); },
    });
  }

  deletePo(event: Event, id: string): void {
    event.stopPropagation();
    this.confirm.confirm({
      message: 'Delete this purchase order?',
      accept: () => {
        this.http.delete(`${environment.apiBaseUrl}/purchase-orders/${id}`).subscribe({
          next: () => { this.msg.add({ severity: 'success', summary: 'Deleted' }); this.loadPos(); },
          error: (err: HttpErrorResponse) => { this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed' }); },
        });
      },
    });
  }

  formatRupees(paise: number): string {
    return '\u20B9' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 });
  }

  statusSeverity(s: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    switch (s) {
      case 'DRAFT': return 'info';
      case 'APPROVED': return 'warn';
      case 'ISSUED': return 'success';
      case 'PARTIALLY_RECEIVED': return 'warn';
      case 'COMPLETED': return 'success';
      case 'CANCELLED': return 'danger';
      default: return 'secondary';
    }
  }

  typeSeverity(t: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    switch (t) {
      case 'ADMIN': return 'info';
      case 'MARKETING': return 'warn';
      case 'PROJECT': return 'success';
      default: return 'secondary';
    }
  }
}
