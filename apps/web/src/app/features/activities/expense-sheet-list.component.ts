import { Component, OnInit, inject, signal } from '@angular/core';
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

interface SheetRow {
  id: string; title: string; sheetType: string; status: string;
  claimantName: string; periodFrom: string; periodTo: string;
  lineCount: number; linesTotal: number; createdAt: string;
}

@Component({
  selector: 'app-expense-sheet-list',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, TableModule, TagModule, SelectModule, InputTextModule, ToastModule, ConfirmDialogModule],
  providers: [MessageService, ConfirmationService],
  template: `
    <p-toast /><p-confirmDialog />
    <div class="p-6">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <i class="pi pi-receipt text-blue-600"></i> Expense Sheets
        </h2>
        <p-button label="New Expense Sheet" icon="pi pi-plus" (onClick)="router.navigate(['/work-area/expense-sheets/new'])" />
      </div>

      <div class="flex gap-3 mb-4 flex-wrap items-end">
        <div class="flex flex-col gap-1">
          <label class="text-xs text-gray-500">Status</label>
          <p-select [(ngModel)]="filterStatus" [options]="statusOptions" optionLabel="label" optionValue="value" placeholder="All" [showClear]="true" (onChange)="loadSheets()" class="w-40" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs text-gray-500">Type</label>
          <p-select [(ngModel)]="filterType" [options]="typeOptions" optionLabel="label" optionValue="value" placeholder="All" [showClear]="true" (onChange)="loadSheets()" class="w-44" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs text-gray-500">Search</label>
          <input pInputText [(ngModel)]="filterQ" placeholder="Title..." class="w-48" (keyup.enter)="loadSheets()" />
        </div>
        <p-button icon="pi pi-search" [outlined]="true" (onClick)="loadSheets()" />
      </div>

      <p-table [value]="sheets()" [loading]="loading()" styleClass="p-datatable-sm p-datatable-striped">
        <ng-template pTemplate="header">
          <tr>
            <th>Title</th><th>Type</th><th>Claimant</th><th>Period</th><th>Lines</th><th class="text-right">Total (₹)</th><th>Status</th><th style="width:80px">Actions</th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-s>
          <tr class="cursor-pointer" (click)="router.navigate(['/work-area/expense-sheets', s.id])">
            <td class="font-medium text-blue-700">{{ s.title }}</td>
            <td><p-tag [value]="typeLabel(s.sheetType)" severity="info" /></td>
            <td>{{ s.claimantName }}</td>
            <td class="text-sm">{{ s.periodFrom | date:'mediumDate' }} — {{ s.periodTo | date:'mediumDate' }}</td>
            <td>{{ s.lineCount }}</td>
            <td class="text-right font-medium">{{ formatRupees(s.linesTotal) }}</td>
            <td><p-tag [value]="s.status" [severity]="statusSeverity(s.status)" /></td>
            <td>
              <p-button icon="pi pi-trash" [text]="true" [rounded]="true" size="small" severity="danger" (onClick)="deleteSheet($event, s.id)" />
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr><td colspan="8" class="text-center text-gray-400 py-8">No expense sheets found</td></tr>
        </ng-template>
      </p-table>
    </div>
  `,
})
export class ExpenseSheetListComponent implements OnInit {
  readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly msg = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  sheets = signal<SheetRow[]>([]);
  loading = signal(false);
  filterStatus = '';
  filterType = '';
  filterQ = '';

  statusOptions = [
    { label: 'Draft', value: 'DRAFT' }, { label: 'Submitted', value: 'SUBMITTED' },
    { label: 'Approved', value: 'APPROVED' }, { label: 'Rejected', value: 'REJECTED' },
    { label: 'Paid', value: 'PAID' },
  ];
  typeOptions = [
    { label: 'Pre-Project', value: 'PRE_PROJECT' }, { label: 'During Project', value: 'DURING_PROJECT' },
    { label: 'Admin/General', value: 'ADMIN_GENERAL' }, { label: 'Reimbursement', value: 'REIMBURSEMENT' },
  ];

  ngOnInit(): void { this.loadSheets(); }

  loadSheets(): void {
    this.loading.set(true);
    const params: string[] = ['limit=200'];
    if (this.filterStatus) params.push(`status=${this.filterStatus}`);
    if (this.filterType) params.push(`sheetType=${this.filterType}`);
    if (this.filterQ) params.push(`q=${encodeURIComponent(this.filterQ)}`);
    this.http.get<{ data: SheetRow[] }>(`${environment.apiBaseUrl}/expense-sheets?${params.join('&')}`).subscribe({
      next: (r) => { this.sheets.set(r.data); this.loading.set(false); },
      error: () => { this.loading.set(false); },
    });
  }

  deleteSheet(event: Event, id: string): void {
    event.stopPropagation();
    this.confirm.confirm({
      message: 'Delete this expense sheet?',
      accept: () => {
        this.http.delete(`${environment.apiBaseUrl}/expense-sheets/${id}`).subscribe({
          next: () => { this.msg.add({ severity: 'success', summary: 'Deleted' }); this.loadSheets(); },
          error: (err: HttpErrorResponse) => { this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed' }); },
        });
      },
    });
  }

  formatRupees(paise: number): string { return '\u20B9' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
  typeLabel(t: string): string { return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()); }
  statusSeverity(s: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    switch (s) { case 'PAID': return 'success'; case 'APPROVED': return 'info'; case 'SUBMITTED': return 'warn'; case 'REJECTED': return 'danger'; default: return 'secondary'; }
  }
}
