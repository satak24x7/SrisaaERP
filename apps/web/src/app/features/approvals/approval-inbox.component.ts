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
import { DialogModule } from 'primeng/dialog';
import { TextareaModule } from 'primeng/textarea';
import { ToastModule } from 'primeng/toast';
import { TabsModule } from 'primeng/tabs';
import { MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';

interface ApprovalRequest {
  id: string; entityType: string; entityId: string; status: string;
  title: string | null; valuePaise: number; currentStepOrder: number;
  requestedByUserId: string; createdAt: string;
  workflow: { id: string; name: string; steps: Array<{ stepOrder: number; stepName: string; approverRoleName: string | null }> };
  actions: Array<{ id: string; stepOrder: number; actorUserId: string; action: string; comment: string | null; occurredAt: string }>;
}

@Component({
  selector: 'app-approval-inbox',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ButtonModule, TableModule, TagModule, SelectModule, InputTextModule, DialogModule, TextareaModule, ToastModule, TabsModule],
  providers: [MessageService],
  template: `
    <p-toast />
    <div class="p-6">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <i class="pi pi-check-square text-indigo-600"></i> Approvals
        </h2>
      </div>

      <!-- Summary Cards -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div class="bg-white rounded-lg border p-4">
          <div class="text-sm text-gray-500">My Pending</div>
          <div class="text-2xl font-bold text-amber-600">{{ myPendingCount() }}</div>
        </div>
        <div class="bg-white rounded-lg border p-4">
          <div class="text-sm text-gray-500">Approved</div>
          <div class="text-2xl font-bold text-green-600">{{ approvedCount() }}</div>
        </div>
        <div class="bg-white rounded-lg border p-4">
          <div class="text-sm text-gray-500">Rejected</div>
          <div class="text-2xl font-bold text-red-600">{{ rejectedCount() }}</div>
        </div>
      </div>

      <!-- Tabs -->
      <p-tabs [(value)]="activeTab" (valueChange)="onTabChange()">
        <p-tablist>
          <p-tab value="pending">My Pending</p-tab>
          <p-tab value="all">All Requests</p-tab>
        </p-tablist>
      </p-tabs>

      <!-- Filters -->
      <div class="flex gap-3 my-4 flex-wrap items-end">
        <div class="flex flex-col gap-1">
          <label class="text-xs text-gray-500">Type</label>
          <p-select [options]="entityTypeOptions" [(ngModel)]="filterEntityType" placeholder="All Types"
                    [showClear]="true" (onChange)="load()" class="w-48" />
        </div>
        @if (activeTab === 'all') {
          <div class="flex flex-col gap-1">
            <label class="text-xs text-gray-500">Status</label>
            <p-select [options]="statusOptions" [(ngModel)]="filterStatus" placeholder="All"
                      [showClear]="true" (onChange)="load()" class="w-40" />
          </div>
        }
      </div>

      <!-- Table -->
      <p-table [value]="rows()" [loading]="loading()" styleClass="p-datatable-sm p-datatable-gridlines"
               [rowHover]="true">
        <ng-template pTemplate="header">
          <tr>
            <th>Title</th>
            <th>Type</th>
            <th>Current Step</th>
            <th class="text-right">Value</th>
            <th>Status</th>
            <th>Requested</th>
            <th class="w-48">Actions</th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-row>
          <tr>
            <td class="font-medium cursor-pointer" (click)="navigateToEntity(row)">{{ row.title || row.entityId }}</td>
            <td><p-tag [value]="row.entityType" severity="info" /></td>
            <td>{{ currentStepName(row) }}</td>
            <td class="text-right">{{ formatRupees(row.valuePaise) }}</td>
            <td><p-tag [value]="row.status" [severity]="statusSeverity(row.status)" /></td>
            <td>{{ row.createdAt | date:'dd MMM yyyy HH:mm' }}</td>
            <td>
              @if (row.status === 'PENDING') {
                <div class="flex gap-1">
                  <p-button label="Approve" size="small" severity="success" (onClick)="openActionDialog(row, 'APPROVE')" />
                  <p-button label="Reject" size="small" severity="danger" (onClick)="openActionDialog(row, 'REJECT')" />
                  <p-button icon="pi pi-undo" size="small" severity="warn" [text]="true" pTooltip="Return"
                            (onClick)="openActionDialog(row, 'RETURN')" />
                </div>
              }
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr><td colspan="7" class="text-center py-8 text-gray-400">No approval requests</td></tr>
        </ng-template>
      </p-table>

      <!-- Action Dialog -->
      <p-dialog [(visible)]="actionDialogVisible" [header]="actionType + ' Request'" [modal]="true" [style]="{ width: '480px' }">
        <div class="flex flex-col gap-3 pt-2">
          <div class="text-sm text-gray-600">{{ actionRow?.title || actionRow?.entityId }}</div>
          <label class="text-sm font-medium">Comment (optional)</label>
          <textarea pTextarea [(ngModel)]="actionComment" [rows]="3" class="w-full"></textarea>
        </div>
        <ng-template pTemplate="footer">
          <p-button label="Cancel" [text]="true" (onClick)="actionDialogVisible = false" />
          <p-button [label]="actionType" [severity]="actionType === 'APPROVE' ? 'success' : actionType === 'REJECT' ? 'danger' : 'warn'"
                    (onClick)="executeAction()" [loading]="acting()" />
        </ng-template>
      </p-dialog>
    </div>
  `,
})
export class ApprovalInboxComponent implements OnInit {
  private http = inject(HttpClient);
  private msg = inject(MessageService);
  router = inject(Router);

  rows = signal<ApprovalRequest[]>([]);
  loading = signal(false);
  acting = signal(false);
  activeTab = 'pending';

  myPendingCount = computed(() => this.rows().filter((r) => r.status === 'PENDING').length);
  approvedCount = signal(0);
  rejectedCount = signal(0);

  entityTypeOptions = [
    { label: 'Material Request', value: 'MATERIAL_REQUEST' },
    { label: 'Purchase Order', value: 'PURCHASE_ORDER' },
  ];
  statusOptions = [
    { label: 'Pending', value: 'PENDING' },
    { label: 'Approved', value: 'APPROVED' },
    { label: 'Rejected', value: 'REJECTED' },
    { label: 'Returned', value: 'RETURNED' },
  ];

  filterEntityType = '';
  filterStatus = '';

  actionDialogVisible = false;
  actionRow: ApprovalRequest | null = null;
  actionType: 'APPROVE' | 'REJECT' | 'RETURN' = 'APPROVE';
  actionComment = '';

  ngOnInit(): void {
    this.load();
  }

  onTabChange(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    const params: Record<string, string> = { limit: '200' };
    if (this.activeTab === 'pending') params['myPending'] = 'true';
    if (this.filterEntityType) params['entityType'] = this.filterEntityType;
    if (this.filterStatus && this.activeTab === 'all') params['status'] = this.filterStatus;

    this.http.get<{ data: ApprovalRequest[] }>(`${environment.apiBaseUrl}/approvals/requests`, { params }).subscribe({
      next: (res) => {
        this.rows.set(res.data);
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); this.msg.add({ severity: 'error', summary: 'Failed to load' }); },
    });
  }

  currentStepName(row: ApprovalRequest): string {
    const step = row.workflow?.steps?.find((s) => s.stepOrder === row.currentStepOrder);
    return step?.stepName ?? `Step ${row.currentStepOrder}`;
  }

  navigateToEntity(row: ApprovalRequest): void {
    const routes: Record<string, string> = {
      MATERIAL_REQUEST: '/procurement/material-requests/',
      PURCHASE_ORDER: '/procurement/purchase-orders/',
    };
    const base = routes[row.entityType];
    if (base) this.router.navigate([base + row.entityId]);
  }

  openActionDialog(row: ApprovalRequest, action: 'APPROVE' | 'REJECT' | 'RETURN'): void {
    this.actionRow = row;
    this.actionType = action;
    this.actionComment = '';
    this.actionDialogVisible = true;
  }

  executeAction(): void {
    if (!this.actionRow) return;
    this.acting.set(true);
    this.http.post(`${environment.apiBaseUrl}/approvals/requests/${this.actionRow.id}/act`, {
      action: this.actionType,
      comment: this.actionComment || undefined,
    }).subscribe({
      next: () => {
        this.acting.set(false);
        this.actionDialogVisible = false;
        this.msg.add({ severity: 'success', summary: `${this.actionType}d successfully` });
        this.load();
      },
      error: (err) => {
        this.acting.set(false);
        this.msg.add({ severity: 'error', summary: err?.error?.error?.message ?? 'Action failed' });
      },
    });
  }

  statusSeverity(s: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast' {
    const map: Record<string, 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast'> = {
      PENDING: 'warn', APPROVED: 'success', REJECTED: 'danger', RETURNED: 'info',
    };
    return map[s] ?? 'secondary';
  }

  formatRupees(paise: number): string {
    if (!paise) return '\u2014';
    return '\u20B9' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
