import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';

interface Ref { id: string; name: string; }
interface EntityGroup {
  entityId: string; entityName: string; entityType: string;
  businessUnitName: string | null;
  lineCount: number; taxablePaise: number; gstPaise: number; grandTotalPaise: number;
  cgstPaise: number; sgstPaise: number; igstPaise: number;
}
interface ReportData {
  groupBy: string;
  entities: EntityGroup[];
  totals: { lineCount: number; taxablePaise: number; gstPaise: number; grandTotalPaise: number };
}
interface DetailLine {
  lineId: string; sheetId: string; sheetTitle: string; sheetStatus: string;
  expenseDate: string; category: string; vendorName: string | null; description: string;
  amountPaise: number; gstPaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number;
  totalPaise: number; paymentMode: string;
}

const GROUP_OPTIONS = [
  { label: 'Project', value: 'PROJECT' },
  { label: 'Opportunity', value: 'OPPORTUNITY' },
  { label: 'Initiative', value: 'INITIATIVE' },
  { label: 'Account', value: 'ACCOUNT' },
  { label: 'Lead', value: 'LEAD' },
  { label: 'Contact', value: 'CONTACT' },
];

@Component({
  selector: 'app-expenditure-report',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, SelectModule, DatePickerModule, TableModule, TagModule, DialogModule, ToastModule],
  providers: [MessageService],
  template: `
    <p-toast />
    <div class="p-6">
      <h2 class="text-2xl font-bold text-gray-800 mb-6"><i class="pi pi-chart-line text-green-600 mr-2"></i> Expenditure Report</h2>

      <!-- Filters -->
      <div class="flex flex-wrap items-end gap-4 mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Group By *</label>
          <p-select [(ngModel)]="groupBy" [options]="groupOptions" optionLabel="label" optionValue="value" appendTo="body" class="w-44" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Business Unit</label>
          <p-select [(ngModel)]="selectedBuId" [options]="buOptions()" optionLabel="name" optionValue="id" [filter]="true" [showClear]="true" placeholder="All" appendTo="body" class="w-56" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">From</label>
          <p-datepicker [(ngModel)]="fromDate" dateFormat="yy-mm-dd" appendTo="body" [showClear]="true" class="w-40" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">To</label>
          <p-datepicker [(ngModel)]="toDate" dateFormat="yy-mm-dd" appendTo="body" [showClear]="true" class="w-40" />
        </div>
        <p-button label="Generate" icon="pi pi-refresh" (onClick)="loadReport()" [loading]="loading()" />
      </div>

      @if (loading()) {
        <div class="flex items-center justify-center h-32"><i class="pi pi-spin pi-spinner text-3xl text-blue-500"></i></div>
      } @else if (report()) {
        <!-- Summary -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div class="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <div class="text-xs text-blue-600 font-medium">Total Entities</div>
            <div class="text-2xl font-bold text-blue-800">{{ report()!.entities.length }}</div>
          </div>
          <div class="bg-indigo-50 rounded-lg p-4 border border-indigo-200">
            <div class="text-xs text-indigo-600 font-medium">Expense Lines</div>
            <div class="text-2xl font-bold text-indigo-800">{{ report()!.totals.lineCount }}</div>
          </div>
          <div class="bg-purple-50 rounded-lg p-4 border border-purple-200">
            <div class="text-xs text-purple-600 font-medium">Total GST</div>
            <div class="text-xl font-bold text-purple-800">{{ fmt(report()!.totals.gstPaise) }}</div>
          </div>
          <div class="bg-green-50 rounded-lg p-4 border border-green-200">
            <div class="text-xs text-green-600 font-medium">Grand Total</div>
            <div class="text-xl font-bold text-green-800">{{ fmt(report()!.totals.grandTotalPaise) }}</div>
          </div>
        </div>

        <!-- Entity Table -->
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <p-table [value]="report()!.entities" styleClass="p-datatable-sm p-datatable-gridlines" [paginator]="true" [rows]="25">
            <ng-template pTemplate="header">
              <tr>
                <th>{{ groupLabel() }}</th><th>Business Unit</th><th class="text-right">Lines</th>
                <th class="text-right">Taxable (₹)</th><th class="text-right">CGST</th><th class="text-right">SGST</th>
                <th class="text-right">IGST</th><th class="text-right">Total GST</th><th class="text-right">Grand Total</th>
                <th style="width:80px"></th>
              </tr>
            </ng-template>
            <ng-template pTemplate="body" let-g>
              <tr>
                <td class="font-medium">{{ g.entityName }}</td>
                <td class="text-sm">{{ g.businessUnitName || '-' }}</td>
                <td class="text-right">{{ g.lineCount }}</td>
                <td class="text-right">{{ fmt(g.taxablePaise) }}</td>
                <td class="text-right text-sm">{{ fmt(g.cgstPaise) }}</td>
                <td class="text-right text-sm">{{ fmt(g.sgstPaise) }}</td>
                <td class="text-right text-sm">{{ fmt(g.igstPaise) }}</td>
                <td class="text-right font-medium">{{ fmt(g.gstPaise) }}</td>
                <td class="text-right font-bold">{{ fmt(g.grandTotalPaise) }}</td>
                <td><p-button icon="pi pi-eye" [text]="true" [rounded]="true" size="small" pTooltip="View lines" (onClick)="viewDetail(g)" /></td>
              </tr>
            </ng-template>
            <ng-template pTemplate="emptymessage">
              <tr><td colspan="10" class="text-center text-gray-400 py-6">No approved/paid expenses linked to any {{ groupLabel().toLowerCase() }}</td></tr>
            </ng-template>
          </p-table>
        </div>
      } @else {
        <div class="text-center text-gray-400 py-12"><i class="pi pi-chart-line text-4xl mb-3 block opacity-30"></i> Select group-by type and click Generate</div>
      }
    </div>

    <!-- Detail Dialog -->
    <p-dialog [header]="detailTitle" [(visible)]="detailVisible" [modal]="true" [style]="{width:'900px'}">
      @if (detailLoading) {
        <div class="flex items-center justify-center py-6"><i class="pi pi-spin pi-spinner text-2xl"></i></div>
      } @else {
        <p-table [value]="detailLines()" styleClass="p-datatable-sm" [paginator]="true" [rows]="20">
          <ng-template pTemplate="header">
            <tr>
              <th>Date</th><th>Sheet</th><th>Category</th><th>Vendor</th><th>Description</th>
              <th class="text-right">Amount</th><th class="text-right">CGST</th><th class="text-right">SGST</th>
              <th class="text-right">IGST</th><th class="text-right">Total</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-l>
            <tr>
              <td>{{ l.expenseDate | date:'dd/MM/yy' }}</td>
              <td class="text-sm">{{ l.sheetTitle }}</td>
              <td><p-tag [value]="l.category" severity="info" /></td>
              <td class="text-sm">{{ l.vendorName || '-' }}</td>
              <td class="text-sm">{{ l.description }}</td>
              <td class="text-right">{{ fmt(l.amountPaise) }}</td>
              <td class="text-right text-sm">{{ fmt(l.cgstPaise) }}</td>
              <td class="text-right text-sm">{{ fmt(l.sgstPaise) }}</td>
              <td class="text-right text-sm">{{ fmt(l.igstPaise) }}</td>
              <td class="text-right font-medium">{{ fmt(l.totalPaise) }}</td>
            </tr>
          </ng-template>
        </p-table>
      }
    </p-dialog>
  `,
})
export class ExpenditureReportComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly msg = inject(MessageService);

  report = signal<ReportData | null>(null);
  loading = signal(false);
  buOptions = signal<Ref[]>([]);
  groupBy = 'PROJECT';
  selectedBuId = '';
  fromDate: Date | null = null;
  toDate: Date | null = null;
  groupOptions = GROUP_OPTIONS;

  detailVisible = false;
  detailTitle = '';
  detailLoading = false;
  detailLines = signal<DetailLine[]>([]);

  ngOnInit(): void {
    this.http.get<{ data: Ref[] }>(`${environment.apiBaseUrl}/business-units?limit=200`).subscribe({
      next: (r) => this.buOptions.set(r.data),
    });
  }

  groupLabel(): string {
    return this.groupOptions.find((o) => o.value === this.groupBy)?.label ?? 'Entity';
  }

  loadReport(): void {
    let url = `${environment.apiBaseUrl}/finance/expenditure-report?groupBy=${this.groupBy}`;
    if (this.selectedBuId) url += `&businessUnitId=${this.selectedBuId}`;
    if (this.fromDate) url += `&from=${this.toLocalDateStr(this.fromDate)}`;
    if (this.toDate) url += `&to=${this.toLocalDateStr(this.toDate)}`;

    this.loading.set(true);
    this.http.get<{ data: ReportData }>(url).subscribe({
      next: (r) => { this.report.set(r.data); this.loading.set(false); },
      error: () => { this.loading.set(false); this.msg.add({ severity: 'error', summary: 'Failed to load report' }); },
    });
  }

  viewDetail(g: EntityGroup): void {
    this.detailTitle = `${g.entityName} — Expense Lines`;
    this.detailVisible = true;
    this.detailLoading = true;
    this.detailLines.set([]);

    let url = `${environment.apiBaseUrl}/finance/expenditure-report/entity-detail?entityType=${g.entityType}&entityId=${g.entityId}`;
    if (this.fromDate) url += `&from=${this.toLocalDateStr(this.fromDate)}`;
    if (this.toDate) url += `&to=${this.toLocalDateStr(this.toDate)}`;

    this.http.get<{ data: DetailLine[] }>(url).subscribe({
      next: (r) => { this.detailLines.set(r.data); this.detailLoading = false; },
      error: () => { this.detailLoading = false; },
    });
  }

  fmt(paise: number): string { return '\u20B9' + ((paise ?? 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
  private toLocalDateStr(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
}
