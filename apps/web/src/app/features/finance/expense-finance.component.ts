import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TabsModule } from 'primeng/tabs';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { DatePickerModule } from 'primeng/datepicker';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';

interface FinExpenseSheet {
  id: string; title: string; sheetType: string; status: string;
  claimantName: string; businessUnitName: string | null;
  periodFrom: string; periodTo: string;
  lineCount: number; linesTotal: number; gstTotal: number; grandTotal: number;
  advanceStatus: string; advanceRequested: number; advancePaid: number;
  advancePaidDate: string | null; advanceRef: string | null; advancePending: number;
  reimbursementStatus: string; reimbursementDue: number; reimbursementPaid: number;
  reimbursementPaidDate: string | null; reimbursementRef: string | null; reimbursementBalance: number;
  createdAt: string;
}

@Component({
  selector: 'app-expense-finance',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, TableModule, TagModule, TabsModule, DialogModule, InputNumberModule, InputTextModule, DatePickerModule, ToastModule],
  providers: [MessageService],
  template: `
    <p-toast />
    <div class="p-6">
      <h2 class="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
        <i class="pi pi-indian-rupee text-green-600"></i> Expense Advances & Reimbursement
      </h2>

      <p-tabs [(value)]="activeTab" (valueChange)="onTabChange()">
        <p-tablist>
          <p-tab [value]="0">Advance Disbursement</p-tab>
          <p-tab [value]="1">Reimbursement</p-tab>
        </p-tablist>
        <p-tabpanels>
          <!-- Advance Tab -->
          <p-tabpanel [value]="0">
            <div class="mt-4">
              <p class="text-sm text-gray-500 mb-4">Approved expense sheets with advance amount requested. Record disbursement details here.</p>
              <p-table [value]="sheets()" [loading]="loading()" styleClass="p-datatable-sm p-datatable-striped">
                <ng-template pTemplate="header">
                  <tr>
                    <th>Expense Sheet</th><th>Claimant</th><th>BU</th><th>Period</th><th>Status</th>
                    <th class="text-right">Grand Total (₹)</th>
                    <th class="text-right">Requested (₹)</th><th class="text-right">Paid (₹)</th><th class="text-right">Pending (₹)</th>
                    <th>Advance Status</th><th style="width:120px">Action</th>
                  </tr>
                </ng-template>
                <ng-template pTemplate="body" let-s>
                  <tr>
                    <td class="font-medium">{{ s.title }}</td>
                    <td>{{ s.claimantName }}</td>
                    <td>{{ s.businessUnitName || '-' }}</td>
                    <td class="text-sm">{{ s.periodFrom | date:'mediumDate' }} — {{ s.periodTo | date:'mediumDate' }}</td>
                    <td><p-tag [value]="s.status" [severity]="statusSev(s.status)" /></td>
                    <td class="text-right font-medium">{{ fmt(s.grandTotal) }}</td>
                    <td class="text-right font-medium">{{ fmt(s.advanceRequested) }}</td>
                    <td class="text-right text-green-700">{{ fmt(s.advancePaid) }}</td>
                    <td class="text-right" [class]="s.advancePending > 0 ? 'text-red-600 font-semibold' : 'text-green-600'">{{ fmt(s.advancePending) }}</td>
                    <td><p-tag [value]="s.advanceStatus" [severity]="advSev(s.advanceStatus)" /></td>
                    <td>
                      @if (s.advanceStatus !== 'DISBURSED') {
                        <p-button label="Pay" icon="pi pi-check" size="small" (onClick)="openAdvanceDialog(s)" />
                      } @else {
                        <span class="text-green-600 text-sm"><i class="pi pi-check-circle"></i> Done</span>
                      }
                    </td>
                  </tr>
                </ng-template>
                <ng-template pTemplate="emptymessage">
                  <tr><td colspan="11" class="text-center text-gray-400 py-6">No expense sheets with advance requests</td></tr>
                </ng-template>
              </p-table>
            </div>
          </p-tabpanel>

          <!-- Reimbursement Tab -->
          <p-tabpanel [value]="1">
            <div class="mt-4">
              <p class="text-sm text-gray-500 mb-4">Approved expense sheets. Record reimbursement payment (Grand Total minus Advance).</p>
              <p-table [value]="sheets()" [loading]="loading()" styleClass="p-datatable-sm p-datatable-striped">
                <ng-template pTemplate="header">
                  <tr>
                    <th>Expense Sheet</th><th>Claimant</th><th>BU</th><th>Period</th><th>Status</th>
                    <th class="text-right">Grand Total (₹)</th><th class="text-right">Advance (₹)</th>
                    <th class="text-right">Reimb. Due (₹)</th><th class="text-right">Paid (₹)</th><th class="text-right">Balance (₹)</th>
                    <th>Reimb. Status</th><th style="width:120px">Action</th>
                  </tr>
                </ng-template>
                <ng-template pTemplate="body" let-s>
                  <tr>
                    <td class="font-medium">{{ s.title }}</td>
                    <td>{{ s.claimantName }}</td>
                    <td>{{ s.businessUnitName || '-' }}</td>
                    <td class="text-sm">{{ s.periodFrom | date:'mediumDate' }} — {{ s.periodTo | date:'mediumDate' }}</td>
                    <td><p-tag [value]="s.status" [severity]="statusSev(s.status)" /></td>
                    <td class="text-right font-medium">{{ fmt(s.grandTotal) }}</td>
                    <td class="text-right">{{ fmt(s.advanceRequested) }}</td>
                    <td class="text-right font-medium">{{ fmt(s.reimbursementDue) }}</td>
                    <td class="text-right text-green-700">{{ fmt(s.reimbursementPaid) }}</td>
                    <td class="text-right" [class]="s.reimbursementBalance > 0 ? 'text-red-600 font-semibold' : 'text-green-600'">{{ fmt(s.reimbursementBalance) }}</td>
                    <td><p-tag [value]="s.reimbursementStatus" [severity]="reimbSev(s.reimbursementStatus)" /></td>
                    <td>
                      @if (s.reimbursementBalance > 0) {
                        <p-button label="Pay" icon="pi pi-check" size="small" (onClick)="openReimbursementDialog(s)" />
                      } @else if (s.reimbursementPaid > 0) {
                        <span class="text-green-600 text-sm"><i class="pi pi-check-circle"></i> Done</span>
                      }
                    </td>
                  </tr>
                </ng-template>
                <ng-template pTemplate="emptymessage">
                  <tr><td colspan="12" class="text-center text-gray-400 py-6">No approved expense sheets</td></tr>
                </ng-template>
              </p-table>
            </div>
          </p-tabpanel>
        </p-tabpanels>
      </p-tabs>
    </div>

    <!-- Advance Payment Dialog -->
    <p-dialog header="Record Advance Payment" [(visible)]="advanceDialogVisible" [modal]="true" [style]="{width:'450px'}">
      <div class="flex flex-col gap-4 pt-2">
        <div class="text-sm"><strong>{{ selectedSheet?.title }}</strong> — {{ selectedSheet?.claimantName }}</div>
        <div class="text-sm">Requested: <strong>{{ fmt(selectedSheet?.advanceRequested ?? 0) }}</strong></div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Amount Paid (₹) *</label>
          <p-inputNumber [(ngModel)]="advancePayAmount" mode="currency" currency="INR" locale="en-IN" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Payment Date *</label>
          <p-datepicker [(ngModel)]="advancePayDate" dateFormat="yy-mm-dd" appendTo="body" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Reference</label>
          <input pInputText [(ngModel)]="advancePayRef" class="w-full" placeholder="UTR / Cheque No." />
        </div>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="advanceDialogVisible=false" />
        <p-button label="Record Payment" icon="pi pi-check" [disabled]="!advancePayAmount || !advancePayDate" (onClick)="submitAdvance()" />
      </ng-template>
    </p-dialog>

    <!-- Reimbursement Payment Dialog -->
    <p-dialog header="Record Reimbursement" [(visible)]="reimbDialogVisible" [modal]="true" [style]="{width:'450px'}">
      <div class="flex flex-col gap-4 pt-2">
        <div class="text-sm"><strong>{{ selectedSheet?.title }}</strong> — {{ selectedSheet?.claimantName }}</div>
        <div class="text-sm">Due: <strong>{{ fmt(selectedSheet?.reimbursementDue ?? 0) }}</strong> (Grand Total {{ fmt(selectedSheet?.grandTotal ?? 0) }} minus Advance {{ fmt(selectedSheet?.advanceRequested ?? 0) }})</div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Amount Paid (₹) *</label>
          <p-inputNumber [(ngModel)]="reimbPayAmount" mode="currency" currency="INR" locale="en-IN" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Payment Date *</label>
          <p-datepicker [(ngModel)]="reimbPayDate" dateFormat="yy-mm-dd" appendTo="body" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Reference</label>
          <input pInputText [(ngModel)]="reimbPayRef" class="w-full" placeholder="UTR / Cheque No." />
        </div>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="reimbDialogVisible=false" />
        <p-button label="Record Payment" icon="pi pi-check" [disabled]="!reimbPayAmount || !reimbPayDate" (onClick)="submitReimbursement()" />
      </ng-template>
    </p-dialog>
  `,
})
export class ExpenseFinanceComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly msg = inject(MessageService);

  sheets = signal<FinExpenseSheet[]>([]);
  loading = signal(false);
  activeTab = 0;

  // Advance dialog
  advanceDialogVisible = false;
  selectedSheet: FinExpenseSheet | null = null;
  advancePayAmount: number | null = null;
  advancePayDate: Date | null = null;
  advancePayRef = '';

  // Reimbursement dialog
  reimbDialogVisible = false;
  reimbPayAmount: number | null = null;
  reimbPayDate: Date | null = null;
  reimbPayRef = '';

  ngOnInit(): void { this.loadData(); }

  onTabChange(): void { this.loadData(); }

  loadData(): void {
    const tab = this.activeTab === 0 ? 'advance' : 'reimbursement';
    this.loading.set(true);
    this.http.get<{ data: FinExpenseSheet[] }>(`${environment.apiBaseUrl}/finance/expense-advances?tab=${tab}&limit=200`).subscribe({
      next: (r) => { this.sheets.set(r.data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openAdvanceDialog(s: FinExpenseSheet): void {
    this.selectedSheet = s;
    this.advancePayAmount = s.advanceRequested / 100;
    this.advancePayDate = new Date();
    this.advancePayRef = '';
    this.advanceDialogVisible = true;
  }

  submitAdvance(): void {
    if (!this.selectedSheet || !this.advancePayAmount || !this.advancePayDate) return;
    const body = {
      advancePaidPaise: Math.round(this.advancePayAmount * 100),
      advancePaidDate: this.toLocal(this.advancePayDate),
      advanceRef: this.advancePayRef || undefined,
    };
    this.http.post(`${environment.apiBaseUrl}/finance/expense-advances/${this.selectedSheet.id}/record-advance`, body).subscribe({
      next: () => { this.advanceDialogVisible = false; this.msg.add({ severity: 'success', summary: 'Advance recorded' }); this.loadData(); },
      error: (e: HttpErrorResponse) => this.msg.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'Failed' }),
    });
  }

  openReimbursementDialog(s: FinExpenseSheet): void {
    this.selectedSheet = s;
    this.reimbPayAmount = s.reimbursementDue / 100;
    this.reimbPayDate = new Date();
    this.reimbPayRef = '';
    this.reimbDialogVisible = true;
  }

  submitReimbursement(): void {
    if (!this.selectedSheet || !this.reimbPayAmount || !this.reimbPayDate) return;
    const body = {
      reimbursementPaidPaise: Math.round(this.reimbPayAmount * 100),
      reimbursementPaidDate: this.toLocal(this.reimbPayDate),
      reimbursementRef: this.reimbPayRef || undefined,
    };
    this.http.post(`${environment.apiBaseUrl}/finance/expense-advances/${this.selectedSheet.id}/record-reimbursement`, body).subscribe({
      next: () => { this.reimbDialogVisible = false; this.msg.add({ severity: 'success', summary: 'Reimbursement recorded' }); this.loadData(); },
      error: (e: HttpErrorResponse) => this.msg.add({ severity: 'error', summary: 'Error', detail: e.error?.error?.message ?? 'Failed' }),
    });
  }

  fmt(paise: number): string { return '\u20B9' + ((paise ?? 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
  private toLocal(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

  statusSev(s: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    switch (s) { case 'COMPLETED': return 'success'; case 'APPROVED': case 'IN_PROGRESS': return 'info'; case 'SUBMITTED': case 'EXPENSE_SUBMITTED': return 'warn'; case 'REJECTED': return 'danger'; default: return 'secondary'; }
  }
  advSev(s: string): 'success' | 'info' | 'warn' | 'secondary' {
    switch (s) { case 'DISBURSED': return 'success'; case 'APPROVED': return 'info'; case 'REQUESTED': return 'warn'; default: return 'secondary'; }
  }
  reimbSev(s: string): 'success' | 'info' | 'warn' | 'secondary' {
    switch (s) { case 'PAID': return 'success'; case 'APPROVED': return 'info'; case 'SUBMITTED': return 'warn'; default: return 'secondary'; }
  }
}
