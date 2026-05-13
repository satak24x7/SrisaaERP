import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { TableModule } from 'primeng/table';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';

interface QuotationSummary {
  id: string; quotationNo: string; vendorId: string; vendorName: string;
  grandTotalPaise: number; deliveryDays: number | null; paymentTermsDays: number | null;
  isL1: boolean;
  lines: { description: string; uom: string; qty: number; ratePaise: number; totalPaise: number }[];
}

interface RateComparison {
  id: string; comparisonNo: string; title: string; status: string;
  selectedVendorId: string | null; selectionReason: string | null;
  quotations: QuotationSummary[];
  createdAt: string;
}

@Component({
  selector: 'app-rate-comparison-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, TagModule, ButtonModule, SelectModule, TextareaModule, TableModule, ToastModule, ConfirmDialogModule],
  providers: [MessageService, ConfirmationService],
  template: `
    <p-toast /><p-confirmDialog />
    <div class="flex items-center gap-3 mb-6">
      <p-button icon="pi pi-arrow-left" [rounded]="true" [text]="true" (onClick)="router.navigate(['/procurement/rate-comparisons'])" />
      <div>
        <h2 class="text-2xl font-semibold text-gray-800">{{ comparison()?.title || 'Rate Comparison' }}</h2>
        <p class="text-sm text-gray-500 mt-1">
          {{ comparison()?.comparisonNo }} &middot;
          <span [class]="comparison()?.status === 'FINALIZED' ? 'text-green-600 font-semibold' : ''">{{ comparison()?.status }}</span>
        </p>
      </div>
    </div>

    @if (loading()) {
      <div class="flex items-center gap-2 text-gray-500 py-12 justify-center"><i class="pi pi-spin pi-spinner text-2xl"></i> Loading...</div>
    } @else if (comparison()) {
      <!-- Quotation Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        @for (q of comparison()!.quotations; track q.id) {
          <div class="bg-white rounded-lg shadow-sm border-2 p-5 relative"
            [class.border-green-500]="q.isL1" [class.border-gray-200]="!q.isL1">
            @if (q.isL1) {
              <span class="absolute -top-3 right-3 bg-green-500 text-white text-xs font-bold px-2 py-0.5 rounded">L1</span>
            }
            <h4 class="text-lg font-semibold text-gray-800 mb-1">{{ q.vendorName }}</h4>
            <p class="text-xs text-gray-500 mb-3">{{ q.quotationNo }}</p>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between"><span class="text-gray-500">Grand Total</span><span class="font-mono font-bold text-lg">{{ formatRupees(q.grandTotalPaise) }}</span></div>
              <div class="flex justify-between"><span class="text-gray-500">Delivery</span><span>{{ q.deliveryDays ? q.deliveryDays + ' days' : '—' }}</span></div>
              <div class="flex justify-between"><span class="text-gray-500">Payment Terms</span><span>{{ q.paymentTermsDays ? q.paymentTermsDays + ' days' : '—' }}</span></div>
              <div class="flex justify-between"><span class="text-gray-500">Lines</span><span>{{ q.lines.length }}</span></div>
            </div>
          </div>
        }
      </div>

      <!-- Line-by-line comparison -->
      @if (allLineDescriptions().length > 0) {
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 mb-8">
          <h3 class="text-lg font-semibold text-gray-700 p-4 border-b">Line-by-Line Comparison</h3>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-gray-50">
                <tr>
                  <th class="p-3 text-left font-semibold">Item</th>
                  @for (q of comparison()!.quotations; track q.id) {
                    <th class="p-3 text-right font-semibold">
                      {{ q.vendorName }}
                      @if (q.isL1) { <span class="ml-1 text-green-600">(L1)</span> }
                    </th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (desc of allLineDescriptions(); track desc) {
                  <tr class="border-t border-gray-100">
                    <td class="p-3">{{ desc }}</td>
                    @for (q of comparison()!.quotations; track q.id) {
                      @let matchLine = findLine(q, desc);
                      <td class="p-3 text-right font-mono">
                        @if (matchLine) {
                          {{ formatRupees(matchLine.totalPaise) }}
                          <span class="text-xs text-gray-400 block">{{ matchLine.qty }} x {{ formatRupees(matchLine.ratePaise) }}</span>
                        } @else {
                          <span class="text-gray-300">—</span>
                        }
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

      <!-- Selection -->
      @if (comparison()!.status !== 'FINALIZED') {
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 class="text-lg font-semibold text-gray-700 mb-4">Vendor Selection</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Select Vendor *</label>
              <p-select [options]="vendorOptions()" [(ngModel)]="selectedVendorId" optionLabel="label" optionValue="value"
                placeholder="Choose vendor" styleClass="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Selection Reason</label>
              <textarea pTextarea [(ngModel)]="selectionReason" rows="3" class="w-full"></textarea>
            </div>
          </div>
          <p-button label="Finalize Comparison" icon="pi pi-check-circle" severity="success"
            (onClick)="finalize()" [loading]="saving()" [disabled]="!selectedVendorId" />
        </div>
      } @else {
        <div class="bg-green-50 rounded-lg border border-green-200 p-6">
          <h3 class="text-lg font-semibold text-green-800 mb-2">Finalized</h3>
          <p class="text-sm text-green-700">
            <strong>Selected Vendor:</strong> {{ getSelectedVendorName() }}<br/>
            @if (comparison()!.selectionReason) {
              <strong>Reason:</strong> {{ comparison()!.selectionReason }}
            }
          </p>
        </div>
      }
    }
  `,
  styles: [`:host { display: block; padding: 1.5rem; }`],
})
export class RateComparisonDetailComponent implements OnInit {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  router = inject(Router);
  private msg = inject(MessageService);
  private confirm = inject(ConfirmationService);
  private readonly cdr = inject(ChangeDetectorRef);

  comparison = signal<RateComparison | null>(null);
  loading = signal(false);
  saving = signal(false);
  selectedVendorId = '';
  selectionReason = '';

  vendorOptions = computed(() => {
    const c = this.comparison();
    if (!c) return [];
    return c.quotations.map(q => ({ label: q.vendorName + (q.isL1 ? ' (L1)' : ''), value: q.vendorId }));
  });

  allLineDescriptions = computed(() => {
    const c = this.comparison();
    if (!c) return [];
    const set = new Set<string>();
    for (const q of c.quotations) for (const l of q.lines) set.add(l.description);
    return Array.from(set);
  });

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.load(id);
  }

  load(id: string) {
    this.loading.set(true);
    this.http.get<{ data: RateComparison }>(`${environment.apiBaseUrl}/rate-comparisons/${id}`).subscribe({
      next: (r) => {
        this.comparison.set(r.data);
        if (r.data.selectedVendorId) this.selectedVendorId = r.data.selectedVendorId;
        if (r.data.selectionReason) this.selectionReason = r.data.selectionReason;
        this.loading.set(false);
        this.cdr.markForCheck();
      },
      error: () => { this.msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to load comparison' }); this.loading.set(false); this.cdr.markForCheck(); },
    });
  }

  findLine(q: QuotationSummary, desc: string) {
    return q.lines.find(l => l.description === desc) || null;
  }

  getSelectedVendorName(): string {
    const c = this.comparison();
    if (!c || !c.selectedVendorId) return '—';
    const q = c.quotations.find(x => x.vendorId === c.selectedVendorId);
    return q?.vendorName || '—';
  }

  finalize() {
    if (!this.selectedVendorId) return;
    this.confirm.confirm({
      message: 'Finalize this rate comparison? This cannot be undone.',
      header: 'Confirm Finalization',
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.saving.set(true);
        const c = this.comparison()!;
        this.http.patch<{ data: RateComparison }>(`${environment.apiBaseUrl}/rate-comparisons/${c.id}`, {
          status: 'FINALIZED',
          selectedVendorId: this.selectedVendorId,
          selectionReason: this.selectionReason || null,
        }).subscribe({
          next: (r) => {
            this.comparison.set(r.data);
            this.msg.add({ severity: 'success', summary: 'Finalized', detail: 'Rate comparison finalized' });
            this.saving.set(false);
          },
          error: () => { this.msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to finalize' }); this.saving.set(false); },
        });
      },
    });
  }

  formatRupees(paise: number) { return '\u20B9' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 }); }
}
