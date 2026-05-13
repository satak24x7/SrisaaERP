import { Component, ChangeDetectionStrategy, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';

interface MrRow {
  id: string; mrNo: string; title: string; status: string; priority: string;
  requiredBy: string;
  businessUnit: { id: string; name: string } | null;
  project: { id: string; name: string; code: string } | null;
  lines: unknown[]; estimatedTotalPaise: number;
}

@Component({
  selector: 'app-mr-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ButtonModule, TableModule, TagModule, SelectModule, InputTextModule, ToastModule, ConfirmDialogModule],
  providers: [MessageService, ConfirmationService],
  template: `
    <p-toast /><p-confirmDialog />
    <div class="p-6">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <i class="pi pi-list text-indigo-600"></i> Material Requests
        </h2>
        <p-button label="New MR" icon="pi pi-plus" (onClick)="router.navigate(['/procurement/material-requests/new'])" />
      </div>

      <!-- Summary Cards -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-white rounded-lg border p-4">
          <div class="text-sm text-gray-500">Total</div>
          <div class="text-2xl font-bold text-gray-800">{{ totalCount() }}</div>
        </div>
        <div class="bg-white rounded-lg border p-4">
          <div class="text-sm text-gray-500">Draft</div>
          <div class="text-2xl font-bold text-blue-600">{{ draftCount() }}</div>
        </div>
        <div class="bg-white rounded-lg border p-4">
          <div class="text-sm text-gray-500">Submitted</div>
          <div class="text-2xl font-bold text-amber-600">{{ submittedCount() }}</div>
        </div>
        <div class="bg-white rounded-lg border p-4">
          <div class="text-sm text-gray-500">Approved</div>
          <div class="text-2xl font-bold text-green-600">{{ approvedCount() }}</div>
        </div>
      </div>

      <!-- Filters -->
      <div class="flex gap-3 mb-4 flex-wrap items-end">
        <div class="flex flex-col gap-1">
          <label class="text-xs text-gray-500">Status</label>
          <p-select [options]="statusOptions" [(ngModel)]="filterStatus" placeholder="All Statuses"
                    [showClear]="true" (onChange)="load()" class="w-48" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs text-gray-500">Business Unit</label>
          <p-select [options]="buOptions()" [(ngModel)]="filterBu" placeholder="All BUs"
                    [showClear]="true" optionLabel="label" optionValue="value" (onChange)="load()" class="w-48" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs text-gray-500">Search</label>
          <input pInputText [(ngModel)]="filterSearch" placeholder="MR No / Title" (keyup.enter)="load()" class="w-48" />
        </div>
      </div>

      <!-- Table -->
      <p-table [value]="rows()" [loading]="loading()" styleClass="p-datatable-sm p-datatable-gridlines"
               [rowHover]="true" [scrollable]="true">
        <ng-template pTemplate="header">
          <tr>
            <th>MR No</th>
            <th>Title</th>
            <th>Project</th>
            <th>BU</th>
            <th>Priority</th>
            <th>Status</th>
            <th>Required By</th>
            <th class="text-center">Lines</th>
            <th class="text-right">Est. Value</th>
            <th class="w-16"></th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-row>
          <tr class="cursor-pointer" (click)="router.navigate(['/procurement/material-requests', row.id])">
            <td class="font-medium">{{ row.mrNo }}</td>
            <td>{{ row.title }}</td>
            <td>{{ row.project?.code || '\u2014' }}</td>
            <td>{{ row.businessUnit?.name || '\u2014' }}</td>
            <td><p-tag [value]="row.priority" [severity]="prioritySeverity(row.priority)" /></td>
            <td><p-tag [value]="row.status" [severity]="statusSeverity(row.status)" /></td>
            <td>{{ row.requiredBy | date:'dd MMM yyyy' }}</td>
            <td class="text-center">{{ row.lines?.length || 0 }}</td>
            <td class="text-right">{{ formatRupees(row.estimatedTotalPaise) }}</td>
            <td class="text-center" (click)="$event.stopPropagation()">
              @if (row.status === 'DRAFT') {
                <p-button icon="pi pi-trash" [text]="true" severity="danger" size="small"
                          (onClick)="confirmDelete(row)" />
              }
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr><td colspan="10" class="text-center py-8 text-gray-400">No material requests found</td></tr>
        </ng-template>
      </p-table>
    </div>
  `,
})
export class MrListComponent implements OnInit {
  private http = inject(HttpClient);
  private msg = inject(MessageService);
  private confirm = inject(ConfirmationService);
  router = inject(Router);

  rows = signal<MrRow[]>([]);
  loading = signal(false);

  totalCount = computed(() => this.rows().length);
  draftCount = computed(() => this.rows().filter((r) => r.status === 'DRAFT').length);
  submittedCount = computed(() => this.rows().filter((r) => r.status === 'SUBMITTED').length);
  approvedCount = computed(() => this.rows().filter((r) => ['PM_APPROVED', 'BU_HEAD_APPROVED'].includes(r.status)).length);

  statusOptions = [
    { label: 'Draft', value: 'DRAFT' }, { label: 'Submitted', value: 'SUBMITTED' },
    { label: 'PM Approved', value: 'PM_APPROVED' }, { label: 'BU Head Approved', value: 'BU_HEAD_APPROVED' },
    { label: 'Indented', value: 'INDENTED' }, { label: 'PO Raised', value: 'PO_RAISED' },
    { label: 'Fulfilled', value: 'FULFILLED' }, { label: 'Rejected', value: 'REJECTED' },
    { label: 'Cancelled', value: 'CANCELLED' },
  ];
  buOptions = signal<Array<{ label: string; value: string }>>([]);
  filterStatus = '';
  filterBu = '';
  filterSearch = '';

  ngOnInit(): void {
    this.loadBus();
    this.load();
  }

  loadBus(): void {
    this.http.get<{ data: Array<{ id: string; name: string }> }>(`${environment.apiBaseUrl}/business-units?limit=200`).subscribe({
      next: (res) => this.buOptions.set(res.data.map((b) => ({ label: b.name, value: b.id }))),
    });
  }

  load(): void {
    this.loading.set(true);
    const params: Record<string, string> = { limit: '200' };
    if (this.filterStatus) params['status'] = this.filterStatus;
    if (this.filterBu) params['businessUnitId'] = this.filterBu;
    if (this.filterSearch) params['q'] = this.filterSearch;

    this.http.get<{ data: MrRow[] }>(`${environment.apiBaseUrl}/material-requests`, { params }).subscribe({
      next: (res) => { this.rows.set(res.data); this.loading.set(false); },
      error: () => { this.loading.set(false); this.msg.add({ severity: 'error', summary: 'Failed to load material requests' }); },
    });
  }

  confirmDelete(row: MrRow): void {
    this.confirm.confirm({
      message: `Delete ${row.mrNo}?`,
      accept: () => {
        this.http.delete(`${environment.apiBaseUrl}/material-requests/${row.id}`).subscribe({
          next: () => { this.msg.add({ severity: 'success', summary: 'Deleted' }); this.load(); },
          error: () => this.msg.add({ severity: 'error', summary: 'Delete failed' }),
        });
      },
    });
  }

  statusSeverity(s: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast' {
    const map: Record<string, 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast'> = {
      DRAFT: 'secondary', SUBMITTED: 'info', PM_APPROVED: 'info', BU_HEAD_APPROVED: 'success',
      INDENTED: 'warn', PO_RAISED: 'success', PARTIALLY_FULFILLED: 'warn',
      FULFILLED: 'success', REJECTED: 'danger', CANCELLED: 'danger',
    };
    return map[s] ?? 'secondary';
  }

  prioritySeverity(p: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast' {
    return p === 'EMERGENCY' ? 'danger' : p === 'URGENT' ? 'warn' : 'secondary';
  }

  formatRupees(paise: number): string {
    if (!paise) return '\u2014';
    return '\u20B9' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
