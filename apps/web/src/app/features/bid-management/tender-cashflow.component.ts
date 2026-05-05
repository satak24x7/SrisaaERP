import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { DatePickerModule } from 'primeng/datepicker';
import { TextareaModule } from 'primeng/textarea';
import { MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';

interface BoqItem {
  id: string;
  description: string;
  unit: string | null;
  quantity: number | null;
  unitRate: number | null;
  total: number | null;
  estimatedAmountText: string | null;
}

interface PaymentScheduleItem {
  id: string;
  milestone: string;
  percentageOfContract: number | null;
  conditions: string | null;
  estimatedMonth: number | null;
}

interface PaymentTerms {
  summary: string;
  advancePct: number | null;
  retentionPct: number | null;
  retentionRelease: string | null;
  defectLiabilityPeriodMonths: number | null;
  paymentCycleDays: number | null;
  schedule: PaymentScheduleItem[];
}

interface ProjectMilestone {
  id: string;
  name: string;
  durationText: string | null;
  deadlineText: string | null;
  paymentPct: number | null;
  deliverablesText: string | null;
}

interface CashFlowPlanData {
  boqItems: unknown[];
  paymentTerms: PaymentTerms | null;
  milestones: ProjectMilestone[];
  completionPeriodDays: number | null;
  estimatedValuePaise: number | null;
  aiAnalyzedAt: string | null;
  cashFlowPlan: {
    boqItems?: unknown[];
    paymentTerms?: PaymentTerms | null;
    milestones?: ProjectMilestone[];
    anticipatedStartDate?: string | null;
    notes?: string | null;
  } | null;
}

@Component({
  selector: 'app-tender-cashflow',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ButtonModule, InputTextModule, InputNumberModule,
    TagModule, ToastModule, TableModule, TooltipModule, DatePickerModule, TextareaModule],
  providers: [MessageService],
  template: `
    <p-toast />

    @if (loading()) {
      <div class="flex items-center gap-2 text-gray-500 py-12 justify-center"><i class="pi pi-spin pi-spinner text-2xl"></i> Loading...</div>
    } @else {
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-3">
          <p-button icon="pi pi-arrow-left" [text]="true" [rounded]="true" (onClick)="goBack()" pTooltip="Back to Tender" />
          <div>
            <h2 class="text-2xl font-semibold text-gray-800">Commercial Terms</h2>
            <p class="text-sm text-gray-500">{{ tenderNumber }} — extracted from RFP analysis</p>
          </div>
        </div>
        <div class="flex gap-2">
          @if (!data()?.aiAnalyzedAt) {
            <p-tag value="RFP Not Analyzed" severity="warn" />
          } @else {
            <p-tag value="AI Extracted" severity="success" icon="pi pi-sparkles" />
          }
          <p-button label="Save" icon="pi pi-save" (onClick)="savePlan()" [loading]="saving" [disabled]="!dirty" />
        </div>
      </div>

      @if (!data()?.aiAnalyzedAt) {
        <div class="bg-amber-50 border border-amber-200 rounded-lg p-8 text-center">
          <i class="pi pi-info-circle text-4xl text-amber-500 mb-3 block"></i>
          <p class="text-amber-800 font-medium mb-2">RFP not yet analyzed</p>
          <p class="text-sm text-amber-600 mb-4">Upload RFP documents and run AI analysis on the Tender detail page first. The analysis will extract BoQ items, payment terms, and milestones.</p>
          <p-button label="Go to Tender" icon="pi pi-arrow-right" (onClick)="goBack()" />
        </div>
      } @else {
        <!-- Summary Cards -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div class="bg-white rounded-lg shadow-sm border p-4">
            <div class="text-xs text-gray-500 uppercase font-semibold">Quoted Value</div>
            <div class="text-lg font-bold text-green-700 mt-1">₹{{ formatRupees(boqGrandTotal() * 100) }}</div>
            <div class="text-xs text-gray-400">Sum of BoQ</div>
          </div>
          <div class="bg-white rounded-lg shadow-sm border p-4">
            <div class="text-xs text-gray-500 uppercase font-semibold">Completion Period</div>
            <div class="text-lg font-bold text-blue-700 mt-1">{{ completionPeriod || '—' }}</div>
          </div>
          <div class="bg-white rounded-lg shadow-sm border p-4">
            <div class="text-xs text-gray-500 uppercase font-semibold">BoQ Items</div>
            <div class="text-lg font-bold text-purple-700 mt-1">{{ boqItems().length }}</div>
          </div>
          <div class="bg-white rounded-lg shadow-sm border p-4">
            <div class="text-xs text-gray-500 uppercase font-semibold">Milestones</div>
            <div class="text-lg font-bold text-indigo-700 mt-1">{{ milestones().length }}</div>
          </div>
        </div>

        <!-- BoQ Items -->
        <div class="bg-white rounded-lg shadow-sm border mb-6 overflow-hidden">
          <div class="flex items-center justify-between px-6 py-4 border-b bg-gray-50">
            <div class="flex items-center gap-2">
              <i class="pi pi-list text-green-600"></i>
              <h3 class="font-semibold text-gray-800">Bill of Quantities (Top-Level)</h3>
            </div>
            <p-button label="Add Item" icon="pi pi-plus" size="small" [outlined]="true" (onClick)="addBoqItem()" />
          </div>

          @if (boqItems().length === 0) {
            <div class="text-center text-gray-400 py-8">
              <i class="pi pi-table text-3xl mb-2 block"></i>
              <p class="text-sm">No BoQ items extracted from RFP. Add manually or re-analyze.</p>
            </div>
          } @else {
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead class="bg-gray-50 border-b">
                  <tr>
                    <th class="px-4 py-2 text-left font-medium text-gray-600 w-8">#</th>
                    <th class="px-4 py-2 text-left font-medium text-gray-600" style="width:50%">Description</th>
                    <th class="px-4 py-2 text-center font-medium text-gray-600 w-24">Unit</th>
                    <th class="px-4 py-2 text-center font-medium text-gray-600 w-24">Qty</th>
                    <th class="px-4 py-2 text-right font-medium text-gray-600 w-36">Unit Rate (₹)</th>
                    <th class="px-4 py-2 text-right font-medium text-gray-600 w-36">Total (₹)</th>
                    <th class="px-4 py-2 text-center font-medium text-gray-600 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  @for (item of boqItems(); track item.id; let i = $index) {
                    <tr class="border-b hover:bg-gray-50 align-top">
                      <td class="px-4 py-2 text-gray-400">{{ i + 1 }}</td>
                      <td class="px-4 py-2" style="width:50%">
                        <textarea pTextarea [(ngModel)]="item.description" [autoResize]="true" [rows]="2" class="w-full text-sm p-1" (blur)="markDirty()"></textarea>
                      </td>
                      <td class="px-4 py-2 text-center">
                        <input pInputText [(ngModel)]="item.unit" class="w-full text-sm p-1 text-center" (blur)="markDirty()" />
                      </td>
                      <td class="px-4 py-2 text-center">
                        <input type="number" pInputText [(ngModel)]="item.quantity" class="w-full text-sm p-1 text-center" (blur)="recalcBoqTotal(item)" />
                      </td>
                      <td class="px-4 py-2 text-right">
                        <p-inputNumber [(ngModel)]="item.unitRate" mode="currency" currency="INR" locale="en-IN" class="w-full" inputStyleClass="text-sm p-1 w-full text-right" (onBlur)="recalcBoqTotal(item)" />
                      </td>
                      <td class="px-4 py-2 text-right font-medium">
                        {{ item.total != null ? '₹' + formatRupees(item.total * 100) : '—' }}
                        @if (item.estimatedAmountText && !item.total) {
                          <div class="text-xs text-gray-400 mt-1">AI: {{ item.estimatedAmountText }}</div>
                        }
                      </td>
                      <td class="px-4 py-2 text-center">
                        <button class="text-red-400 hover:text-red-600 text-xs" (click)="removeBoqItem(i)" pTooltip="Remove"><i class="pi pi-trash"></i></button>
                      </td>
                    </tr>
                  }
                </tbody>
                <tfoot>
                  <tr class="bg-gray-100 font-medium border-t-2">
                    <td class="px-4 py-2"></td>
                    <td class="px-4 py-2" colspan="4" style="text-align:right">Grand Total</td>
                    <td class="px-4 py-2 text-right font-bold text-green-700">₹{{ formatRupees(boqGrandTotal() * 100) }}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          }
        </div>

        <!-- Payment Terms -->
        <div class="bg-white rounded-lg shadow-sm border mb-6 overflow-hidden">
          <div class="flex items-center justify-between px-6 py-4 border-b bg-gray-50">
            <div class="flex items-center gap-2">
              <i class="pi pi-indian-rupee text-blue-600"></i>
              <h3 class="font-semibold text-gray-800">Payment Terms</h3>
            </div>
          </div>

          @if (paymentTerms()) {
            <div class="p-6">
              <!-- Summary row -->
              <div class="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-4">
                <p class="text-sm text-blue-800">{{ paymentTerms()!.summary }}</p>
              </div>

              <!-- Key terms grid -->
              <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                <div class="bg-gray-50 rounded-lg p-3">
                  <div class="text-xs text-gray-500 uppercase">Advance</div>
                  <div class="text-lg font-bold mt-1">{{ paymentTerms()!.advancePct != null ? paymentTerms()!.advancePct + '%' : '—' }}</div>
                </div>
                <div class="bg-gray-50 rounded-lg p-3">
                  <div class="text-xs text-gray-500 uppercase">Retention</div>
                  <div class="text-lg font-bold mt-1">{{ paymentTerms()!.retentionPct != null ? paymentTerms()!.retentionPct + '%' : '—' }}</div>
                </div>
                <div class="bg-gray-50 rounded-lg p-3">
                  <div class="text-xs text-gray-500 uppercase">DLP</div>
                  <div class="text-lg font-bold mt-1">{{ paymentTerms()!.defectLiabilityPeriodMonths != null ? paymentTerms()!.defectLiabilityPeriodMonths + ' mo' : '—' }}</div>
                </div>
                <div class="bg-gray-50 rounded-lg p-3">
                  <div class="text-xs text-gray-500 uppercase">Payment Cycle</div>
                  <div class="text-lg font-bold mt-1">{{ paymentTerms()!.paymentCycleDays != null ? paymentTerms()!.paymentCycleDays + ' days' : '—' }}</div>
                </div>
                <div class="bg-gray-50 rounded-lg p-3">
                  <div class="text-xs text-gray-500 uppercase">Retention Release</div>
                  <div class="text-sm font-medium mt-1">{{ paymentTerms()!.retentionRelease ?? '—' }}</div>
                </div>
              </div>

              <!-- Payment Schedule Table -->
              <div class="flex items-center justify-between mb-2">
                <h4 class="text-sm font-semibold text-gray-700">Payment Schedule</h4>
                <p-button label="Add" icon="pi pi-plus" size="small" [text]="true" (onClick)="addPaymentScheduleItem()" />
              </div>
              @if (paymentTerms()!.schedule?.length) {
                <div class="overflow-x-auto">
                  <table class="w-full text-sm">
                    <thead class="bg-gray-50 border-b">
                      <tr>
                        <th class="px-4 py-2 text-left font-medium text-gray-600 w-8">#</th>
                        <th class="px-4 py-2 text-left font-medium text-gray-600">Milestone / Payment Trigger</th>
                        <th class="px-4 py-2 text-center font-medium text-gray-600 w-24">% of Contract</th>
                        <th class="px-4 py-2 text-left font-medium text-gray-600">Conditions</th>
                        <th class="px-4 py-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (item of paymentTerms()!.schedule; track item.id; let i = $index) {
                        <tr class="border-b hover:bg-gray-50">
                          <td class="px-4 py-2 text-gray-400">{{ i + 1 }}</td>
                          <td class="px-4 py-2">
                            <input pInputText [(ngModel)]="item.milestone" class="w-full text-sm p-1" (blur)="markDirty()" />
                          </td>
                          <td class="px-4 py-2 text-center">
                            <input type="number" pInputText [(ngModel)]="item.percentageOfContract" class="w-full text-sm p-1 text-center" min="0" max="100" (blur)="markDirty()" />
                          </td>
                          <td class="px-4 py-2">
                            <input pInputText [(ngModel)]="item.conditions" class="w-full text-sm p-1" (blur)="markDirty()" />
                          </td>
                          <td class="px-4 py-2 text-center">
                            <button class="text-red-400 hover:text-red-600 text-xs" (click)="removePaymentScheduleItem(i)" pTooltip="Remove"><i class="pi pi-trash"></i></button>
                          </td>
                        </tr>
                      }
                    </tbody>
                    <tfoot>
                      <tr class="bg-gray-100 font-medium border-t-2">
                        <td class="px-4 py-2"></td>
                        <td class="px-4 py-2 font-bold">Total</td>
                        <td class="px-4 py-2 text-center font-bold">{{ paymentScheduleTotalPct() }}%</td>
                        <td colspan="2"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              }
            </div>
          } @else {
            <div class="text-center text-gray-400 py-8">
              <i class="pi pi-indian-rupee text-3xl mb-2 block"></i>
              <p class="text-sm">No payment terms extracted from RFP.</p>
            </div>
          }
        </div>

        <!-- Milestones -->
        <div class="bg-white rounded-lg shadow-sm border mb-6 overflow-hidden">
          <div class="flex items-center justify-between px-6 py-4 border-b bg-gray-50">
            <div class="flex items-center gap-2">
              <i class="pi pi-flag text-indigo-600"></i>
              <h3 class="font-semibold text-gray-800">Project Milestones</h3>
            </div>
            <p-button label="Add Milestone" icon="pi pi-plus" size="small" [outlined]="true" (onClick)="addMilestone()" />
          </div>

          @if (milestones().length === 0) {
            <div class="text-center text-gray-400 py-8">
              <i class="pi pi-flag text-3xl mb-2 block"></i>
              <p class="text-sm">No milestones extracted from RFP. Add manually or re-analyze.</p>
            </div>
          } @else {
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead class="bg-gray-50 border-b">
                  <tr>
                    <th class="px-4 py-2 text-left font-medium text-gray-600 w-8">#</th>
                    <th class="px-4 py-2 text-left font-medium text-gray-600">Milestone</th>
                    <th class="px-4 py-2 text-center font-medium text-gray-600 w-28">Duration</th>
                    <th class="px-4 py-2 text-left font-medium text-gray-600 w-44">Deadline</th>
                    <th class="px-4 py-2 text-center font-medium text-gray-600 w-24">Payment %</th>
                    <th class="px-4 py-2 text-left font-medium text-gray-600">Deliverables</th>
                    <th class="px-4 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  @for (ms of milestones(); track ms.id; let i = $index) {
                    <tr class="border-b hover:bg-gray-50 align-top">
                      <td class="px-4 py-2 text-gray-400">{{ i + 1 }}</td>
                      <td class="px-4 py-2">
                        <input pInputText [(ngModel)]="ms.name" class="w-full text-sm p-1" (blur)="markDirty()" />
                      </td>
                      <td class="px-4 py-2 text-center">
                        <input pInputText [(ngModel)]="ms.durationText" class="w-full text-sm p-1 text-center" placeholder="e.g. 8 weeks" (blur)="markDirty()" />
                      </td>
                      <td class="px-4 py-2">
                        <input pInputText [(ngModel)]="ms.deadlineText" class="w-full text-sm p-1" placeholder="e.g. T+12 weeks" (blur)="markDirty()" />
                      </td>
                      <td class="px-4 py-2 text-center">
                        <input type="number" pInputText [(ngModel)]="ms.paymentPct" class="w-full text-sm p-1 text-center" min="0" max="100" (blur)="markDirty()" />
                      </td>
                      <td class="px-4 py-2">
                        <input pInputText [(ngModel)]="ms.deliverablesText" class="w-full text-sm p-1" placeholder="Key deliverables..." (blur)="markDirty()" />
                      </td>
                      <td class="px-4 py-2 text-center">
                        <button class="text-red-400 hover:text-red-600 text-xs" (click)="removeMilestone(i)" pTooltip="Remove"><i class="pi pi-trash"></i></button>
                      </td>
                    </tr>
                  }
                </tbody>
                <tfoot>
                  <tr class="bg-gray-100 font-medium border-t-2">
                    <td class="px-4 py-2"></td>
                    <td class="px-4 py-2 font-bold">Total</td>
                    <td class="px-4 py-2"></td>
                    <td class="px-4 py-2"></td>
                    <td class="px-4 py-2 text-center font-bold">{{ milestoneTotalPct() }}%</td>
                    <td colspan="2"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          }
        </div>

        <!-- Notes -->
        <div class="bg-white rounded-lg shadow-sm border p-6 mb-6">
          <label class="text-sm font-medium text-gray-700 block mb-2">Notes</label>
          <textarea pTextarea [(ngModel)]="notes" [autoResize]="true" [rows]="3" class="w-full" placeholder="Additional notes about the cash flow plan..." (blur)="markDirty()"></textarea>
        </div>
      }
    }
  `,
})
export class TenderCashflowComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly msg = inject(MessageService);

  loading = signal(true);
  data = signal<CashFlowPlanData | null>(null);
  boqItems = signal<BoqItem[]>([]);
  paymentTerms = signal<PaymentTerms | null>(null);
  milestones = signal<ProjectMilestone[]>([]);

  tenderNumber = '';
  tenderId = '';
  completionPeriod = '';
  notes = '';
  dirty = false;
  saving = false;

  boqGrandTotal = computed(() => {
    return this.boqItems().reduce((sum, item) => sum + (item.total ?? 0), 0);
  });

  milestoneTotalPct = computed(() => {
    return this.milestones().reduce((sum, ms) => sum + (ms.paymentPct ?? 0), 0);
  });

  paymentScheduleTotalPct = computed(() => {
    const pt = this.paymentTerms();
    if (!pt?.schedule) return 0;
    return pt.schedule.reduce((sum, item) => sum + (item.percentageOfContract ?? 0), 0);
  });

  ngOnInit(): void {
    this.tenderId = this.route.snapshot.paramMap.get('id')!;
    this.loadData();
  }

  private loadData(): void {
    this.loading.set(true);

    // Load tender info for header
    this.http.get<{ data: { tenderNumber: string } }>(`${environment.apiBaseUrl}/tenders/${this.tenderId}`).subscribe({
      next: (r) => { this.tenderNumber = r.data.tenderNumber; },
    });

    // Load cash flow plan data
    this.http.get<{ data: CashFlowPlanData }>(`${environment.apiBaseUrl}/tenders/${this.tenderId}/cash-flow-plan`).subscribe({
      next: (r) => {
        this.data.set(r.data);

        // Set completion period
        if (r.data.completionPeriodDays) {
          this.completionPeriod = r.data.completionPeriodDays + ' days';
        }

        // Use saved plan if exists, otherwise use AI-extracted data
        const saved = r.data.cashFlowPlan;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const normalizeBoq = (items: any[]): BoqItem[] => items.map(i => ({
          id: i.id,
          description: i.description ?? '',
          unit: i.unit ?? null,
          quantity: i.quantity ?? null,
          unitRate: i.unitRate ?? null,
          total: i.total ?? (i.quantity && i.unitRate ? i.quantity * i.unitRate : null),
          estimatedAmountText: i.estimatedAmountText ?? null,
        }));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const normalizeMilestones = (items: any[]): ProjectMilestone[] => items.map(i => ({
          id: i.id,
          name: i.name ?? '',
          durationText: i.durationText ?? (i.durationMonths != null ? i.durationMonths + ' months' : null),
          deadlineText: i.deadlineText ?? null,
          paymentPct: i.paymentPct ?? null,
          deliverablesText: i.deliverablesText ?? (i.deliverables?.length ? i.deliverables.join(', ') : null),
        }));

        if (saved) {
          this.boqItems.set(normalizeBoq(saved.boqItems ?? r.data.boqItems ?? []));
          this.paymentTerms.set(saved.paymentTerms !== undefined ? saved.paymentTerms : r.data.paymentTerms);
          this.milestones.set(normalizeMilestones(saved.milestones ?? r.data.milestones ?? []));
          this.notes = saved.notes ?? '';
        } else {
          this.boqItems.set(normalizeBoq(r.data.boqItems ?? []));
          this.paymentTerms.set(r.data.paymentTerms);
          this.milestones.set(normalizeMilestones(r.data.milestones ?? []));
        }

        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  markDirty(): void { this.dirty = true; }

  addBoqItem(): void {
    const items = this.boqItems();
    const nextId = `boq_manual_${items.length + 1}_${Date.now()}`;
    this.boqItems.set([...items, {
      id: nextId, description: '', unit: null, quantity: null,
      unitRate: null, total: null, estimatedAmountText: null,
    }]);
    this.markDirty();
  }

  recalcBoqTotal(item: BoqItem): void {
    if (item.quantity != null && item.unitRate != null) {
      item.total = item.quantity * item.unitRate;
    } else {
      item.total = null;
    }
    this.boqItems.set([...this.boqItems()]);
    this.markDirty();
  }

  removeBoqItem(index: number): void {
    const items = [...this.boqItems()];
    items.splice(index, 1);
    this.boqItems.set(items);
    this.markDirty();
  }

  addMilestone(): void {
    const items = this.milestones();
    const nextId = `ms_manual_${items.length + 1}_${Date.now()}`;
    this.milestones.set([...items, {
      id: nextId, name: '', durationText: null, deadlineText: null,
      paymentPct: null, deliverablesText: null,
    }]);
    this.markDirty();
  }

  removeMilestone(index: number): void {
    const items = [...this.milestones()];
    items.splice(index, 1);
    this.milestones.set(items);
    this.markDirty();
  }

  addPaymentScheduleItem(): void {
    const pt = this.paymentTerms();
    if (!pt) return;
    const nextId = `pt_manual_${pt.schedule.length + 1}_${Date.now()}`;
    pt.schedule.push({ id: nextId, milestone: '', percentageOfContract: null, conditions: null, estimatedMonth: null });
    this.paymentTerms.set({ ...pt });
    this.markDirty();
  }

  removePaymentScheduleItem(index: number): void {
    const pt = this.paymentTerms();
    if (!pt) return;
    pt.schedule.splice(index, 1);
    this.paymentTerms.set({ ...pt });
    this.markDirty();
  }

  savePlan(): void {
    this.saving = true;
    const body = {
      boqItems: this.boqItems(),
      paymentTerms: this.paymentTerms(),
      milestones: this.milestones(),
      notes: this.notes || null,
    };

    this.http.put(`${environment.apiBaseUrl}/tenders/${this.tenderId}/cash-flow-plan`, body).subscribe({
      next: () => {
        this.saving = false;
        this.dirty = false;
        this.msg.add({ severity: 'success', summary: 'Saved', detail: 'Commercial terms saved' });
      },
      error: (err: HttpErrorResponse) => {
        this.saving = false;
        this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed to save' });
      },
    });
  }

  goBack(): void {
    this.router.navigate(['/bid-management/tenders', this.tenderId]);
  }

  formatRupees(paise: number): string {
    const r = paise / 100;
    if (r >= 10000000) return (r / 10000000).toFixed(2) + ' Cr';
    if (r >= 100000) return (r / 100000).toFixed(2) + ' L';
    return r.toLocaleString('en-IN');
  }
}
