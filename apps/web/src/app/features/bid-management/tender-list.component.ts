import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { TooltipModule } from 'primeng/tooltip';
import { environment } from '../../../environments/environment';

interface Ref { id: string; name: string; }

interface TenderRow {
  id: string;
  tenderNumber: string;
  tenderTitle: string | null;
  tenderType: string;
  tenderCategory: string | null;
  tenderStatus: string;
  portalName: string | null;
  publishDate: string | null;
  submissionDeadlineOnline: string | null;
  estimatedValuePaise: number | null;
  emdAmountPaise: number | null;
  publishingAuthority: string | null;
  projectLocation: string | null;
  createdAt: string;
  opportunityId: string;
  opportunityTitle: string;
  opportunityStage: string;
  opportunityClosedStatus: string | null;
  businessUnitName: string;
  ownerName: string | null;
  contractValuePaise: number | null;
}

@Component({
  selector: 'app-tender-list',
  standalone: true,
  imports: [CommonModule, FormsModule, TableModule, TagModule, ButtonModule, SelectModule, InputTextModule, TooltipModule],
  template: `
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-semibold text-gray-800">Tenders</h2>
        <p class="text-sm text-gray-500 mt-1">All tenders linked to opportunities</p>
      </div>
    </div>

    <!-- Filters -->
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
      <div class="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Search</label>
          <input pInputText [(ngModel)]="filterSearch" placeholder="Number, title, authority..." class="w-full" (keyup.enter)="load()" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Status</label>
          <p-select appendTo="body" [(ngModel)]="filterStatus" [options]="statusOptions" optionLabel="label" optionValue="value" [showClear]="true" placeholder="All" class="w-full" (onChange)="load()" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Type</label>
          <p-select appendTo="body" [(ngModel)]="filterType" [options]="typeOptions" optionLabel="label" optionValue="value" [showClear]="true" placeholder="All" class="w-full" (onChange)="load()" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Business Unit</label>
          <p-select appendTo="body" [(ngModel)]="filterBuId" [options]="buOptions()" optionLabel="name" optionValue="id" [showClear]="true" placeholder="All BUs" class="w-full" (onChange)="load()" />
        </div>
        <p-button label="Reset" icon="pi pi-refresh" severity="secondary" [outlined]="true" (onClick)="resetFilters()" />
      </div>
    </div>

    @if (loading()) {
      <div class="flex items-center gap-2 text-gray-500 py-12 justify-center"><i class="pi pi-spin pi-spinner text-2xl"></i> Loading...</div>
    } @else {
      <!-- Summary Cards -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div class="text-sm text-gray-500">Total Tenders</div>
          <div class="text-2xl font-bold text-gray-800">{{ tenders().length }}</div>
        </div>
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div class="text-sm text-gray-500">Open for Submission</div>
          <div class="text-2xl font-bold text-blue-700">{{ openCount() }}</div>
        </div>
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div class="text-sm text-gray-500">Submission Closed</div>
          <div class="text-2xl font-bold text-amber-700">{{ closedCount() }}</div>
        </div>
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div class="text-sm text-gray-500">Total Estimated Value</div>
          <div class="text-2xl font-bold text-green-700">{{ formatCrores(totalEstimatedValue()) }}</div>
        </div>
      </div>

      <div class="bg-white rounded-lg shadow-sm border border-gray-200">
        <p-table [value]="tenders()" styleClass="p-datatable-sm" [paginator]="true" [rows]="20"
                 [rowsPerPageOptions]="[10,20,50]" [sortField]="'submissionDeadlineOnline'" [sortOrder]="1"
                 [globalFilterFields]="['tenderNumber','tenderTitle','publishingAuthority','opportunityTitle']">
          <ng-template pTemplate="header">
            <tr>
              <th class="font-semibold" pSortableColumn="tenderNumber">Tender No <p-sortIcon field="tenderNumber" /></th>
              <th class="font-semibold">Opportunity</th>
              <th class="font-semibold">BU</th>
              <th class="font-semibold">Type</th>
              <th class="font-semibold">Portal</th>
              <th class="font-semibold" pSortableColumn="submissionDeadlineOnline">Submission Due <p-sortIcon field="submissionDeadlineOnline" /></th>
              <th class="font-semibold text-right" pSortableColumn="estimatedValuePaise">Est. Value <p-sortIcon field="estimatedValuePaise" /></th>
              <th class="font-semibold text-right">EMD</th>
              <th class="font-semibold" pSortableColumn="tenderStatus">Status <p-sortIcon field="tenderStatus" /></th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-t>
            <tr class="cursor-pointer hover:bg-gray-50" (click)="goToTender(t.id)">
              <td>
                <div>
                  <span class="font-medium text-blue-700">{{ t.tenderNumber }}</span>
                  @if (t.tenderTitle) {
                    <div class="text-xs text-gray-500 truncate max-w-[200px]">{{ t.tenderTitle }}</div>
                  }
                </div>
              </td>
              <td>
                <div>
                  <span class="text-sm font-medium">{{ t.opportunityTitle }}</span>
                  @if (t.ownerName) { <div class="text-xs text-gray-400">{{ t.ownerName }}</div> }
                </div>
              </td>
              <td><span class="text-sm">{{ t.businessUnitName }}</span></td>
              <td><p-tag [value]="t.tenderType" severity="info" [style]="{'font-size':'0.65rem'}" /></td>
              <td><span class="text-sm">{{ t.portalName || '—' }}</span></td>
              <td>
                @if (t.submissionDeadlineOnline) {
                  <span class="text-sm" [class]="isOverdue(t.submissionDeadlineOnline) ? 'text-red-600 font-semibold' : isUpcoming(t.submissionDeadlineOnline) ? 'text-amber-600 font-medium' : ''">
                    {{ t.submissionDeadlineOnline | date:'dd-MMM-yy, h:mm a' }}
                  </span>
                  @if (isUpcoming(t.submissionDeadlineOnline) && !isOverdue(t.submissionDeadlineOnline)) {
                    <div class="text-xs text-amber-500">{{ daysLeft(t.submissionDeadlineOnline) }}</div>
                  }
                } @else {
                  <span class="text-gray-400">—</span>
                }
              </td>
              <td class="text-right">
                <span class="text-sm font-medium">{{ t.estimatedValuePaise ? formatLakhs(t.estimatedValuePaise) : '—' }}</span>
              </td>
              <td class="text-right">
                <span class="text-sm">{{ t.emdAmountPaise ? formatLakhs(t.emdAmountPaise) : '—' }}</span>
              </td>
              <td><p-tag [value]="t.tenderStatus" [severity]="statusSeverity(t.tenderStatus)" [style]="{'font-size':'0.65rem'}" /></td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td colspan="9" class="text-center py-8 text-gray-500">No tenders found. Tenders are created from the Opportunity detail page by enabling "Tender Released".</td></tr>
          </ng-template>
        </p-table>
      </div>
    }
  `,
})
export class TenderListComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  tenders = signal<TenderRow[]>([]);
  loading = signal(true);
  buOptions = signal<Ref[]>([]);

  filterSearch = '';
  filterStatus = '';
  filterType = '';
  filterBuId = '';

  statusOptions = [
    { label: 'Published', value: 'PUBLISHED' }, { label: 'Corrigendum', value: 'CORRIGENDUM' },
    { label: 'Pre-Bid Done', value: 'PREBID_DONE' }, { label: 'Submission Closed', value: 'SUBMISSION_CLOSED' },
    { label: 'Tech Opened', value: 'TECH_OPENED' }, { label: 'Fin Opened', value: 'FIN_OPENED' },
    { label: 'Awarded', value: 'AWARDED' }, { label: 'Cancelled', value: 'CANCELLED' },
  ];

  typeOptions = [
    { label: 'Open', value: 'OPEN' }, { label: 'Limited', value: 'LIMITED' },
    { label: 'Single Source', value: 'SINGLE_SOURCE' }, { label: 'EOI', value: 'EOI' },
    { label: 'Reverse Auction', value: 'REVERSE_AUCTION' },
  ];

  ngOnInit(): void {
    this.loadFilters();
    this.load();
  }

  private loadFilters(): void {
    this.http.get<{ data: Ref[] }>(`${environment.apiBaseUrl}/business-units?limit=200`)
      .subscribe({ next: (r) => this.buOptions.set(r.data) });
  }

  load(): void {
    this.loading.set(true);
    const params: string[] = [];
    if (this.filterSearch) params.push(`q=${encodeURIComponent(this.filterSearch)}`);
    if (this.filterStatus) params.push(`tenderStatus=${this.filterStatus}`);
    if (this.filterType) params.push(`tenderType=${this.filterType}`);
    if (this.filterBuId) params.push(`buId=${this.filterBuId}`);
    params.push('limit=200');
    const qs = params.length > 0 ? `?${params.join('&')}` : '';

    this.http.get<{ data: TenderRow[] }>(`${environment.apiBaseUrl}/tenders${qs}`).subscribe({
      next: (r) => { this.tenders.set(r.data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  resetFilters(): void {
    this.filterSearch = '';
    this.filterStatus = '';
    this.filterType = '';
    this.filterBuId = '';
    this.load();
  }

  goToTender(id: string): void {
    this.router.navigate(['/bid-management/tenders', id]);
  }

  // Summary computations
  openCount(): number {
    return this.tenders().filter((t) =>
      ['PUBLISHED', 'CORRIGENDUM', 'PREBID_DONE'].includes(t.tenderStatus)
    ).length;
  }

  closedCount(): number {
    return this.tenders().filter((t) =>
      ['SUBMISSION_CLOSED', 'TECH_OPENED', 'FIN_OPENED', 'AWARDED'].includes(t.tenderStatus)
    ).length;
  }

  totalEstimatedValue(): number {
    return this.tenders().reduce((sum, t) => sum + (t.estimatedValuePaise ?? 0), 0);
  }

  // Date helpers
  isOverdue(dateStr: string): boolean {
    return new Date(dateStr).getTime() < Date.now();
  }

  isUpcoming(dateStr: string): boolean {
    const diff = new Date(dateStr).getTime() - Date.now();
    return diff > 0 && diff < 7 * 24 * 60 * 60 * 1000; // within 7 days
  }

  daysLeft(dateStr: string): string {
    const diff = new Date(dateStr).getTime() - Date.now();
    const days = Math.ceil(diff / (24 * 60 * 60 * 1000));
    if (days <= 0) return 'Overdue';
    if (days === 1) return '1 day left';
    return `${days} days left`;
  }

  // Formatting
  statusSeverity(s: string): 'info' | 'success' | 'warn' | 'danger' | 'secondary' {
    switch (s) {
      case 'PUBLISHED': return 'info';
      case 'CORRIGENDUM': return 'warn';
      case 'PREBID_DONE': return 'info';
      case 'SUBMISSION_CLOSED': return 'secondary';
      case 'TECH_OPENED': case 'FIN_OPENED': return 'warn';
      case 'AWARDED': return 'success';
      case 'CANCELLED': return 'danger';
      default: return 'info';
    }
  }

  formatLakhs(paise: number): string {
    const r = paise / 100;
    if (r >= 10000000) return '₹' + (r / 10000000).toFixed(2) + ' Cr';
    if (r >= 100000) return '₹' + (r / 100000).toFixed(2) + ' L';
    return '₹' + r.toLocaleString('en-IN');
  }

  formatCrores(paise: number): string {
    const r = paise / 100;
    if (r >= 10000000) return '₹' + (r / 10000000).toFixed(2) + ' Cr';
    if (r >= 100000) return '₹' + (r / 100000).toFixed(2) + ' L';
    if (r > 0) return '₹' + r.toLocaleString('en-IN');
    return '₹0';
  }
}
