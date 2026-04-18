import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { SelectModule } from 'primeng/select';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { DatePickerModule } from 'primeng/datepicker';
import { TextareaModule } from 'primeng/textarea';
import { ConfirmationService, MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';

interface ProjectOption {
  id: string;
  name: string;
  projectCode: string | null;
  status: string;
  businessUnitName: string | null;
}

interface MilestoneRef {
  id: string;
  name: string;
}

interface InflowItem {
  id: string;
  description: string;
  milestoneId: string | null;
  invoiceDate: string;
  amountPaise: number;
  gstPct: number;
  retentionPct: number;
  status: string;
}

interface CashFlowRow {
  id: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  openingBalancePaise: number;
  billedPaise: number;
  receivedPaise: number;
  outflowPaise: number;
  closingBalancePaise: number;
}

const INFLOW_STATUSES = [
  { label: 'Planned', value: 'PLANNED' },
  { label: 'Invoiced', value: 'INVOICED' },
  { label: 'Received', value: 'RECEIVED' },
];

function toLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDate(str: string): Date {
  return new Date(str + 'T00:00:00');
}

@Component({
  selector: 'app-project-cashflow',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, FormsModule,
    SelectModule, ButtonModule, TableModule, TagModule,
    DialogModule, ToastModule, ConfirmDialogModule,
    InputTextModule, InputNumberModule, DatePickerModule, TextareaModule,
  ],
  providers: [MessageService, ConfirmationService],
  template: `
    <p-toast /><p-confirmDialog />

    <div class="flex items-center justify-between mb-6">
      <h2 class="text-2xl font-semibold text-gray-800">Cash Flow</h2>
    </div>

    <!-- Project Selector -->
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
      <div class="flex items-center gap-4">
        <label class="text-sm font-medium text-gray-700 whitespace-nowrap">Select Project</label>
        <p-select
          appendTo="body"
          [(ngModel)]="selectedProjectId"
          [options]="projects()"
          optionLabel="name"
          optionValue="id"
          [filter]="true"
          filterBy="name,projectCode"
          placeholder="Choose a project..."
          class="flex-1 max-w-xl"
          (onChange)="onProjectChange()"
        >
          <ng-template let-item pTemplate="item">
            <div class="flex items-center gap-2">
              <span class="font-medium">{{ item.name }}</span>
              @if (item.projectCode) {
                <span class="text-xs text-gray-500">({{ item.projectCode }})</span>
              }
              @if (item.businessUnitName) {
                <span class="text-xs text-gray-400">— {{ item.businessUnitName }}</span>
              }
            </div>
          </ng-template>
          <ng-template let-item pTemplate="selectedItem">
            <div class="flex items-center gap-2">
              <span>{{ item.name }}</span>
              @if (item.projectCode) {
                <span class="text-xs text-gray-500">({{ item.projectCode }})</span>
              }
            </div>
          </ng-template>
        </p-select>
        @if (selectedProjectId) {
          <p-button
            label="View Project"
            icon="pi pi-external-link"
            severity="secondary"
            [outlined]="true"
            size="small"
            (onClick)="router.navigate(['/projects', selectedProjectId])"
          />
        }
      </div>
    </div>

    @if (selectedProjectId) {
      <!-- Inflow Plan -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-gray-700">Inflow Plan</h3>
          <p-button label="Add Inflow" icon="pi pi-plus" size="small" (onClick)="openInflowDialog()" />
        </div>
        <p-table [value]="inflowItems()" styleClass="p-datatable-sm" [rows]="20">
          <ng-template pTemplate="header">
            <tr>
              <th>Description</th><th>Invoice Date</th><th class="text-right">Amount</th><th>GST %</th><th>Retention %</th><th>Status</th><th style="width:100px">Actions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-item>
            <tr>
              <td>{{ item.description }}</td>
              <td>{{ item.invoiceDate | date:'mediumDate' }}</td>
              <td class="text-right">{{ formatRupees(item.amountPaise) }}</td>
              <td>{{ item.gstPct }}%</td>
              <td>{{ item.retentionPct }}%</td>
              <td><p-tag [value]="item.status" [severity]="inflowStatusSeverity(item.status)" /></td>
              <td>
                <div class="flex gap-1">
                  <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small" (onClick)="openInflowDialog(item)" />
                  <p-button icon="pi pi-trash" [text]="true" [rounded]="true" size="small" severity="danger" (onClick)="deleteInflow(item.id)" />
                </div>
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td colspan="7" class="text-center text-gray-400 py-4">No inflow items yet</td></tr>
          </ng-template>
        </p-table>
      </div>

      <!-- Cash Flow Periods -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-gray-700">Cash Flow Periods</h3>
          <p-button label="Add Period" icon="pi pi-plus" size="small" (onClick)="openCashFlowDialog()" />
        </div>
        <p-table [value]="cashFlowRows()" styleClass="p-datatable-sm" [rows]="20">
          <ng-template pTemplate="header">
            <tr>
              <th>Period</th><th class="text-right">Opening</th><th class="text-right">Billed</th><th class="text-right">Received</th><th class="text-right">Outflow</th><th class="text-right">Closing</th><th style="width:80px">Actions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-cf>
            <tr>
              <td>{{ cf.periodLabel }}</td>
              <td class="text-right">{{ formatRupees(cf.openingBalancePaise) }}</td>
              <td class="text-right">{{ formatRupees(cf.billedPaise) }}</td>
              <td class="text-right">{{ formatRupees(cf.receivedPaise) }}</td>
              <td class="text-right">{{ formatRupees(cf.outflowPaise) }}</td>
              <td class="text-right font-medium">{{ formatRupees(cf.closingBalancePaise) }}</td>
              <td>
                <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small" (onClick)="openCashFlowDialog(cf)" />
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td colspan="7" class="text-center text-gray-400 py-4">No cash flow periods yet</td></tr>
          </ng-template>
        </p-table>
      </div>
    } @else {
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-16 text-center">
        <i class="pi pi-chart-line text-5xl text-gray-300 mb-4"></i>
        <p class="text-gray-500 text-lg">Select a project above to view its cash flow</p>
      </div>
    }

    <!-- Inflow Dialog -->
    <p-dialog [header]="inflowEditId ? 'Edit Inflow' : 'Add Inflow'" [(visible)]="inflowDialogVisible" [modal]="true" [style]="{width:'500px'}">
      <form [formGroup]="inflowForm" class="flex flex-col gap-4 pt-2">
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Description *</label>
          <input pInputText formControlName="description" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Milestone</label>
          <p-select appendTo="body" formControlName="milestoneId" [options]="milestoneOptions()" optionLabel="name" optionValue="id" [showClear]="true" placeholder="Select milestone" class="w-full" />
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Invoice Date *</label>
            <p-datepicker appendTo="body" formControlName="invoiceDate" dateFormat="yy-mm-dd" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Amount (₹) *</label>
            <p-inputNumber formControlName="amountRupees" mode="currency" currency="INR" locale="en-IN" class="w-full" />
          </div>
        </div>
        <div class="grid grid-cols-3 gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">GST %</label>
            <p-inputNumber formControlName="gstPct" [min]="0" [max]="100" suffix="%" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Retention %</label>
            <p-inputNumber formControlName="retentionPct" [min]="0" [max]="100" suffix="%" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Status</label>
            <p-select appendTo="body" formControlName="status" [options]="inflowStatuses" optionLabel="label" optionValue="value" class="w-full" />
          </div>
        </div>
      </form>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="inflowDialogVisible=false" />
        <p-button [label]="inflowEditId ? 'Update' : 'Add'" icon="pi pi-check" [disabled]="inflowForm.invalid" (onClick)="saveInflow()" />
      </ng-template>
    </p-dialog>

    <!-- Cash Flow Period Dialog -->
    <p-dialog [header]="cashFlowEditId ? 'Edit Period' : 'Add Period'" [(visible)]="cashFlowDialogVisible" [modal]="true" [style]="{width:'600px'}">
      <form [formGroup]="cashFlowForm" class="flex flex-col gap-4 pt-2">
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Period Label *</label>
          <input pInputText formControlName="periodLabel" class="w-full" />
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Period Start *</label>
            <p-datepicker appendTo="body" formControlName="periodStart" dateFormat="yy-mm-dd" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Period End *</label>
            <p-datepicker appendTo="body" formControlName="periodEnd" dateFormat="yy-mm-dd" class="w-full" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Opening Balance (₹)</label>
            <p-inputNumber formControlName="openingBalanceRupees" mode="currency" currency="INR" locale="en-IN" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Billed (₹)</label>
            <p-inputNumber formControlName="billedRupees" mode="currency" currency="INR" locale="en-IN" class="w-full" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Received (₹)</label>
            <p-inputNumber formControlName="receivedRupees" mode="currency" currency="INR" locale="en-IN" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Outflow (₹)</label>
            <p-inputNumber formControlName="outflowRupees" mode="currency" currency="INR" locale="en-IN" class="w-full" />
          </div>
        </div>
      </form>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="cashFlowDialogVisible=false" />
        <p-button [label]="cashFlowEditId ? 'Update' : 'Add'" icon="pi pi-check" [disabled]="cashFlowForm.invalid" (onClick)="saveCashFlow()" />
      </ng-template>
    </p-dialog>
  `,
})
export class ProjectCashflowComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly msg = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  readonly router = inject(Router);

  // Data signals
  projects = signal<ProjectOption[]>([]);
  milestoneOptions = signal<MilestoneRef[]>([]);
  inflowItems = signal<InflowItem[]>([]);
  cashFlowRows = signal<CashFlowRow[]>([]);

  selectedProjectId = '';

  // Dropdown constants
  inflowStatuses = INFLOW_STATUSES;

  // Dialog state
  inflowDialogVisible = false;
  inflowEditId: string | null = null;
  cashFlowDialogVisible = false;
  cashFlowEditId: string | null = null;

  // Forms
  inflowForm = this.fb.group({
    description: ['', [Validators.required, Validators.maxLength(255)]],
    milestoneId: [''],
    invoiceDate: [null as Date | null, Validators.required],
    amountRupees: [null as number | null, [Validators.required, Validators.min(0)]],
    gstPct: [18 as number],
    retentionPct: [0 as number],
    status: ['PLANNED', Validators.required],
  });

  cashFlowForm = this.fb.group({
    periodLabel: ['', [Validators.required, Validators.maxLength(100)]],
    periodStart: [null as Date | null, Validators.required],
    periodEnd: [null as Date | null, Validators.required],
    openingBalanceRupees: [0 as number],
    billedRupees: [0 as number],
    receivedRupees: [0 as number],
    outflowRupees: [0 as number],
  });

  ngOnInit(): void {
    this.loadProjects();

    const qp = this.route.snapshot.queryParamMap.get('projectId');
    if (qp) {
      this.selectedProjectId = qp;
      this.loadProjectData(qp);
    }
  }

  private loadProjects(): void {
    this.http
      .get<{ data: ProjectOption[]; meta: unknown }>(
        `${environment.apiBaseUrl}/projects?limit=200`,
      )
      .subscribe({
        next: (r) => this.projects.set(r.data),
        error: () => {},
      });
  }

  onProjectChange(): void {
    // Update URL query param without navigation
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: this.selectedProjectId ? { projectId: this.selectedProjectId } : {},
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });

    if (this.selectedProjectId) {
      this.loadProjectData(this.selectedProjectId);
    } else {
      this.milestoneOptions.set([]);
      this.inflowItems.set([]);
      this.cashFlowRows.set([]);
    }
  }

  private loadProjectData(projectId: string): void {
    this.loadMilestones(projectId);
    this.loadInflows(projectId);
    this.loadCashFlows(projectId);
  }

  private loadMilestones(id: string): void {
    this.http
      .get<{ data: { id: string; name: string }[] }>(
        `${environment.apiBaseUrl}/projects/${id}/milestones?limit=200`,
      )
      .subscribe({
        next: (r) => this.milestoneOptions.set(r.data.map((m) => ({ id: m.id, name: m.name }))),
        error: () => {},
      });
  }

  private loadInflows(id: string): void {
    this.http
      .get<{ data: InflowItem[] }>(
        `${environment.apiBaseUrl}/projects/${id}/inflows?limit=200`,
      )
      .subscribe({
        next: (r) => this.inflowItems.set(r.data),
        error: () => {},
      });
  }

  private loadCashFlows(id: string): void {
    this.http
      .get<{ data: CashFlowRow[] }>(
        `${environment.apiBaseUrl}/projects/${id}/cash-flows?limit=200`,
      )
      .subscribe({
        next: (r) => this.cashFlowRows.set(r.data),
        error: () => {},
      });
  }

  // ===== Inflow Plan =====

  openInflowDialog(item?: InflowItem): void {
    if (item) {
      this.inflowEditId = item.id;
      this.inflowForm.patchValue({
        description: item.description,
        milestoneId: item.milestoneId ?? '',
        invoiceDate: parseDate(item.invoiceDate),
        amountRupees: item.amountPaise / 100,
        gstPct: item.gstPct,
        retentionPct: item.retentionPct,
        status: item.status,
      });
    } else {
      this.inflowEditId = null;
      this.inflowForm.reset({ gstPct: 18, retentionPct: 0, status: 'PLANNED' });
    }
    this.inflowDialogVisible = true;
  }

  saveInflow(): void {
    if (this.inflowForm.invalid || !this.selectedProjectId) return;
    const v = this.inflowForm.value;
    const body: Record<string, unknown> = {
      description: v.description,
      milestoneId: v.milestoneId || null,
      invoiceDate: v.invoiceDate instanceof Date ? toLocalDate(v.invoiceDate) : v.invoiceDate,
      amountPaise: v.amountRupees != null ? Math.round(v.amountRupees * 100) : 0,
      gstPct: v.gstPct ?? 0,
      retentionPct: v.retentionPct ?? 0,
      status: v.status,
    };
    const pid = this.selectedProjectId;
    const req$ = this.inflowEditId
      ? this.http.patch(`${environment.apiBaseUrl}/projects/${pid}/inflows/${this.inflowEditId}`, body)
      : this.http.post(`${environment.apiBaseUrl}/projects/${pid}/inflows`, body);

    req$.subscribe({
      next: () => {
        this.inflowDialogVisible = false;
        this.loadInflows(pid);
        this.msg.add({ severity: 'success', summary: 'Saved', detail: `Inflow ${this.inflowEditId ? 'updated' : 'added'}` });
      },
      error: (err: HttpErrorResponse) => this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed' }),
    });
  }

  deleteInflow(iid: string): void {
    this.confirm.confirm({
      message: 'Delete this inflow item?',
      accept: () => {
        this.http.delete(`${environment.apiBaseUrl}/projects/${this.selectedProjectId}/inflows/${iid}`).subscribe({
          next: () => {
            this.loadInflows(this.selectedProjectId);
            this.msg.add({ severity: 'success', summary: 'Deleted' });
          },
          error: (err: HttpErrorResponse) => this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed' }),
        });
      },
    });
  }

  // ===== Cash Flow Periods =====

  openCashFlowDialog(cf?: CashFlowRow): void {
    if (cf) {
      this.cashFlowEditId = cf.id;
      this.cashFlowForm.patchValue({
        periodLabel: cf.periodLabel,
        periodStart: parseDate(cf.periodStart),
        periodEnd: parseDate(cf.periodEnd),
        openingBalanceRupees: cf.openingBalancePaise / 100,
        billedRupees: cf.billedPaise / 100,
        receivedRupees: cf.receivedPaise / 100,
        outflowRupees: cf.outflowPaise / 100,
      });
    } else {
      this.cashFlowEditId = null;
      this.cashFlowForm.reset({ openingBalanceRupees: 0, billedRupees: 0, receivedRupees: 0, outflowRupees: 0 });
    }
    this.cashFlowDialogVisible = true;
  }

  saveCashFlow(): void {
    if (this.cashFlowForm.invalid || !this.selectedProjectId) return;
    const v = this.cashFlowForm.value;
    const body: Record<string, unknown> = {
      periodLabel: v.periodLabel,
      periodStart: v.periodStart instanceof Date ? toLocalDate(v.periodStart) : v.periodStart,
      periodEnd: v.periodEnd instanceof Date ? toLocalDate(v.periodEnd) : v.periodEnd,
      openingBalancePaise: v.openingBalanceRupees != null ? Math.round(v.openingBalanceRupees * 100) : 0,
      billedPaise: v.billedRupees != null ? Math.round(v.billedRupees * 100) : 0,
      receivedPaise: v.receivedRupees != null ? Math.round(v.receivedRupees * 100) : 0,
      outflowPaise: v.outflowRupees != null ? Math.round(v.outflowRupees * 100) : 0,
    };
    const pid = this.selectedProjectId;
    const req$ = this.cashFlowEditId
      ? this.http.patch(`${environment.apiBaseUrl}/projects/${pid}/cash-flows/${this.cashFlowEditId}`, body)
      : this.http.post(`${environment.apiBaseUrl}/projects/${pid}/cash-flows`, body);

    req$.subscribe({
      next: () => {
        this.cashFlowDialogVisible = false;
        this.loadCashFlows(pid);
        this.msg.add({ severity: 'success', summary: 'Saved', detail: `Cash flow period ${this.cashFlowEditId ? 'updated' : 'added'}` });
      },
      error: (err: HttpErrorResponse) => this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed' }),
    });
  }

  // ===== Helpers =====

  formatRupees(paise: number): string {
    return '\u20B9' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  inflowStatusSeverity(s: string): 'secondary' | 'info' | 'success' {
    switch (s) {
      case 'PLANNED': return 'secondary';
      case 'INVOICED': return 'info';
      case 'RECEIVED': return 'success';
      default: return 'secondary';
    }
  }
}
