import { Component, ChangeDetectionStrategy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';

interface Grn {
  id: string; grnNo: string; poId: string; poNumber: string;
  vendorName: string; receivedDate: string;
  qualityStatus: string; lineCount: number;
  createdAt: string;
}

interface PoOption { id: string; poNumber: string; vendorName: string; }

@Component({
  selector: 'app-grn-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, TableModule, TagModule, ButtonModule, SelectModule, ToastModule],
  providers: [MessageService],
  template: `
    <p-toast />
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-semibold text-gray-800">Goods Receipt Notes</h2>
        <p class="text-sm text-gray-500 mt-1">Inward delivery notes against purchase orders</p>
      </div>
      <p-button label="New GRN" icon="pi pi-plus" (onClick)="router.navigate(['/procurement/grns/new'])" />
    </div>

    <div class="flex gap-3 mb-4">
      <p-select [options]="poOptions()" [(ngModel)]="filterPo" optionLabel="label" optionValue="value"
        placeholder="Filter by PO" [showClear]="true" [filter]="true" filterBy="label" styleClass="w-64" (onChange)="load()" />
    </div>

    @if (loading()) {
      <div class="flex items-center gap-2 text-gray-500 py-12 justify-center"><i class="pi pi-spin pi-spinner text-2xl"></i> Loading...</div>
    } @else {
      <div class="bg-white rounded-lg shadow-sm border border-gray-200">
        <p-table [value]="grns()" styleClass="p-datatable-sm p-datatable-striped" [rowHover]="true">
          <ng-template pTemplate="header">
            <tr>
              <th class="font-semibold">GRN No</th>
              <th class="font-semibold">PO No</th>
              <th class="font-semibold">Vendor</th>
              <th class="font-semibold">Received Date</th>
              <th class="font-semibold">Quality Status</th>
              <th class="font-semibold text-right">Lines</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-g>
            <tr class="cursor-pointer" (click)="router.navigate(['/procurement/grns', g.id])">
              <td><span class="font-mono font-semibold text-sm">{{ g.grnNo }}</span></td>
              <td><span class="font-mono text-sm">{{ g.poNumber }}</span></td>
              <td>{{ g.vendorName }}</td>
              <td>{{ g.receivedDate | date:'dd-MMM-yyyy' }}</td>
              <td><p-tag [value]="g.qualityStatus" [severity]="qualitySeverity(g.qualityStatus)" /></td>
              <td class="text-right">{{ g.lineCount }}</td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td colspan="6" class="text-center py-8 text-gray-500">No GRNs found.</td></tr>
          </ng-template>
        </p-table>
      </div>
    }
  `,
  styles: [`:host { display: block; padding: 1.5rem; }`],
})
export class GrnListComponent implements OnInit {
  private http = inject(HttpClient);
  router = inject(Router);
  private msg = inject(MessageService);

  grns = signal<Grn[]>([]);
  poOptions = signal<{ label: string; value: string }[]>([]);
  loading = signal(false);
  filterPo = '';

  ngOnInit() {
    this.loadPoOptions();
    this.load();
  }

  loadPoOptions() {
    this.http.get<{ data: PoOption[] }>(`${environment.apiBaseUrl}/purchase-orders?status=ISSUED&limit=200`).subscribe({
      next: (r) => {
        this.poOptions.set(r.data.map(po => ({
          label: `${po.poNumber} — ${po.vendorName}`,
          value: po.id,
        })));
      },
    });
  }

  load() {
    this.loading.set(true);
    let url = `${environment.apiBaseUrl}/grns?limit=200`;
    if (this.filterPo) url += `&poId=${this.filterPo}`;
    this.http.get<{ data: Grn[] }>(url).subscribe({
      next: (r) => { this.grns.set(r.data); this.loading.set(false); },
      error: () => { this.msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to load GRNs' }); this.loading.set(false); },
    });
  }

  qualitySeverity(s: string): 'success' | 'warn' | 'danger' | 'info' | 'secondary' {
    switch (s) {
      case 'ACCEPTED': return 'success';
      case 'PARTIAL': return 'warn';
      case 'REJECTED': return 'danger';
      case 'PENDING': return 'secondary';
      default: return 'info';
    }
  }
}
