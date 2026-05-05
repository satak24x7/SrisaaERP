import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ChartModule } from 'primeng/chart';
import { environment } from '../../../environments/environment';

interface Ref { id: string; name: string; }
interface LookupItem { label: string; value: string; isActive?: boolean; }
interface OppRow {
  id: string; title: string; stage: string; entryPath: string;
  contractValuePaise: number | null; probabilityPct: number | null;
  submissionDue: string | null; expectedCloseMonth: string | null;
  businessUnitId: string; businessUnitName: string | null;
  accountId: string | null; accountName: string | null;
  ownerUserId: string | null; ownerName: string | null;
}
interface PipelineData {
  summary: { totalOpportunities: number; totalContractValuePaise: number; weightedPipelineValuePaise: number };
  byStage: Array<{ stage: string; count: number; totalValuePaise: number; weightedValuePaise: number }>;
  byBu: Array<{ buId: string; buName: string; count: number; totalValuePaise: number; weightedValuePaise: number }>;
  byCloseMonth: Array<{ closeMonth: string; count: number; totalValuePaise: number; weightedValuePaise: number }>;
  opportunities: OppRow[];
}
interface OrdersData {
  summary: { totalOrders: number; totalValuePaise: number };
  byBu: Array<{ buName: string; count: number; totalValuePaise: number }>;
  byMonth: Array<{ month: string; count: number; totalValuePaise: number }>;
  byMonthBu: Array<{ month: string; buName: string; totalValuePaise: number }>;
  opportunities: OppRow[];
}

@Component({
  selector: 'app-pipeline-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, SelectModule, TableModule, TagModule, ChartModule],
  template: `
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-semibold text-gray-800">Sales Pipeline</h2>
        <p class="text-sm text-gray-500 mt-1">Probability-weighted pipeline view</p>
      </div>
    </div>

    <!-- Filters -->
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Business Unit</label>
          <p-select appendTo="body" [(ngModel)]="filterBuId" [options]="buOptions()" optionLabel="name" optionValue="id" [showClear]="true" placeholder="All BUs" class="w-full" (onChange)="load()" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Stage</label>
          <p-select appendTo="body" [(ngModel)]="filterStage" [options]="stageOptions()" optionLabel="label" optionValue="value" [showClear]="true" placeholder="All stages" class="w-full" (onChange)="load()" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Owner</label>
          <p-select appendTo="body" [(ngModel)]="filterOwner" [options]="userOptions()" optionLabel="name" optionValue="id" [filter]="true" [showClear]="true" placeholder="All owners" class="w-full" (onChange)="load()" />
        </div>
        <p-button label="Reset" icon="pi pi-refresh" severity="secondary" [outlined]="true" (onClick)="resetFilters()" />
      </div>
    </div>

    @if (loading()) {
      <div class="flex items-center gap-2 text-gray-500 py-12 justify-center"><i class="pi pi-spin pi-spinner text-2xl"></i> Loading...</div>
    } @else if (pipeline()) {
      <!-- Summary Cards -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div class="text-sm text-gray-500 font-medium">Total Opportunities</div>
          <div class="text-3xl font-bold text-gray-800 mt-1">{{ pipeline()!.summary.totalOpportunities }}</div>
        </div>
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div class="text-sm text-gray-500 font-medium">Total Contract Value</div>
          <div class="text-3xl font-bold text-blue-700 mt-1">{{ formatCrores(pipeline()!.summary.totalContractValuePaise) }}</div>
        </div>
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div class="text-sm text-gray-500 font-medium">Weighted Pipeline Value</div>
          <div class="text-3xl font-bold text-green-700 mt-1">{{ formatCrores(pipeline()!.summary.weightedPipelineValuePaise) }}</div>
        </div>
      </div>

      <!-- Charts Row 1: Pipeline by Stage + Weighted Pipeline by BU -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 class="text-md font-semibold text-gray-700 mb-4">Pipeline by Stage</h3>
          @if (pipeline()!.byStage.length > 0) {
            <p-chart type="bar" [data]="stageChartData()" [options]="barOptions" height="300px" />
          } @else {
            <div class="text-gray-400 text-center py-12">No data</div>
          }
        </div>
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 class="text-md font-semibold text-gray-700 mb-4">Weighted Pipeline by Business Unit</h3>
          @if (pipeline()!.byBu.length > 0) {
            <p-chart type="pie" [data]="weightedBuChartData()" [options]="doughnutOptions" height="300px" />
          } @else {
            <div class="text-gray-400 text-center py-12">No data</div>
          }
        </div>
      </div>

      <!-- Charts Row 2: Pipeline by BU + Orders Booked (last 12 months by BU) -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 class="text-md font-semibold text-gray-700 mb-4">Pipeline Value by Business Unit</h3>
          @if (pipeline()!.byBu.length > 0) {
            <p-chart type="doughnut" [data]="buChartData()" [options]="doughnutOptions" height="300px" />
          } @else {
            <div class="text-gray-400 text-center py-12">No data</div>
          }
        </div>
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 class="text-md font-semibold text-gray-700 mb-4">Orders Booked — Last 12 Months by BU</h3>
          @if (orders() && orders()!.byMonthBu.length > 0) {
            <p-chart type="bar" [data]="ordersStackedChartData()" [options]="stackedBarOptions" height="300px" />
          } @else {
            <div class="text-gray-400 text-center py-12">No orders booked yet</div>
          }
        </div>
      </div>

      <!-- Chart Row 3: Pipeline by Expected Close Month -->
      @if (closeMonthChart() && closeMonthChart()['labels']) {
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h3 class="text-md font-semibold text-gray-700 mb-4">Pipeline by Expected Close Month</h3>
          <p-chart type="bar" [data]="closeMonthChart()" [options]="closeMonthBarOptions" height="300px" />
        </div>
      }

      <!-- Summary: Orders Booked -->
      @if (orders() && orders()!.summary.totalOrders > 0) {
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div class="text-sm text-gray-500 font-medium">Total Orders Won</div>
            <div class="text-3xl font-bold text-gray-800 mt-1">{{ orders()!.summary.totalOrders }}</div>
          </div>
          <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div class="text-sm text-gray-500 font-medium">Total Order Value</div>
            <div class="text-3xl font-bold text-emerald-700 mt-1">{{ formatCrores(orders()!.summary.totalValuePaise) }}</div>
          </div>
        </div>
      }

      <!-- Opportunities Table -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 class="text-md font-semibold text-gray-700 mb-4">Active Opportunities</h3>
        <p-table [value]="pipeline()!.opportunities" styleClass="p-datatable-sm" [paginator]="true" [rows]="20" [rowsPerPageOptions]="[10,20,50]">
          <ng-template pTemplate="header">
            <tr>
              <th>Title</th><th>Account</th><th>BU</th><th>Stage</th>
              <th class="text-right">Value (₹)</th><th class="text-right">Prob%</th>
              <th class="text-right">Weighted (₹)</th><th>Owner</th><th>Close Month</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-opp>
            <tr class="cursor-pointer hover:bg-gray-50" (click)="goToOpp(opp.id)">
              <td class="font-medium">{{ opp.title }}</td>
              <td>{{ opp.accountName || '-' }}</td>
              <td>{{ opp.businessUnitName || '-' }}</td>
              <td><p-tag [value]="opp.stage" [severity]="stageSeverity(opp.stage)" /></td>
              <td class="text-right">{{ formatLakhs(opp.contractValuePaise || 0) }}</td>
              <td class="text-right">{{ opp.probabilityPct ?? '-' }}%</td>
              <td class="text-right font-medium">{{ formatLakhs(weightedValue(opp)) }}</td>
              <td>{{ opp.ownerName || '-' }}</td>
              <td>
                @if (opp.expectedCloseMonth) {
                  <span class="text-sm font-medium" [class]="closeMonthClass(opp.expectedCloseMonth)">{{ formatCloseMonth(opp.expectedCloseMonth) }}</span>
                } @else { - }
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td colspan="9" class="text-center text-gray-400 py-8">No opportunities found</td></tr>
          </ng-template>
        </p-table>
      </div>
    }
  `,
})
export class PipelineDashboardComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  pipeline = signal<PipelineData | null>(null);
  orders = signal<OrdersData | null>(null);
  loading = signal(true);
  closeMonthChart = signal<Record<string, unknown>>({});

  buOptions = signal<Ref[]>([]);
  stageOptions = signal<LookupItem[]>([]);
  userOptions = signal<Ref[]>([]);

  filterBuId = '';
  filterStage = '';
  filterOwner = '';

  barOptions = {
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true, ticks: { callback: (v: number) => this.formatCroresShort(v) } } },
    maintainAspectRatio: false,
  };

  doughnutOptions = {
    plugins: { legend: { position: 'bottom' as const } },
    maintainAspectRatio: false,
  };

  stackedBarOptions = {
    plugins: { legend: { position: 'bottom' as const } },
    scales: {
      x: { stacked: true },
      y: { stacked: true, beginAtZero: true, ticks: { callback: (v: number) => this.formatCroresShort(v) } },
    },
    maintainAspectRatio: false,
  };

  ngOnInit(): void {
    this.loadFilters();
    this.load();
  }

  private loadFilters(): void {
    this.http.get<{ data: Ref[] }>(`${environment.apiBaseUrl}/business-units?limit=200`).subscribe({ next: (r) => this.buOptions.set(r.data) });
    this.http.get<{ data: Array<{ id: string; fullName: string }> }>(`${environment.apiBaseUrl}/users?limit=200`).subscribe({
      next: (r) => this.userOptions.set(r.data.map((u) => ({ id: u.id, name: u.fullName }))),
    });
    this.http.get<{ data: LookupItem[] }>(`${environment.apiBaseUrl}/lookup-lists/by-code/opportunity_stage/items`).subscribe({
      next: (r) => this.stageOptions.set(r.data.filter((i) => i.isActive !== false)),
      error: () => {},
    });
  }

  load(): void {
    this.loading.set(true);
    const params: string[] = [];
    if (this.filterBuId) params.push(`buId=${this.filterBuId}`);
    if (this.filterStage) params.push(`stage=${this.filterStage}`);
    if (this.filterOwner) params.push(`ownerUserId=${this.filterOwner}`);
    const qs = params.length > 0 ? `?${params.join('&')}` : '';

    this.http.get<{ data: PipelineData }>(`${environment.apiBaseUrl}/opportunities/pipeline${qs}`).subscribe({
      next: (r) => { this.pipeline.set(r.data); this.buildCloseMonthChart(r.data); this.loading.set(false); },
      error: () => { this.loading.set(false); },
    });

    // Load orders booked (same filters)
    this.http.get<{ data: OrdersData }>(`${environment.apiBaseUrl}/opportunities/orders-booked${qs}`).subscribe({
      next: (r) => this.orders.set(r.data),
    });
  }

  resetFilters(): void {
    this.filterBuId = '';
    this.filterStage = '';
    this.filterOwner = '';
    this.load();
  }

  stageChartData() {
    const p = this.pipeline();
    if (!p) return {};
    const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
    return {
      labels: p.byStage.map((s) => s.stage),
      datasets: [{
        label: 'Value (₹)',
        data: p.byStage.map((s) => s.totalValuePaise / 100),
        backgroundColor: p.byStage.map((_, i) => colors[i % colors.length]),
      }],
    };
  }

  buChartData() {
    const p = this.pipeline();
    if (!p) return {};
    const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
    return {
      labels: p.byBu.map((b) => b.buName),
      datasets: [{
        data: p.byBu.map((b) => b.totalValuePaise / 100),
        backgroundColor: p.byBu.map((_, i) => colors[i % colors.length]),
      }],
    };
  }

  weightedValue(opp: OppRow): number {
    return Math.round((opp.contractValuePaise ?? 0) * (opp.probabilityPct ?? 0) / 100);
  }

  formatCrores(paise: number): string {
    const rupees = paise / 100;
    if (rupees >= 10000000) return '₹' + (rupees / 10000000).toFixed(2) + ' Cr';
    if (rupees >= 100000) return '₹' + (rupees / 100000).toFixed(2) + ' L';
    return '₹' + rupees.toLocaleString('en-IN');
  }

  formatCroresShort(v: number): string {
    if (v >= 10000000) return (v / 10000000).toFixed(1) + 'Cr';
    if (v >= 100000) return (v / 100000).toFixed(1) + 'L';
    if (v >= 1000) return (v / 1000).toFixed(0) + 'K';
    return String(v);
  }

  formatLakhs(paise: number): string {
    const rupees = paise / 100;
    if (rupees >= 10000000) return '₹' + (rupees / 10000000).toFixed(2) + ' Cr';
    if (rupees >= 100000) return '₹' + (rupees / 100000).toFixed(2) + ' L';
    return '₹' + rupees.toLocaleString('en-IN');
  }

  weightedBuChartData() {
    const p = this.pipeline();
    if (!p) return {};
    const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
    return {
      labels: p.byBu.map((b) => b.buName),
      datasets: [{
        data: p.byBu.map((b) => b.weightedValuePaise / 100),
        backgroundColor: p.byBu.map((_, i) => colors[i % colors.length]),
      }],
    };
  }

  closeMonthBarOptions = {
    plugins: {
      legend: { position: 'bottom' as const },
      tooltip: {
        callbacks: {
          label: (ctx: { dataset: { label: string }; raw: number }) =>
            `${ctx.dataset.label}: ₹${this.formatCroresShort(ctx.raw)}`,
        },
      },
    },
    scales: {
      x: { stacked: true },
      y: { stacked: true, beginAtZero: true, ticks: { callback: (v: number) => this.formatCroresShort(v) } },
    },
    maintainAspectRatio: false,
  };

  private buildCloseMonthChart(p: PipelineData): void {
    if (!p.byCloseMonth || p.byCloseMonth.length === 0) { this.closeMonthChart.set({}); return; }

    // Build a lookup from API data
    const dataMap = new Map<string, { total: number; weighted: number }>();
    for (const m of p.byCloseMonth) {
      dataMap.set(m.closeMonth, { total: m.totalValuePaise / 100, weighted: m.weightedValuePaise / 100 });
    }

    // Fill all months from current month to the last month in data
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastMonth = p.byCloseMonth[p.byCloseMonth.length - 1]!.closeMonth;
    const startMonth = currentMonth < (p.byCloseMonth[0]?.closeMonth ?? currentMonth) ? currentMonth : p.byCloseMonth[0]!.closeMonth;
    const endMonth = lastMonth > currentMonth ? lastMonth : currentMonth;

    const allMonths: string[] = [];
    let [sy, sm] = (startMonth < currentMonth ? startMonth : currentMonth).split('-').map(Number);
    const [ey, em] = endMonth.split('-').map(Number);
    while (sy! < ey! || (sy === ey && sm! <= em!)) {
      allMonths.push(`${sy}-${String(sm).padStart(2, '0')}`);
      sm!++;
      if (sm! > 12) { sm = 1; sy!++; }
    }

    const labels = allMonths.map((m) => {
      const [y, mon] = m.split('-');
      return new Date(Number(y), Number(mon) - 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
    });

    // Stacked: weighted portion (green) at bottom, unweighted remainder (blue) on top
    const weightedData = allMonths.map((m) => dataMap.get(m)?.weighted ?? 0);
    const remainderData = allMonths.map((m) => {
      const d = dataMap.get(m);
      return d ? d.total - d.weighted : 0;
    });

    this.closeMonthChart.set({
      labels,
      datasets: [
        {
          label: 'Weighted Value',
          data: weightedData,
          backgroundColor: '#10B981',
        },
        {
          label: 'Unweighted Remainder',
          data: remainderData,
          backgroundColor: '#93C5FD',
        },
      ],
    });
  }

  ordersStackedChartData() {
    const o = this.orders();
    if (!o || o.byMonthBu.length === 0) return {};

    // Get unique months and BUs
    const months = [...new Set(o.byMonthBu.map((r) => r.month))].sort();
    const bus = [...new Set(o.byMonthBu.map((r) => r.buName))];
    const colors = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];

    const monthLabels = months.map((m) => {
      const [y, mon] = m.split('-');
      return new Date(Number(y), Number(mon) - 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
    });

    // Build one dataset per BU
    const datasets = bus.map((buName, i) => ({
      label: buName,
      data: months.map((month) => {
        const row = o.byMonthBu.find((r) => r.month === month && r.buName === buName);
        return row ? row.totalValuePaise / 100 : 0;
      }),
      backgroundColor: colors[i % colors.length],
    }));

    return { labels: monthLabels, datasets };
  }

  formatCloseMonth(m: string): string {
    const [y, mon] = m.split('-');
    return new Date(Number(y), Number(mon) - 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  }

  closeMonthClass(m: string): string {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (m < currentMonth) return 'text-red-600';
    if (m === currentMonth) return 'text-green-600';
    const [y, mon] = m.split('-').map(Number);
    const mQ = Math.ceil(mon! / 3);
    const nowQ = Math.ceil((now.getMonth() + 1) / 3);
    if (y === now.getFullYear() && mQ === nowQ) return 'text-orange-500';
    return '';
  }

  goToOpp(id: string): void { this.router.navigate(['/sales/opportunities', id]); }

  stageSeverity(s: string): 'info' | 'success' | 'warn' | 'danger' {
    const sl = s.toLowerCase();
    if (sl.includes('award')) return 'success';
    if (sl.includes('lost')) return 'danger';
    if (sl.includes('bid')) return 'warn';
    return 'info';
  }
}
