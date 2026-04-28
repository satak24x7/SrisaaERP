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

interface FinTravelPlan {
  id: string; title: string; purpose: string; status: string;
  startDate: string; endDate: string;
  leadTravellerName: string; businessUnitName: string | null;
  travellersCount: number;
  advanceStatus: string; advanceRequested: number; advancePaid: number;
  advancePaidDate: string | null; advanceRef: string | null; advancePending: number;
  reimbursementStatus: string; reimbursementDue: number; reimbursementPaid: number;
  reimbursementPaidDate: string | null; reimbursementRef: string | null; reimbursementBalance: number;
  costOfTravel: number; ticketsTotal: number; hotelsTotal: number; expensesTotal: number;
  createdAt: string;
}

@Component({
  selector: 'app-travel-expenses',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, TableModule, TagModule, TabsModule, DialogModule, InputNumberModule, InputTextModule, DatePickerModule, ToastModule],
  providers: [MessageService],
  template: `
    <p-toast />
    <div class="p-6">
      <h2 class="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
        <i class="pi pi-indian-rupee text-green-600"></i> Travel Expenses — Finance
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
              <p class="text-sm text-gray-500 mb-4">Approved travel plans with advance amount requested. Record disbursement details here.</p>
              <p-table [value]="plans()" [loading]="loading()" styleClass="p-datatable-sm p-datatable-striped" [paginator]="false">
                <ng-template pTemplate="header">
                  <tr>
                    <th>Travel Plan</th>
                    <th>Traveller</th>
                    <th>BU</th>
                    <th>Dates</th>
                    <th>Status</th>
                    <th class="text-right">Requested (₹)</th>
                    <th class="text-right">Paid (₹)</th>
                    <th class="text-right">Pending (₹)</th>
                    <th>Advance Status</th>
                    <th style="width:120px">Action</th>
                  </tr>
                </ng-template>
                <ng-template pTemplate="body" let-p>
                  <tr>
                    <td class="font-medium">{{ p.title }}</td>
                    <td>{{ p.leadTravellerName }}</td>
                    <td>{{ p.businessUnitName || '-' }}</td>
                    <td class="text-sm">{{ p.startDate | date:'mediumDate' }} — {{ p.endDate | date:'mediumDate' }}</td>
                    <td><p-tag [value]="p.status" [severity]="statusSeverity(p.status)" /></td>
                    <td class="text-right font-medium">{{ formatRupees(p.advanceRequested) }}</td>
                    <td class="text-right text-green-700">{{ formatRupees(p.advancePaid) }}</td>
                    <td class="text-right" [class]="p.advancePending > 0 ? 'text-red-600 font-semibold' : 'text-green-600'">{{ formatRupees(p.advancePending) }}</td>
                    <td><p-tag [value]="p.advanceStatus" [severity]="advanceSeverity(p.advanceStatus)" /></td>
                    <td>
                      @if (p.advanceStatus !== 'DISBURSED') {
                        <p-button label="Pay" icon="pi pi-check" size="small" (onClick)="openAdvanceDialog(p)" />
                      } @else {
                        <span class="text-xs text-gray-500">{{ p.advancePaidDate | date:'mediumDate' }}<br/>{{ p.advanceRef }}</span>
                      }
                    </td>
                  </tr>
                </ng-template>
                <ng-template pTemplate="emptymessage">
                  <tr><td colspan="10" class="text-center text-gray-400 py-8">No travel plans with advance requests</td></tr>
                </ng-template>
              </p-table>
            </div>
          </p-tabpanel>

          <!-- Reimbursement Tab -->
          <p-tabpanel [value]="1">
            <div class="mt-4">
              <p class="text-sm text-gray-500 mb-4">Travel plans with expenses submitted for reimbursement. Record payment details here.</p>
              <p-table [value]="plans()" [loading]="loading()" styleClass="p-datatable-sm p-datatable-striped" [paginator]="false">
                <ng-template pTemplate="header">
                  <tr>
                    <th>Travel Plan</th>
                    <th>Traveller</th>
                    <th>BU</th>
                    <th>Status</th>
                    <th class="text-right">Expenses (₹)</th>
                    <th class="text-right">Advance (₹)</th>
                    <th class="text-right">Due (₹)</th>
                    <th class="text-right">Paid (₹)</th>
                    <th class="text-right">Balance (₹)</th>
                    <th>Reimb. Status</th>
                    <th style="width:120px">Action</th>
                  </tr>
                </ng-template>
                <ng-template pTemplate="body" let-p>
                  <tr>
                    <td class="font-medium">{{ p.title }}</td>
                    <td>{{ p.leadTravellerName }}</td>
                    <td>{{ p.businessUnitName || '-' }}</td>
                    <td><p-tag [value]="p.status" [severity]="statusSeverity(p.status)" /></td>
                    <td class="text-right">{{ formatRupees(p.expensesTotal) }}</td>
                    <td class="text-right">{{ formatRupees(p.advanceRequested) }}</td>
                    <td class="text-right font-medium">{{ formatRupees(p.reimbursementDue) }}</td>
                    <td class="text-right text-green-700">{{ formatRupees(p.reimbursementPaid) }}</td>
                    <td class="text-right" [class]="p.reimbursementBalance > 0 ? 'text-red-600 font-semibold' : 'text-green-600'">{{ formatRupees(p.reimbursementBalance) }}</td>
                    <td><p-tag [value]="p.reimbursementStatus" [severity]="reimbSeverity(p.reimbursementStatus)" /></td>
                    <td>
                      @if (p.reimbursementStatus !== 'PAID') {
                        <p-button label="Pay" icon="pi pi-check" size="small" (onClick)="openReimbDialog(p)" />
                      } @else {
                        <span class="text-xs text-gray-500">{{ p.reimbursementPaidDate | date:'mediumDate' }}<br/>{{ p.reimbursementRef }}</span>
                      }
                    </td>
                  </tr>
                </ng-template>
                <ng-template pTemplate="emptymessage">
                  <tr><td colspan="11" class="text-center text-gray-400 py-8">No travel plans with pending reimbursements</td></tr>
                </ng-template>
              </p-table>
            </div>
          </p-tabpanel>
        </p-tabpanels>
      </p-tabs>
    </div>

    <!-- Advance Payment Dialog -->
    <p-dialog header="Record Advance Disbursement" [(visible)]="advDialogVisible" [modal]="true" [style]="{width:'450px'}">
      @if (selectedPlan) {
        <div class="flex flex-col gap-4 pt-2">
          <div class="bg-blue-50 rounded p-3 text-sm">
            <strong>{{ selectedPlan.title }}</strong> — {{ selectedPlan.leadTravellerName }}<br/>
            Requested: <strong>{{ formatRupees(selectedPlan.advanceRequested) }}</strong>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Amount Paid (₹) *</label>
            <p-inputNumber [(ngModel)]="advAmount" mode="currency" currency="INR" locale="en-IN" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Payment Date *</label>
            <p-datepicker appendTo="body" [(ngModel)]="advDate" dateFormat="yy-mm-dd" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Reference / UTR</label>
            <input pInputText [(ngModel)]="advRef" class="w-full" />
          </div>
        </div>
      }
      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="advDialogVisible=false" />
        <p-button label="Record Payment" icon="pi pi-check" [disabled]="!advAmount || !advDate" (onClick)="saveAdvance()" />
      </ng-template>
    </p-dialog>

    <!-- Reimbursement Payment Dialog -->
    <p-dialog header="Record Reimbursement Payment" [(visible)]="reimbDialogVisible" [modal]="true" [style]="{width:'450px'}">
      @if (selectedPlan) {
        <div class="flex flex-col gap-4 pt-2">
          <div class="bg-green-50 rounded p-3 text-sm">
            <strong>{{ selectedPlan.title }}</strong> — {{ selectedPlan.leadTravellerName }}<br/>
            Reimbursement Due: <strong>{{ formatRupees(selectedPlan.reimbursementDue) }}</strong>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Amount Paid (₹) *</label>
            <p-inputNumber [(ngModel)]="reimbAmount" mode="currency" currency="INR" locale="en-IN" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Payment Date *</label>
            <p-datepicker appendTo="body" [(ngModel)]="reimbDate" dateFormat="yy-mm-dd" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Reference / UTR</label>
            <input pInputText [(ngModel)]="reimbRef" class="w-full" />
          </div>
        </div>
      }
      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="reimbDialogVisible=false" />
        <p-button label="Record Payment" icon="pi pi-check" [disabled]="!reimbAmount || !reimbDate" (onClick)="saveReimb()" />
      </ng-template>
    </p-dialog>
  `,
})
export class TravelExpensesComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly msg = inject(MessageService);

  plans = signal<FinTravelPlan[]>([]);
  loading = signal(false);
  activeTab = 0;

  // Advance dialog
  advDialogVisible = false;
  selectedPlan: FinTravelPlan | null = null;
  advAmount: number | null = null;
  advDate: Date | null = null;
  advRef = '';

  // Reimbursement dialog
  reimbDialogVisible = false;
  reimbAmount: number | null = null;
  reimbDate: Date | null = null;
  reimbRef = '';

  ngOnInit(): void {
    this.loadPlans();
  }

  onTabChange(): void {
    this.loadPlans();
  }

  loadPlans(): void {
    this.loading.set(true);
    const tab = this.activeTab === 0 ? 'advance' : 'reimbursement';
    this.http.get<{ data: FinTravelPlan[] }>(`${environment.apiBaseUrl}/finance/travel-expenses?tab=${tab}&limit=200`).subscribe({
      next: (r) => { this.plans.set(r.data); this.loading.set(false); },
      error: () => { this.loading.set(false); },
    });
  }

  openAdvanceDialog(p: FinTravelPlan): void {
    this.selectedPlan = p;
    this.advAmount = p.advanceRequested / 100;
    this.advDate = new Date();
    this.advRef = '';
    this.advDialogVisible = true;
  }

  openReimbDialog(p: FinTravelPlan): void {
    this.selectedPlan = p;
    this.reimbAmount = p.reimbursementDue / 100;
    this.reimbDate = new Date();
    this.reimbRef = '';
    this.reimbDialogVisible = true;
  }

  saveAdvance(): void {
    if (!this.selectedPlan || !this.advAmount || !this.advDate) return;
    const body = {
      advancePaidPaise: Math.round(this.advAmount * 100),
      advancePaidDate: this.toLocalDateStr(this.advDate),
      advanceRef: this.advRef || undefined,
    };
    this.http.patch(`${environment.apiBaseUrl}/finance/travel-expenses/${this.selectedPlan.id}/advance`, body).subscribe({
      next: () => {
        this.advDialogVisible = false;
        this.msg.add({ severity: 'success', summary: 'Recorded', detail: 'Advance disbursement recorded' });
        this.loadPlans();
      },
      error: (err: HttpErrorResponse) => {
        this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed to record advance' });
      },
    });
  }

  saveReimb(): void {
    if (!this.selectedPlan || !this.reimbAmount || !this.reimbDate) return;
    const body = {
      reimbursementPaidPaise: Math.round(this.reimbAmount * 100),
      reimbursementPaidDate: this.toLocalDateStr(this.reimbDate),
      reimbursementRef: this.reimbRef || undefined,
    };
    this.http.patch(`${environment.apiBaseUrl}/finance/travel-expenses/${this.selectedPlan.id}/reimbursement`, body).subscribe({
      next: () => {
        this.reimbDialogVisible = false;
        this.msg.add({ severity: 'success', summary: 'Recorded', detail: 'Reimbursement payment recorded' });
        this.loadPlans();
      },
      error: (err: HttpErrorResponse) => {
        this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed to record reimbursement' });
      },
    });
  }

  formatRupees(paise: number): string {
    return '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  toLocalDateStr(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  statusSeverity(s: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    switch (s) {
      case 'COMPLETED': return 'success';
      case 'APPROVED': case 'BOOKING': return 'info';
      case 'IN_PROGRESS': case 'EXPENSE_SUBMITTED': return 'warn';
      default: return 'secondary';
    }
  }

  advanceSeverity(s: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    switch (s) {
      case 'DISBURSED': return 'success';
      case 'APPROVED': return 'info';
      case 'REQUESTED': return 'warn';
      default: return 'secondary';
    }
  }

  reimbSeverity(s: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    switch (s) {
      case 'PAID': return 'success';
      case 'APPROVED': return 'info';
      case 'SUBMITTED': return 'warn';
      default: return 'secondary';
    }
  }
}
