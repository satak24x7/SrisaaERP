import { Component, ChangeDetectionStrategy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';

interface WorkflowStep {
  id?: string; stepOrder: number; stepName: string; approverRoleName: string | null;
  specificUserId: string | null; minValuePaise: number | null; maxValuePaise: number | null;
}

interface Workflow {
  id: string; entityType: string; name: string; isActive: boolean;
  steps: WorkflowStep[]; createdAt: string;
}

@Component({
  selector: 'app-approval-workflows',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ButtonModule, TableModule, TagModule, SelectModule, InputTextModule, InputNumberModule, DialogModule, ToastModule, ToggleSwitchModule, ConfirmDialogModule],
  providers: [MessageService, ConfirmationService],
  template: `
    <p-toast /><p-confirmDialog />
    <div class="p-6">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <i class="pi pi-sitemap text-indigo-600"></i> Approval Workflows
        </h2>
        <p-button label="New Workflow" icon="pi pi-plus" (onClick)="openDialog(null)" />
      </div>

      <p-table [value]="workflows()" [loading]="loading()" styleClass="p-datatable-sm p-datatable-gridlines" [rowHover]="true">
        <ng-template pTemplate="header">
          <tr>
            <th>Name</th>
            <th>Entity Type</th>
            <th class="text-center">Steps</th>
            <th class="text-center">Active</th>
            <th class="w-32"></th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-wf>
          <tr>
            <td class="font-medium">{{ wf.name }}</td>
            <td><p-tag [value]="wf.entityType" severity="info" /></td>
            <td class="text-center">{{ wf.steps?.length || 0 }}</td>
            <td class="text-center">
              <p-tag [value]="wf.isActive ? 'Active' : 'Inactive'" [severity]="wf.isActive ? 'success' : 'secondary'" />
            </td>
            <td class="text-center">
              <p-button icon="pi pi-pencil" [text]="true" size="small" (onClick)="openDialog(wf)" />
              <p-button icon="pi pi-trash" [text]="true" severity="danger" size="small" (onClick)="confirmDelete(wf)" />
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr><td colspan="5" class="text-center py-8 text-gray-400">No workflows configured</td></tr>
        </ng-template>
      </p-table>

      <!-- Workflow Dialog -->
      <p-dialog [(visible)]="dialogVisible" [header]="editingWf ? 'Edit Workflow' : 'New Workflow'"
                [modal]="true" [style]="{ width: '720px' }" [closable]="true">
        <div class="grid grid-cols-2 gap-4 pt-2 mb-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium">Name <span class="text-red-500">*</span></label>
            <input pInputText [(ngModel)]="formName" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium">Entity Type <span class="text-red-500">*</span></label>
            <p-select [options]="entityTypeOptions" [(ngModel)]="formEntityType" appendTo="body" class="w-full" />
          </div>
          <div class="flex items-center gap-2 col-span-2">
            <p-toggleSwitch [(ngModel)]="formIsActive" />
            <span class="text-sm">Active</span>
          </div>
        </div>

        <h4 class="text-sm font-semibold mb-2 flex items-center justify-between">
          Steps
          <p-button label="Add Step" icon="pi pi-plus" size="small" [text]="true" (onClick)="addStep()" />
        </h4>

        <p-table [value]="formSteps" styleClass="p-datatable-sm mb-4">
          <ng-template pTemplate="header">
            <tr>
              <th class="w-16">Order</th>
              <th>Step Name</th>
              <th>Approver Role</th>
              <th class="text-right">Min Value (₹)</th>
              <th class="text-right">Max Value (₹)</th>
              <th class="w-16"></th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-step let-i="rowIndex">
            <tr>
              <td><p-inputNumber [(ngModel)]="step.stepOrder" [min]="1" [showButtons]="false" class="w-16" /></td>
              <td><input pInputText [(ngModel)]="step.stepName" class="w-full" /></td>
              <td>
                <p-select [options]="roleOptions()" [(ngModel)]="step.approverRoleName" optionLabel="label" optionValue="value"
                          [showClear]="true" appendTo="body" placeholder="Select Role" class="w-full" />
              </td>
              <td><p-inputNumber [(ngModel)]="step.minValuePaise" mode="decimal" [min]="0" [showButtons]="false" class="w-full" /></td>
              <td><p-inputNumber [(ngModel)]="step.maxValuePaise" mode="decimal" [min]="0" [showButtons]="false" class="w-full" /></td>
              <td class="text-center">
                <p-button icon="pi pi-trash" [text]="true" severity="danger" size="small" (onClick)="removeStep(i)" />
              </td>
            </tr>
          </ng-template>
        </p-table>

        <ng-template pTemplate="footer">
          <p-button label="Cancel" [text]="true" (onClick)="dialogVisible = false" />
          <p-button [label]="editingWf ? 'Update' : 'Create'" icon="pi pi-check" (onClick)="saveWorkflow()" [loading]="saving()" />
        </ng-template>
      </p-dialog>
    </div>
  `,
})
export class ApprovalWorkflowsComponent implements OnInit {
  private http = inject(HttpClient);
  private msg = inject(MessageService);
  private confirm = inject(ConfirmationService);

  workflows = signal<Workflow[]>([]);
  loading = signal(false);
  saving = signal(false);
  roleOptions = signal<Array<{ label: string; value: string }>>([]);

  entityTypeOptions = [
    { label: 'Material Request', value: 'MATERIAL_REQUEST' },
    { label: 'Purchase Order', value: 'PURCHASE_ORDER' },
    { label: 'Expense Sheet', value: 'EXPENSE_SHEET' },
  ];

  dialogVisible = false;
  editingWf: Workflow | null = null;
  formName = '';
  formEntityType = 'MATERIAL_REQUEST';
  formIsActive = true;
  formSteps: WorkflowStep[] = [];

  ngOnInit(): void {
    this.load();
    this.loadRoles();
  }

  load(): void {
    this.loading.set(true);
    this.http.get<{ data: Workflow[] }>(`${environment.apiBaseUrl}/approvals/workflows`).subscribe({
      next: (res) => { this.workflows.set(res.data); this.loading.set(false); },
      error: () => { this.loading.set(false); this.msg.add({ severity: 'error', summary: 'Failed to load' }); },
    });
  }

  loadRoles(): void {
    this.http.get<{ data: Array<{ id: string; name: string; displayName: string }> }>(`${environment.apiBaseUrl}/roles?limit=50`).subscribe({
      next: (res) => this.roleOptions.set(res.data.map((r) => ({ label: r.displayName || r.name, value: r.name }))),
    });
  }

  openDialog(wf: Workflow | null): void {
    this.editingWf = wf;
    if (wf) {
      this.formName = wf.name;
      this.formEntityType = wf.entityType;
      this.formIsActive = wf.isActive;
      this.formSteps = wf.steps.map((s) => ({ ...s }));
    } else {
      this.formName = '';
      this.formEntityType = 'MATERIAL_REQUEST';
      this.formIsActive = true;
      this.formSteps = [{ stepOrder: 1, stepName: 'Approval', approverRoleName: null, specificUserId: null, minValuePaise: null, maxValuePaise: null }];
    }
    this.dialogVisible = true;
  }

  addStep(): void {
    const nextOrder = this.formSteps.length > 0 ? Math.max(...this.formSteps.map((s) => s.stepOrder)) + 1 : 1;
    this.formSteps = [...this.formSteps, { stepOrder: nextOrder, stepName: '', approverRoleName: null, specificUserId: null, minValuePaise: null, maxValuePaise: null }];
  }

  removeStep(idx: number): void {
    this.formSteps = this.formSteps.filter((_, i) => i !== idx);
  }

  saveWorkflow(): void {
    if (!this.formName || !this.formEntityType || this.formSteps.length === 0) {
      this.msg.add({ severity: 'warn', summary: 'Name, entity type, and at least one step are required' });
      return;
    }
    this.saving.set(true);
    const body = {
      name: this.formName,
      entityType: this.formEntityType,
      isActive: this.formIsActive,
      steps: this.formSteps.map((s) => ({
        stepOrder: s.stepOrder,
        stepName: s.stepName,
        approverRoleName: s.approverRoleName || undefined,
        specificUserId: s.specificUserId || undefined,
        minValuePaise: s.minValuePaise ?? undefined,
        maxValuePaise: s.maxValuePaise ?? undefined,
      })),
    };

    const req$ = this.editingWf
      ? this.http.patch(`${environment.apiBaseUrl}/approvals/workflows/${this.editingWf.id}`, body)
      : this.http.post(`${environment.apiBaseUrl}/approvals/workflows`, body);

    req$.subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogVisible = false;
        this.msg.add({ severity: 'success', summary: this.editingWf ? 'Updated' : 'Created' });
        this.load();
      },
      error: () => { this.saving.set(false); this.msg.add({ severity: 'error', summary: 'Save failed' }); },
    });
  }

  confirmDelete(wf: Workflow): void {
    this.confirm.confirm({
      message: `Delete workflow "${wf.name}"?`,
      accept: () => {
        this.http.delete(`${environment.apiBaseUrl}/approvals/workflows/${wf.id}`).subscribe({
          next: () => { this.msg.add({ severity: 'success', summary: 'Deleted' }); this.load(); },
          error: (err) => this.msg.add({ severity: 'error', summary: err?.error?.error?.message ?? 'Delete failed' }),
        });
      },
    });
  }
}
