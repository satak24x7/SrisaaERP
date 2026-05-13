import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormBuilder, FormArray, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { TextareaModule } from 'primeng/textarea';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';

interface PoOption {
  id: string; poNumber: string; vendorName: string;
}
interface PoLine {
  id: string; description: string; uom: string; qty: number;
  deliveredQty: number; pendingQty: number; ratePaise: number;
}
interface GrnLine {
  id: string; poLineId: string; description: string; uom: string;
  qtyReceived: number; qtyAccepted: number; qtyRejected: number;
  rejectionReason: string | null; ratePaise: number;
}
interface Grn {
  id: string; grnNo: string; poId: string; poNumber: string;
  vendorName: string; receivedDate: string;
  warehouseNote: string | null; notes: string | null;
  qualityStatus: string;
  lines: GrnLine[];
  createdAt: string;
}

@Component({
  selector: 'app-grn-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, TableModule, TagModule, ButtonModule, InputTextModule, InputNumberModule, SelectModule, DatePickerModule, TextareaModule, ToastModule],
  providers: [MessageService],
  template: `
    <p-toast />
    <div class="flex items-center gap-3 mb-6">
      <p-button icon="pi pi-arrow-left" [rounded]="true" [text]="true" (onClick)="router.navigate(['/procurement/grns'])" />
      <div>
        <h2 class="text-2xl font-semibold text-gray-800">
          {{ isNew() ? 'New Goods Receipt' : ('GRN ' + grn()?.grnNo) }}
        </h2>
        @if (!isNew() && grn()) {
          <p class="text-sm text-gray-500 mt-1">PO: {{ grn()!.poNumber }} &middot; Vendor: {{ grn()!.vendorName }}</p>
        }
      </div>
    </div>

    @if (loading()) {
      <div class="flex items-center gap-2 text-gray-500 py-12 justify-center"><i class="pi pi-spin pi-spinner text-2xl"></i> Loading...</div>
    } @else if (isNew()) {
      <!-- CREATE MODE -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Purchase Order *</label>
            <p-select [options]="poOptions()" [(ngModel)]="selectedPoId" optionLabel="label" optionValue="value"
              placeholder="Select PO" [filter]="true" filterBy="label" styleClass="w-full" (onChange)="onPoSelected()" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Received Date *</label>
            <p-datepicker [(ngModel)]="receivedDate" dateFormat="dd-M-yy" styleClass="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Warehouse Note</label>
            <input pInputText [(ngModel)]="warehouseNote" class="w-full" />
          </div>
          <div class="flex flex-col gap-1 md:col-span-3">
            <label class="text-sm font-medium text-gray-700">Notes</label>
            <textarea pTextarea [(ngModel)]="notes" rows="2" class="w-full"></textarea>
          </div>
        </div>

        @if (poLines().length > 0) {
          <h3 class="text-lg font-semibold text-gray-700 mb-3">PO Lines — Enter Received Quantities</h3>
          <div class="overflow-x-auto mb-6">
            <table class="w-full text-sm border border-gray-200">
              <thead class="bg-gray-50">
                <tr>
                  <th class="p-2 text-left font-semibold">#</th>
                  <th class="p-2 text-left font-semibold">Description</th>
                  <th class="p-2 text-left font-semibold">UOM</th>
                  <th class="p-2 text-right font-semibold">Ordered</th>
                  <th class="p-2 text-right font-semibold">Pending</th>
                  <th class="p-2 text-right font-semibold">Received</th>
                  <th class="p-2 text-right font-semibold">Accepted</th>
                  <th class="p-2 text-right font-semibold">Rejected</th>
                  <th class="p-2 text-left font-semibold">Rejection Reason</th>
                </tr>
              </thead>
              <tbody>
                @for (line of poLines(); track line.id; let i = $index) {
                  <tr class="border-t border-gray-100">
                    <td class="p-2 text-gray-500">{{ i + 1 }}</td>
                    <td class="p-2">{{ line.description }}</td>
                    <td class="p-2">{{ line.uom }}</td>
                    <td class="p-2 text-right">{{ line.qty }}</td>
                    <td class="p-2 text-right font-semibold">{{ line.pendingQty }}</td>
                    <td class="p-2"><p-inputNumber [(ngModel)]="receiptLines[i].qtyReceived" [min]="0" [max]="line.pendingQty" styleClass="w-full" inputStyleClass="text-right text-sm p-1" /></td>
                    <td class="p-2"><p-inputNumber [(ngModel)]="receiptLines[i].qtyAccepted" [min]="0" [max]="receiptLines[i].qtyReceived" styleClass="w-full" inputStyleClass="text-right text-sm p-1" /></td>
                    <td class="p-2"><p-inputNumber [(ngModel)]="receiptLines[i].qtyRejected" [min]="0" [max]="receiptLines[i].qtyReceived" styleClass="w-full" inputStyleClass="text-right text-sm p-1" /></td>
                    <td class="p-2"><input pInputText [(ngModel)]="receiptLines[i].rejectionReason" class="w-full p-1 text-sm" /></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <p-button label="Submit GRN" icon="pi pi-check" (onClick)="submitGrn()" [loading]="saving()"
            [disabled]="!selectedPoId || !receivedDate" />
        }
      </div>
    } @else if (grn()) {
      <!-- VIEW MODE -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div><span class="text-xs text-gray-500 block">GRN No</span><span class="font-mono font-semibold">{{ grn()!.grnNo }}</span></div>
          <div><span class="text-xs text-gray-500 block">PO Number</span><span class="font-mono">{{ grn()!.poNumber }}</span></div>
          <div><span class="text-xs text-gray-500 block">Vendor</span><span>{{ grn()!.vendorName }}</span></div>
          <div><span class="text-xs text-gray-500 block">Received Date</span><span>{{ grn()!.receivedDate | date:'dd-MMM-yyyy' }}</span></div>
          <div><span class="text-xs text-gray-500 block">Quality Status</span><p-tag [value]="grn()!.qualityStatus" [severity]="qualitySeverity(grn()!.qualityStatus)" /></div>
          @if (grn()!.warehouseNote) {
            <div><span class="text-xs text-gray-500 block">Warehouse Note</span><span>{{ grn()!.warehouseNote }}</span></div>
          }
          @if (grn()!.notes) {
            <div class="md:col-span-2"><span class="text-xs text-gray-500 block">Notes</span><span>{{ grn()!.notes }}</span></div>
          }
        </div>

        <h3 class="text-lg font-semibold text-gray-700 mb-3">Received Lines</h3>
        <p-table [value]="grn()!.lines" styleClass="p-datatable-sm p-datatable-striped">
          <ng-template pTemplate="header">
            <tr>
              <th class="font-semibold">#</th>
              <th class="font-semibold">Description</th>
              <th class="font-semibold">UOM</th>
              <th class="font-semibold text-right">Received</th>
              <th class="font-semibold text-right">Accepted</th>
              <th class="font-semibold text-right">Rejected</th>
              <th class="font-semibold">Rejection Reason</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-l let-i="rowIndex">
            <tr>
              <td>{{ i + 1 }}</td>
              <td>{{ l.description }}</td>
              <td>{{ l.uom }}</td>
              <td class="text-right">{{ l.qtyReceived }}</td>
              <td class="text-right text-green-700 font-semibold">{{ l.qtyAccepted }}</td>
              <td class="text-right" [class.text-red-600]="l.qtyRejected > 0" [class.font-semibold]="l.qtyRejected > 0">{{ l.qtyRejected }}</td>
              <td>{{ l.rejectionReason || '—' }}</td>
            </tr>
          </ng-template>
        </p-table>
      </div>
    }
  `,
  styles: [`:host { display: block; padding: 1.5rem; }`],
})
export class GrnDetailComponent implements OnInit {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  router = inject(Router);
  private msg = inject(MessageService);
  private readonly cdr = inject(ChangeDetectorRef);

  grn = signal<Grn | null>(null);
  poOptions = signal<{ label: string; value: string }[]>([]);
  poLines = signal<PoLine[]>([]);
  loading = signal(false);
  saving = signal(false);
  isNew = signal(true);

  selectedPoId = '';
  receivedDate: Date = new Date();
  warehouseNote = '';
  notes = '';
  receiptLines: { poLineId: string; qtyReceived: number; qtyAccepted: number; qtyRejected: number; rejectionReason: string }[] = [];

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new') {
      this.isNew.set(false);
      this.loadGrn(id);
    } else {
      this.loadPoOptions();
    }
  }

  loadPoOptions() {
    this.http.get<{ data: PoOption[] }>(`${environment.apiBaseUrl}/purchase-orders?status=ISSUED,PARTIALLY_RECEIVED&limit=200`).subscribe({
      next: (r) => {
        this.poOptions.set(r.data.map(po => ({
          label: `${po.poNumber} — ${po.vendorName}`,
          value: po.id,
        })));
      },
    });
  }

  onPoSelected() {
    if (!this.selectedPoId) { this.poLines.set([]); return; }
    this.http.get<{ data: { lines: PoLine[] } }>(`${environment.apiBaseUrl}/purchase-orders/${this.selectedPoId}`).subscribe({
      next: (r) => {
        const lines = r.data.lines.filter(l => l.pendingQty > 0);
        this.poLines.set(lines);
        this.receiptLines = lines.map(l => ({
          poLineId: l.id,
          qtyReceived: l.pendingQty,
          qtyAccepted: l.pendingQty,
          qtyRejected: 0,
          rejectionReason: '',
        }));
        this.cdr.markForCheck();
      },
    });
  }

  loadGrn(id: string) {
    this.loading.set(true);
    this.http.get<{ data: Grn }>(`${environment.apiBaseUrl}/grns/${id}`).subscribe({
      next: (r) => { this.grn.set(r.data); this.loading.set(false); },
      error: () => { this.msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to load GRN' }); this.loading.set(false); },
    });
  }

  submitGrn() {
    if (!this.selectedPoId || !this.receivedDate) return;
    const lines = this.receiptLines
      .filter(l => l.qtyReceived > 0)
      .map(l => ({
        poLineId: l.poLineId,
        qtyReceived: l.qtyReceived,
        qtyAccepted: l.qtyAccepted,
        qtyRejected: l.qtyRejected,
        rejectionReason: l.rejectionReason || null,
      }));
    if (lines.length === 0) {
      this.msg.add({ severity: 'warn', summary: 'Validation', detail: 'Enter received quantities for at least one line' });
      return;
    }
    this.saving.set(true);
    this.http.post<{ data: Grn }>(`${environment.apiBaseUrl}/grns`, {
      poId: this.selectedPoId,
      receivedDate: this.receivedDate.toISOString().slice(0, 10),
      warehouseNote: this.warehouseNote || null,
      notes: this.notes || null,
      lines,
    }).subscribe({
      next: (r) => {
        this.msg.add({ severity: 'success', summary: 'Created', detail: `GRN ${r.data.grnNo} created` });
        this.saving.set(false);
        this.router.navigate(['/procurement/grns', r.data.id]);
      },
      error: () => { this.msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to create GRN' }); this.saving.set(false); },
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
