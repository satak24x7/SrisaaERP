import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';

interface Ref { id: string; name: string; }
interface GstLineItem {
  lineId: string; sheetId: string; sheetTitle: string;
  expenseDate: string; invoiceDate: string | null;
  category: string; vendorName: string | null; vendorGstin: string | null;
  invoiceNumber: string | null; hsnSacCode: string | null; description: string;
  taxableValuePaise: number; gstRateBps: number; supplyType: string;
  cgstPaise: number; sgstPaise: number; igstPaise: number; totalGstPaise: number;
  itcEligible: boolean; reverseCharge: boolean;
}
interface GstStatement {
  period: string;
  totalTaxableValuePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number;
  totalGstPaise: number; itcEligiblePaise: number; netPayablePaise: number;
  lineCount: number; lineItems: GstLineItem[];
}

@Component({
  selector: 'app-gst-statement',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, SelectModule, DatePickerModule, TableModule, TagModule, ToastModule],
  providers: [MessageService],
  template: `
    <p-toast />
    <div class="p-6">
      <h2 class="text-2xl font-bold text-gray-800 mb-6"><i class="pi pi-chart-bar text-blue-600 mr-2"></i> GST Statement</h2>

      <!-- Filters -->
      <div class="flex flex-wrap items-end gap-4 mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Month *</label>
          <p-datepicker [(ngModel)]="selectedMonth" view="month" dateFormat="yy-mm" appendTo="body" class="w-48" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Business Unit</label>
          <p-select [(ngModel)]="selectedBuId" [options]="buOptions()" optionLabel="name" optionValue="id" [filter]="true" [showClear]="true" placeholder="All" appendTo="body" class="w-56" />
        </div>
        <p-button label="Generate" icon="pi pi-refresh" (onClick)="loadStatement()" [loading]="loading()" />
        @if (statement()) {
          <p-button label="Export CSV" icon="pi pi-download" severity="secondary" [outlined]="true" (onClick)="exportCsv()" />
        }
      </div>

      @if (loading()) {
        <div class="flex items-center justify-center h-32"><i class="pi pi-spin pi-spinner text-3xl text-blue-500"></i></div>
      } @else if (statement()) {
        <!-- Summary Cards -->
        <div class="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 mb-6">
          <div class="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <div class="text-xs text-blue-600 font-medium">Taxable Value</div>
            <div class="text-xl font-bold text-blue-800">{{ fmt(statement()!.totalTaxableValuePaise) }}</div>
          </div>
          <div class="bg-orange-50 rounded-lg p-4 border border-orange-200">
            <div class="text-xs text-orange-600 font-medium">CGST</div>
            <div class="text-xl font-bold text-orange-800">{{ fmt(statement()!.cgstPaise) }}</div>
          </div>
          <div class="bg-amber-50 rounded-lg p-4 border border-amber-200">
            <div class="text-xs text-amber-600 font-medium">SGST</div>
            <div class="text-xl font-bold text-amber-800">{{ fmt(statement()!.sgstPaise) }}</div>
          </div>
          <div class="bg-pink-50 rounded-lg p-4 border border-pink-200">
            <div class="text-xs text-pink-600 font-medium">IGST</div>
            <div class="text-xl font-bold text-pink-800">{{ fmt(statement()!.igstPaise) }}</div>
          </div>
          <div class="bg-purple-50 rounded-lg p-4 border border-purple-200">
            <div class="text-xs text-purple-600 font-medium">Total GST</div>
            <div class="text-xl font-bold text-purple-800">{{ fmt(statement()!.totalGstPaise) }}</div>
          </div>
          <div class="bg-teal-50 rounded-lg p-4 border border-teal-200">
            <div class="text-xs text-teal-600 font-medium">ITC Eligible</div>
            <div class="text-xl font-bold text-teal-800">{{ fmt(statement()!.itcEligiblePaise) }}</div>
          </div>
          <div class="bg-red-50 rounded-lg p-4 border border-red-200">
            <div class="text-xs text-red-600 font-medium">Net Payable</div>
            <div class="text-xl font-bold text-red-800">{{ fmt(statement()!.netPayablePaise) }}</div>
          </div>
        </div>

        <!-- Detail Table -->
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <h3 class="text-lg font-semibold text-gray-700 mb-3">{{ statement()!.lineCount }} line items — {{ statement()!.period }}</h3>
          <p-table [value]="statement()!.lineItems" styleClass="p-datatable-sm p-datatable-gridlines" [scrollable]="true" [paginator]="true" [rows]="25" [rowsPerPageOptions]="[25, 50, 100]">
            <ng-template pTemplate="header">
              <tr>
                <th>Inv Date</th><th>Vendor</th><th>GSTIN</th><th>Invoice #</th><th>HSN/SAC</th><th>Category</th>
                <th class="text-right">Taxable (₹)</th><th>Rate</th>
                <th class="text-right">CGST</th><th class="text-right">SGST</th><th class="text-right">IGST</th>
                <th class="text-center">ITC</th><th class="text-center">RCM</th>
              </tr>
            </ng-template>
            <ng-template pTemplate="body" let-l>
              <tr>
                <td>{{ (l.invoiceDate || l.expenseDate) | date:'dd/MM/yy' }}</td>
                <td class="text-sm">{{ l.vendorName || '-' }}</td>
                <td class="text-xs font-mono">{{ l.vendorGstin || '-' }}</td>
                <td class="text-sm">{{ l.invoiceNumber || '-' }}</td>
                <td class="text-xs font-mono">{{ l.hsnSacCode || '-' }}</td>
                <td><p-tag [value]="l.category" severity="info" /></td>
                <td class="text-right font-medium">{{ fmt(l.taxableValuePaise) }}</td>
                <td class="text-center text-sm">{{ rateLabel(l.gstRateBps) }}</td>
                <td class="text-right text-sm">{{ fmt(l.cgstPaise) }}</td>
                <td class="text-right text-sm">{{ fmt(l.sgstPaise) }}</td>
                <td class="text-right text-sm">{{ fmt(l.igstPaise) }}</td>
                <td class="text-center">
                  @if (l.itcEligible) { <i class="pi pi-check-circle text-green-600"></i> }
                  @else { <i class="pi pi-minus-circle text-gray-300"></i> }
                </td>
                <td class="text-center">
                  @if (l.reverseCharge) { <i class="pi pi-exclamation-circle text-orange-500"></i> }
                  @else { <span class="text-gray-300">-</span> }
                </td>
              </tr>
            </ng-template>
            <ng-template pTemplate="emptymessage">
              <tr><td colspan="13" class="text-center text-gray-400 py-6">No approved/paid expenses for this period</td></tr>
            </ng-template>
          </p-table>
        </div>
      } @else {
        <div class="text-center text-gray-400 py-12"><i class="pi pi-chart-bar text-4xl mb-3 block opacity-30"></i> Select a month and click Generate</div>
      }
    </div>
  `,
})
export class GstStatementComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly msg = inject(MessageService);

  statement = signal<GstStatement | null>(null);
  loading = signal(false);
  buOptions = signal<Ref[]>([]);
  selectedMonth: Date = new Date();
  selectedBuId = '';

  ngOnInit(): void {
    this.http.get<{ data: Ref[] }>(`${environment.apiBaseUrl}/business-units?limit=200`).subscribe({
      next: (r) => this.buOptions.set(r.data),
    });
  }

  loadStatement(): void {
    const m = this.selectedMonth;
    const month = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
    let url = `${environment.apiBaseUrl}/finance/gst-statement?month=${month}`;
    if (this.selectedBuId) url += `&businessUnitId=${this.selectedBuId}`;

    this.loading.set(true);
    this.http.get<{ data: GstStatement }>(url).subscribe({
      next: (r) => { this.statement.set(r.data); this.loading.set(false); },
      error: () => { this.loading.set(false); this.msg.add({ severity: 'error', summary: 'Failed to load GST statement' }); },
    });
  }

  exportCsv(): void {
    const s = this.statement();
    if (!s || !s.lineItems.length) return;
    const headers = ['Invoice Date', 'Vendor', 'GSTIN', 'Invoice #', 'HSN/SAC', 'Category', 'Description', 'Taxable Value', 'GST Rate', 'CGST', 'SGST', 'IGST', 'Total GST', 'ITC', 'RCM'];
    const rows = s.lineItems.map((l) => [
      l.invoiceDate || l.expenseDate, l.vendorName || '', l.vendorGstin || '', l.invoiceNumber || '',
      l.hsnSacCode || '', l.category, `"${l.description}"`,
      (l.taxableValuePaise / 100).toFixed(2), this.rateLabel(l.gstRateBps),
      (l.cgstPaise / 100).toFixed(2), (l.sgstPaise / 100).toFixed(2), (l.igstPaise / 100).toFixed(2),
      (l.totalGstPaise / 100).toFixed(2), l.itcEligible ? 'Yes' : 'No', l.reverseCharge ? 'Yes' : 'No',
    ].join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `GST_Statement_${s.period}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  fmt(paise: number): string { return '\u20B9' + ((paise ?? 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
  rateLabel(bps: number): string { return (bps / 100) + '%'; }
}
