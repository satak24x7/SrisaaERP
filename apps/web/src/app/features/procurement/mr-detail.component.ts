import { Component, ChangeDetectionStrategy, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { TextareaModule } from 'primeng/textarea';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';

interface MrLine {
  id: string; itemId: string | null; description: string; uom: string;
  qtyRequested: number; qtyApproved: number | null; qtyFulfilled: number;
  estimatedRatePaise: number | null; remarks: string | null; sortOrder: number;
  item?: { id: string; sku: string; name: string; uom: string; category: string | null } | null;
}

interface MrDetail {
  id: string; mrNo: string; title: string; status: string; priority: string;
  requiredBy: string; justification: string | null; source: string | null;
  businessUnitId: string; projectId: string | null;
  businessUnit: { id: string; name: string } | null;
  project: { id: string; name: string; code: string } | null;
  lines: MrLine[];
  approvalStatus: { requestId: string; status: string; currentStepOrder: number } | null;
}

@Component({
  selector: 'app-mr-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, ButtonModule, TableModule, TagModule,
    SelectModule, InputTextModule, InputNumberModule, TextareaModule, DatePickerModule,
    DialogModule, ToastModule, ConfirmDialogModule],
  providers: [MessageService, ConfirmationService],
  template: `
    <p-toast /><p-confirmDialog />
    <div class="p-6 max-w-6xl">
      <!-- Header -->
      <div class="flex items-center gap-3 mb-6">
        <p-button icon="pi pi-arrow-left" [text]="true" (onClick)="router.navigate(['/procurement/material-requests'])" />
        <h2 class="text-2xl font-bold text-gray-800">
          {{ isNew() ? 'New Material Request' : mr()?.mrNo }}
        </h2>
        @if (mr()?.status) {
          <p-tag [value]="mr()!.status" [severity]="statusSeverity(mr()!.status)" />
        }
        @if (mr()?.priority && mr()!.priority !== 'NORMAL') {
          <p-tag [value]="mr()!.priority" [severity]="prioritySeverity(mr()!.priority)" />
        }
        <div class="flex-1"></div>
        <!-- Action Buttons -->
        @if (isDraft()) {
          <p-button label="Save" icon="pi pi-save" (onClick)="save()" [loading]="saving()" />
          <p-button label="Submit" icon="pi pi-send" severity="info" (onClick)="submit()" [disabled]="lines().length === 0" />
        }
        @if (canApprove()) {
          <p-button label="Approve" icon="pi pi-check" severity="success" (onClick)="approve()" />
          <p-button label="Return" icon="pi pi-undo" severity="warn" (onClick)="returnMr()" />
          <p-button label="Reject" icon="pi pi-times" severity="danger" (onClick)="reject()" />
        }
      </div>

      <!-- Form -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium">Title <span class="text-red-500">*</span></label>
          <input pInputText [formControl]="form.controls.title" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium">Business Unit <span class="text-red-500">*</span></label>
          <p-select [options]="buOptions()" [formControl]="form.controls.businessUnitId"
                    optionLabel="label" optionValue="value" placeholder="Select BU" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium">Project</label>
          <p-select [options]="projectOptions()" [formControl]="form.controls.projectId"
                    optionLabel="label" optionValue="value" placeholder="Select Project"
                    [showClear]="true" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium">Priority</label>
          <p-select [options]="priorityOptions" [formControl]="form.controls.priority" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium">Required By <span class="text-red-500">*</span></label>
          <p-datepicker [formControl]="form.controls.requiredBy" dateFormat="dd M yy" [showIcon]="true" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium">Source</label>
          <p-select [options]="sourceOptions" [formControl]="form.controls.source"
                    [showClear]="true" class="w-full" />
        </div>
        <div class="flex flex-col gap-1 md:col-span-2">
          <label class="text-sm font-medium">Justification</label>
          <textarea pTextarea [formControl]="form.controls.justification" [rows]="2" class="w-full"></textarea>
        </div>
      </div>

      <!-- Line Items -->
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-lg font-semibold">Line Items</h3>
        @if (isDraft()) {
          <p-button label="Add Line" icon="pi pi-plus" size="small" (onClick)="openLineDialog(null)" />
        }
      </div>

      <p-table [value]="lines()" styleClass="p-datatable-sm p-datatable-gridlines mb-4">
        <ng-template pTemplate="header">
          <tr>
            <th class="w-8">#</th>
            <th>Description</th>
            <th>Item</th>
            <th>UOM</th>
            <th class="text-right">Qty Req</th>
            @if (!isNew()) { <th class="text-right">Qty Appr</th> }
            <th class="text-right">Est. Rate</th>
            <th class="text-right">Est. Total</th>
            <th>Remarks</th>
            @if (isDraft()) { <th class="w-24"></th> }
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-line let-i="rowIndex">
          <tr>
            <td>{{ i + 1 }}</td>
            <td>{{ line.description }}</td>
            <td>{{ line.item?.sku || '\u2014' }}</td>
            <td>{{ line.uom }}</td>
            <td class="text-right">{{ line.qtyRequested }}</td>
            @if (!isNew()) { <td class="text-right">{{ line.qtyApproved ?? '\u2014' }}</td> }
            <td class="text-right">{{ line.estimatedRatePaise ? formatRupees(line.estimatedRatePaise) : '\u2014' }}</td>
            <td class="text-right">{{ lineTotal(line) }}</td>
            <td class="text-sm text-gray-500">{{ line.remarks || '' }}</td>
            @if (isDraft()) {
              <td class="text-center">
                <p-button icon="pi pi-pencil" [text]="true" size="small" (onClick)="openLineDialog(line)" />
                <p-button icon="pi pi-trash" [text]="true" severity="danger" size="small" (onClick)="deleteLine(line)" />
              </td>
            }
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr><td [attr.colspan]="isDraft() ? (isNew() ? 9 : 10) : (isNew() ? 8 : 9)" class="text-center py-6 text-gray-400">No line items</td></tr>
        </ng-template>
        <ng-template pTemplate="footer">
          <tr>
            <td [attr.colspan]="isDraft() ? (isNew() ? 7 : 8) : (isNew() ? 6 : 7)" class="text-right font-semibold">Estimated Total:</td>
            <td class="text-right font-semibold">{{ formatRupees(estimatedTotal()) }}</td>
            @if (isDraft()) { <td></td> }
            <td></td>
          </tr>
        </ng-template>
      </p-table>

      <!-- Line Dialog -->
      <p-dialog [(visible)]="lineDialogVisible" [header]="editingLine() ? 'Edit Line' : 'Add Line'"
                [modal]="true" [style]="{ width: '600px' }" [closable]="true">
        <div class="grid grid-cols-2 gap-4 pt-2">
          <div class="flex flex-col gap-1 col-span-2">
            <label class="text-sm font-medium">Description <span class="text-red-500">*</span></label>
            <input pInputText [(ngModel)]="lineForm.description" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium">Item (optional)</label>
            <p-select [options]="itemOptions()" [(ngModel)]="lineForm.itemId"
                      optionLabel="label" optionValue="value" [showClear]="true"
                      [filter]="true" placeholder="Select Item" appendTo="body" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium">UOM</label>
            <p-select [options]="uomOptions" [(ngModel)]="lineForm.uom" appendTo="body" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium">Quantity <span class="text-red-500">*</span></label>
            <p-inputNumber [(ngModel)]="lineForm.qtyRequested" [minFractionDigits]="0" [maxFractionDigits]="4" [min]="0.0001" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium">Estimated Rate (paise)</label>
            <p-inputNumber [(ngModel)]="lineForm.estimatedRatePaise" [min]="0" class="w-full" />
          </div>
          <div class="flex flex-col gap-1 col-span-2">
            <label class="text-sm font-medium">Remarks</label>
            <input pInputText [(ngModel)]="lineForm.remarks" class="w-full" />
          </div>
        </div>
        <ng-template pTemplate="footer">
          <p-button label="Cancel" [text]="true" (onClick)="lineDialogVisible = false" />
          <p-button label="Save Line" icon="pi pi-check" (onClick)="saveLine()" />
        </ng-template>
      </p-dialog>
    </div>
  `,
})
export class MrDetailComponent implements OnInit {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private fb = inject(FormBuilder);
  private msg = inject(MessageService);
  private confirm = inject(ConfirmationService);
  router = inject(Router);

  mr = signal<MrDetail | null>(null);
  lines = signal<MrLine[]>([]);
  loading = signal(false);
  saving = signal(false);
  isNew = signal(true);

  buOptions = signal<Array<{ label: string; value: string }>>([]);
  projectOptions = signal<Array<{ label: string; value: string }>>([]);
  itemOptions = signal<Array<{ label: string; value: string }>>([]);

  priorityOptions = [
    { label: 'Normal', value: 'NORMAL' },
    { label: 'Urgent', value: 'URGENT' },
    { label: 'Emergency', value: 'EMERGENCY' },
  ];
  sourceOptions = [
    { label: 'Stock', value: 'STOCK' }, { label: 'Purchase', value: 'PURCHASE' },
    { label: 'Fabrication', value: 'FABRICATION' }, { label: 'Maintenance', value: 'MAINTENANCE' },
    { label: 'Emergency', value: 'EMERGENCY' },
  ];
  uomOptions = ['NOS', 'KG', 'MTR', 'LTR', 'SET', 'LOT', 'SQM', 'CUM', 'RMT', 'PKT'].map((u) => ({ label: u, value: u }));

  form = this.fb.group({
    title: ['', Validators.required],
    businessUnitId: ['', Validators.required],
    projectId: [null as string | null],
    priority: ['NORMAL'],
    requiredBy: [null as Date | null, Validators.required],
    source: [null as string | null],
    justification: [null as string | null],
  });

  lineDialogVisible = false;
  editingLine = signal<MrLine | null>(null);
  lineForm = { itemId: null as string | null, description: '', uom: 'NOS', qtyRequested: 1, estimatedRatePaise: null as number | null, remarks: null as string | null };

  isDraft = computed(() => this.isNew() || this.mr()?.status === 'DRAFT');
  canApprove = computed(() => {
    const s = this.mr()?.status;
    return s === 'SUBMITTED' || s === 'PM_APPROVED';
  });

  estimatedTotal = computed(() =>
    this.lines().reduce((sum, l) => sum + (l.estimatedRatePaise ? l.estimatedRatePaise * l.qtyRequested : 0), 0),
  );

  ngOnInit(): void {
    this.loadLookups();
    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new') {
      this.isNew.set(false);
      this.loadMr(id);
    }
  }

  loadLookups(): void {
    this.http.get<{ data: Array<{ id: string; name: string }> }>(`${environment.apiBaseUrl}/business-units?limit=200`).subscribe({
      next: (res) => this.buOptions.set(res.data.map((b) => ({ label: b.name, value: b.id }))),
    });
    this.http.get<{ data: Array<{ id: string; name: string; code: string }> }>(`${environment.apiBaseUrl}/projects?limit=200`).subscribe({
      next: (res) => this.projectOptions.set(res.data.map((p) => ({ label: `${p.code} — ${p.name}`, value: p.id }))),
    });
    this.http.get<{ data: Array<{ id: string; sku: string; name: string }> }>(`${environment.apiBaseUrl}/items?limit=200`).subscribe({
      next: (res) => this.itemOptions.set(res.data.map((i) => ({ label: `${i.sku} — ${i.name}`, value: i.id }))),
    });
  }

  loadMr(id: string): void {
    this.loading.set(true);
    this.http.get<{ data: MrDetail }>(`${environment.apiBaseUrl}/material-requests/${id}`).subscribe({
      next: (res) => {
        const d = res.data;
        this.mr.set(d);
        this.lines.set(d.lines);
        this.form.patchValue({
          title: d.title,
          businessUnitId: d.businessUnitId,
          projectId: d.projectId,
          priority: d.priority,
          requiredBy: d.requiredBy ? new Date(d.requiredBy) : null,
          source: d.source,
          justification: d.justification,
        });
        if (d.status !== 'DRAFT') {
          this.form.disable();
        }
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); this.msg.add({ severity: 'error', summary: 'Failed to load' }); },
    });
  }

  save(): void {
    if (this.form.invalid) {
      this.msg.add({ severity: 'warn', summary: 'Please fill required fields' });
      return;
    }
    this.saving.set(true);
    const val = this.form.getRawValue();

    const toLocalDate = (d: Date | null) => {
      if (!d) return '';
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    if (this.isNew()) {
      const body = {
        title: val.title,
        businessUnitId: val.businessUnitId,
        projectId: val.projectId || undefined,
        priority: val.priority,
        requiredBy: toLocalDate(val.requiredBy),
        source: val.source || undefined,
        justification: val.justification || undefined,
        lines: this.lines().map((l) => ({
          itemId: l.itemId || undefined,
          description: l.description,
          uom: l.uom,
          qtyRequested: l.qtyRequested,
          estimatedRatePaise: l.estimatedRatePaise || undefined,
          remarks: l.remarks || undefined,
        })),
      };
      this.http.post<{ data: MrDetail }>(`${environment.apiBaseUrl}/material-requests`, body).subscribe({
        next: (res) => {
          this.saving.set(false);
          this.msg.add({ severity: 'success', summary: 'Material Request created' });
          this.router.navigate(['/procurement/material-requests', res.data.id]);
        },
        error: () => { this.saving.set(false); this.msg.add({ severity: 'error', summary: 'Create failed' }); },
      });
    } else {
      const body = {
        title: val.title || undefined,
        projectId: val.projectId,
        priority: val.priority || undefined,
        requiredBy: toLocalDate(val.requiredBy),
        source: val.source || undefined,
        justification: val.justification || undefined,
      };
      this.http.patch<{ data: MrDetail }>(`${environment.apiBaseUrl}/material-requests/${this.mr()!.id}`, body).subscribe({
        next: () => {
          this.saving.set(false);
          this.msg.add({ severity: 'success', summary: 'Saved' });
          this.loadMr(this.mr()!.id);
        },
        error: () => { this.saving.set(false); this.msg.add({ severity: 'error', summary: 'Save failed' }); },
      });
    }
  }

  submit(): void {
    if (this.isNew()) {
      this.msg.add({ severity: 'warn', summary: 'Save the MR first before submitting' });
      return;
    }
    this.http.post<{ data: unknown }>(`${environment.apiBaseUrl}/material-requests/${this.mr()!.id}/submit`, {}).subscribe({
      next: () => {
        this.msg.add({ severity: 'success', summary: 'Submitted for approval' });
        this.loadMr(this.mr()!.id);
      },
      error: (err) => this.msg.add({ severity: 'error', summary: err?.error?.error?.message ?? 'Submit failed' }),
    });
  }

  approve(): void {
    this.http.post<{ data: unknown }>(`${environment.apiBaseUrl}/material-requests/${this.mr()!.id}/approve`, {}).subscribe({
      next: () => { this.msg.add({ severity: 'success', summary: 'Approved' }); this.loadMr(this.mr()!.id); },
      error: (err) => this.msg.add({ severity: 'error', summary: err?.error?.error?.message ?? 'Approve failed' }),
    });
  }

  reject(): void {
    this.http.post<{ data: unknown }>(`${environment.apiBaseUrl}/material-requests/${this.mr()!.id}/reject`, {}).subscribe({
      next: () => { this.msg.add({ severity: 'success', summary: 'Rejected' }); this.loadMr(this.mr()!.id); },
      error: (err) => this.msg.add({ severity: 'error', summary: err?.error?.error?.message ?? 'Reject failed' }),
    });
  }

  returnMr(): void {
    this.http.post<{ data: unknown }>(`${environment.apiBaseUrl}/material-requests/${this.mr()!.id}/return`, {}).subscribe({
      next: () => { this.msg.add({ severity: 'success', summary: 'Returned for revision' }); this.loadMr(this.mr()!.id); },
      error: (err) => this.msg.add({ severity: 'error', summary: err?.error?.error?.message ?? 'Return failed' }),
    });
  }

  // ===== Line Item CRUD =====

  openLineDialog(line: MrLine | null): void {
    this.editingLine.set(line);
    if (line) {
      this.lineForm = { ...line, estimatedRatePaise: line.estimatedRatePaise, remarks: line.remarks };
    } else {
      this.lineForm = { itemId: null, description: '', uom: 'NOS', qtyRequested: 1, estimatedRatePaise: null, remarks: null };
    }
    this.lineDialogVisible = true;
  }

  saveLine(): void {
    if (!this.lineForm.description || this.lineForm.qtyRequested <= 0) {
      this.msg.add({ severity: 'warn', summary: 'Description and quantity are required' });
      return;
    }

    if (this.isNew()) {
      // Local-only management before first save
      const currentLines = [...this.lines()];
      if (this.editingLine()) {
        const idx = currentLines.findIndex((l) => l === this.editingLine());
        if (idx >= 0) currentLines[idx] = { ...currentLines[idx]!, ...this.lineForm } as MrLine;
      } else {
        currentLines.push({
          id: `temp_${Date.now()}`,
          sortOrder: currentLines.length,
          qtyApproved: null,
          qtyFulfilled: 0,
          ...this.lineForm,
        } as MrLine);
      }
      this.lines.set(currentLines);
      this.lineDialogVisible = false;
      return;
    }

    // Persisted MR — use API
    const body = {
      itemId: this.lineForm.itemId || undefined,
      description: this.lineForm.description,
      uom: this.lineForm.uom,
      qtyRequested: this.lineForm.qtyRequested,
      estimatedRatePaise: this.lineForm.estimatedRatePaise ?? undefined,
      remarks: this.lineForm.remarks || undefined,
    };

    if (this.editingLine()) {
      this.http.patch(`${environment.apiBaseUrl}/material-requests/${this.mr()!.id}/lines/${this.editingLine()!.id}`, body).subscribe({
        next: () => { this.lineDialogVisible = false; this.loadMr(this.mr()!.id); },
        error: () => this.msg.add({ severity: 'error', summary: 'Failed to update line' }),
      });
    } else {
      this.http.post(`${environment.apiBaseUrl}/material-requests/${this.mr()!.id}/lines`, body).subscribe({
        next: () => { this.lineDialogVisible = false; this.loadMr(this.mr()!.id); },
        error: () => this.msg.add({ severity: 'error', summary: 'Failed to add line' }),
      });
    }
  }

  deleteLine(line: MrLine): void {
    if (this.isNew()) {
      this.lines.set(this.lines().filter((l) => l !== line));
      return;
    }
    this.confirm.confirm({
      message: 'Delete this line?',
      accept: () => {
        this.http.delete(`${environment.apiBaseUrl}/material-requests/${this.mr()!.id}/lines/${line.id}`).subscribe({
          next: () => this.loadMr(this.mr()!.id),
          error: () => this.msg.add({ severity: 'error', summary: 'Delete failed' }),
        });
      },
    });
  }

  lineTotal(line: MrLine): string {
    if (!line.estimatedRatePaise) return '\u2014';
    return this.formatRupees(line.estimatedRatePaise * line.qtyRequested);
  }

  statusSeverity(s: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast' {
    const map: Record<string, 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast'> = {
      DRAFT: 'secondary', SUBMITTED: 'info', PM_APPROVED: 'info', BU_HEAD_APPROVED: 'success',
      INDENTED: 'warn', PO_RAISED: 'success', FULFILLED: 'success', REJECTED: 'danger', CANCELLED: 'danger',
    };
    return map[s] ?? 'secondary';
  }

  prioritySeverity(p: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast' {
    return p === 'EMERGENCY' ? 'danger' : p === 'URGENT' ? 'warn' : 'secondary';
  }

  formatRupees(paise: number): string {
    if (!paise) return '\u2014';
    return '\u20B9' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
