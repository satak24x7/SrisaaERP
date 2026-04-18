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
  submissionDue: string | null;
  businessUnitId: string; businessUnitName: string | null;
  accountId: string | null; accountName: string | null;
  ownerUserId: string | null; ownerName: string | null;
}
interface PipelineData {
  summary: { totalOpportunities: number; totalContractValuePaise: number; weightedPipelineValuePaise: number };
  byStage: Array<{ stage: string; count: number; totalValuePaise: number; weightedValuePaise: number }>;
  byBu: Array<{ buId: string; buName: string; count: number; totalValuePaise: number }>;
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

      <!-- Charts -->
      @if (pipeline()!.byStage.length > 0) {
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 class="text-md font-semibold text-gray-700 mb-4">Pipeline by Stage</h3>
            <p-chart type="bar" [data]="stageChartData()" [options]="barOptions" height="300px" />
          </div>
          <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 class="text-md font-semibold text-gray-700 mb-4">Pipeline by Business Unit</h3>
            @if (pipeline()!.byBu.length > 0) {
              <p-chart type="doughnut" [data]="buChartData()" [options]="doughnutOptions" height="300px" />
            } @else {
              <div class="text-gray-400 text-center py-12">No data</div>
            }
          </div>
        </div>
      }

      <!-- Opportunities Table -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 class="text-md font-semibold text-gray-700 mb-4">Opportunities</h3>
        <p-table [value]="pipeline()!.opportunities" styleClass="p-datatable-sm" [paginator]="true" [rows]="20" [rowsPerPageOptions]="[10,20,50]">
          <ng-template pTemplate="header">
            <tr>
              <th>Title</th><th>Account</th><th>BU</th><th>Stage</th>
              <th class="text-right">Value (₹)</th><th class="text-right">Prob%</th>
              <th class="text-right">Weighted (₹)</th><th>Owner</th><th>Due</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-opp>
            <tr class="cursor-pointer hover:bg-gray-50" (click)="goToOpp(opp.id)">
              <td class="font-medium text-blue-700">{{ opp.title }}</td>
              <td>{{ opp.accountName || '-' }}</td>
              <td>{{ opp.businessUnitName || '-' }}</td>
              <td><p-tag [value]="opp.stage" [severity]="stageSeverity(opp.stage)" /></td>
              <td class="text-right">{{ formatLakhs(opp.contractValuePaise || 0) }}</td>
              <td class="text-right">{{ opp.probabilityPct ?? '-' }}%</td>
              <td class="text-right font-medium">{{ formatLakhs(weightedValue(opp)) }}</td>
              <td>{{ opp.ownerName || '-' }}</td>
              <td>{{ opp.submissionDue | date:'mediumDate' }}</td>
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
  loading = signal(true);

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
      next: (r) => { this.pipeline.set(r.data); this.loading.set(false); },
      error: () => { this.loading.set(false); },
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

  goToOpp(id: string): void { this.router.navigate(['/sales/opportunities', id]); }

  stageSeverity(s: string): 'info' | 'success' | 'warn' | 'danger' {
    const sl = s.toLowerCase();
    if (sl.includes('award')) return 'success';
    if (sl.includes('lost')) return 'danger';
    if (sl.includes('bid')) return 'warn';
    return 'info';
  }
}
