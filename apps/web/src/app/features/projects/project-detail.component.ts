import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ReactiveFormsModule, FormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { InputNumberModule } from 'primeng/inputnumber';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TabsModule } from 'primeng/tabs';
import { TableModule } from 'primeng/table';
import { DatePickerModule } from 'primeng/datepicker';
import { TextareaModule } from 'primeng/textarea';
import { ChartModule } from 'primeng/chart';
import { ConfirmationService, MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';
import { ActivityPanelComponent } from '../../shared/components/activity-panel.component';
import { KanbanBoardComponent } from './kanban-board.component';

interface Ref { id: string; name: string; }
interface LookupItem { label: string; value: string; isActive?: boolean; }

interface MilestoneRow { id: string; name: string; description: string | null; deliverable: string | null; plannedDate: string; actualDate: string | null; percentOfContract: number | null; invoiceAmountPaise: number | null; status: string; sortOrder: number; }

interface TaskRow { id: string; title: string; priority: string; kanbanColumn: string; ownerName: string | null; milestoneName: string | null; estimateHours: number | null; actualHours: number | null; startDate: string | null; endDate: string | null; status: string; }

interface BudgetLineRow { id: string; category: string; description: string | null; estimatedPaise: number; committedPaise: number; actualPaise: number; }
interface BudgetData { id: string; totalEstimatedPaise: number; notes: string | null; lines: BudgetLineRow[]; totals: { estimated: number; committed: number; actual: number; variance: number }; }

interface InflowItem { id: string; description: string; milestoneId: string | null; invoiceDate: string; amountPaise: number; gstPct: number; retentionPct: number; status: string; }

interface CashFlowRow { id: string; periodLabel: string; periodStart: string; periodEnd: string; openingBalancePaise: number; billedPaise: number; receivedPaise: number; outflowPaise: number; closingBalancePaise: number; }

interface PbgRow { id: string; type: string; description: string; amountPaise: number; bankName: string | null; bgNumber: string | null; issuedDate: string | null; expiryDate: string | null; status: string; releaseDate: string | null; notes: string | null; }

interface RiskRow { id: string; title: string; description: string | null; probability: string; impact: string; mitigation: string | null; status: string; ownerName: string | null; }
interface IssueRow { id: string; title: string; description: string | null; severity: string; resolution: string | null; status: string; ownerName: string | null; }

interface HealthData { schedule: { total: number; completed: number; overdue: number; rag: string }; budget: { totalEstimated: number; totalActual: number; totalCommitted: number; utilization: number; rag: string }; scope: { totalTasks: number; completed: number; inProgress: number; blocked: number; completion: number; rag: string }; overall: string; }

interface Project {
  id: string; projectCode: string | null; name: string; description: string | null;
  clientName: string; workOrderRef: string | null;
  contractValuePaise: number; startDate: string; endDate: string;
  location: string | null; category: string | null;
  businessUnitId: string; businessUnitName: string | null;
  opportunityId: string | null; opportunityTitle: string | null;
  sponsorUserId: string | null; projectManagerId: string;
  projectManagerName: string | null; status: string;
  milestoneSummary: { total: number; completed: number };
  taskSummary: Record<string, number>;
  createdAt: string; updatedAt: string;
}

const STATUS_OPTIONS = [
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'On Hold', value: 'ON_HOLD' },
  { label: 'Closed', value: 'CLOSED' },
];

const MILESTONE_STATUSES = [
  { label: 'Not Started', value: 'NOT_STARTED' },
  { label: 'In Progress', value: 'IN_PROGRESS' },
  { label: 'Completed', value: 'COMPLETED' },
  { label: 'Invoiced', value: 'INVOICED' },
];

const TASK_PRIORITIES = [
  { label: 'Low', value: 'LOW' },
  { label: 'Medium', value: 'MEDIUM' },
  { label: 'High', value: 'HIGH' },
  { label: 'Critical', value: 'CRITICAL' },
];

const TASK_STATUSES = [
  { label: 'To Do', value: 'TODO' },
  { label: 'In Progress', value: 'IN_PROGRESS' },
  { label: 'In Review', value: 'IN_REVIEW' },
  { label: 'Done', value: 'DONE' },
  { label: 'Blocked', value: 'BLOCKED' },
];

const BUDGET_CATEGORIES = [
  { label: 'Manpower', value: 'MANPOWER' },
  { label: 'Hardware', value: 'HARDWARE' },
  { label: 'Licences', value: 'LICENCES' },
  { label: 'Subcontract', value: 'SUBCONTRACT' },
  { label: 'Travel', value: 'TRAVEL' },
  { label: 'Overheads', value: 'OVERHEADS' },
  { label: 'Other', value: 'OTHER' },
];

const INFLOW_STATUSES = [
  { label: 'Planned', value: 'PLANNED' },
  { label: 'Invoiced', value: 'INVOICED' },
  { label: 'Received', value: 'RECEIVED' },
];

const PBG_TYPES = [
  { label: 'PBG', value: 'PBG' },
  { label: 'Retention', value: 'RETENTION' },
];

const PBG_STATUSES = [
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Released', value: 'RELEASED' },
  { label: 'Expired', value: 'EXPIRED' },
  { label: 'Invoked', value: 'INVOKED' },
];

const PROBABILITY_OPTIONS = [
  { label: 'Low', value: 'LOW' },
  { label: 'Medium', value: 'MEDIUM' },
  { label: 'High', value: 'HIGH' },
];

const IMPACT_OPTIONS = [
  { label: 'Low', value: 'LOW' },
  { label: 'Medium', value: 'MEDIUM' },
  { label: 'High', value: 'HIGH' },
  { label: 'Critical', value: 'CRITICAL' },
];

const RISK_STATUSES = [
  { label: 'Open', value: 'OPEN' },
  { label: 'Mitigated', value: 'MITIGATED' },
  { label: 'Closed', value: 'CLOSED' },
];

const ISSUE_SEVERITIES = [
  { label: 'Low', value: 'LOW' },
  { label: 'Medium', value: 'MEDIUM' },
  { label: 'High', value: 'HIGH' },
  { label: 'Critical', value: 'CRITICAL' },
];

const ISSUE_STATUSES = [
  { label: 'Open', value: 'OPEN' },
  { label: 'In Progress', value: 'IN_PROGRESS' },
  { label: 'Resolved', value: 'RESOLVED' },
  { label: 'Closed', value: 'CLOSED' },
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
  selector: 'app-project-detail',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, ButtonModule, InputTextModule, SelectModule, MultiSelectModule, InputNumberModule, TagModule, DialogModule, ToastModule, ConfirmDialogModule, TabsModule, TableModule, DatePickerModule, TextareaModule, ChartModule, ActivityPanelComponent, KanbanBoardComponent],
  providers: [MessageService, ConfirmationService],
  template: `
    <p-toast /><p-confirmDialog />

    @if (loading()) {
      <div class="flex items-center gap-2 text-gray-500 py-12 justify-center"><i class="pi pi-spin pi-spinner text-2xl"></i> Loading...</div>
    } @else {
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-3">
          <p-button icon="pi pi-arrow-left" [text]="true" [rounded]="true" (onClick)="goBack()" />
          <h2 class="text-2xl font-semibold text-gray-800">{{ isNew ? 'New Project' : project()?.name }}</h2>
          @if (project()?.projectCode) {
            <span class="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded">{{ project()!.projectCode }}</span>
          }
          @if (project()?.status) {
            <p-tag [value]="project()!.status" [severity]="statusSeverity(project()!.status)" />
          }
        </div>
        @if (!isNew && project()) {
          <div class="flex gap-2">
            @if (project()!.status === 'DRAFT') {
              <p-button label="Activate" icon="pi pi-play" severity="success" size="small" (onClick)="changeStatus('ACTIVE')" />
            }
            @if (project()!.status === 'ACTIVE') {
              <p-button label="Put On Hold" icon="pi pi-pause" severity="warn" size="small" (onClick)="changeStatus('ON_HOLD')" />
              <p-button label="Close" icon="pi pi-check" severity="info" size="small" (onClick)="changeStatus('CLOSED')" />
            }
            @if (project()!.status === 'ON_HOLD') {
              <p-button label="Resume" icon="pi pi-play" severity="success" size="small" (onClick)="changeStatus('ACTIVE')" />
            }
          </div>
        }
      </div>

      <!-- Top Form -->
      <form [formGroup]="form" (ngSubmit)="onSave()">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <!-- Left -->
          <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 class="text-lg font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <i class="pi pi-briefcase text-blue-600"></i> Project Details
            </h3>
            <div class="flex flex-col gap-4">
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Name *</label>
                <input pInputText formControlName="name" class="w-full" />
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Project Code</label>
                  <input pInputText formControlName="projectCode" class="w-full" />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Client Name *</label>
                  <input pInputText formControlName="clientName" class="w-full" />
                </div>
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Work Order Ref</label>
                  <input pInputText formControlName="workOrderRef" class="w-full" />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Contract Value (₹) *</label>
                  <p-inputNumber formControlName="contractValueRupees" mode="currency" currency="INR" locale="en-IN" class="w-full" />
                </div>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Description</label>
                <textarea pTextarea formControlName="description" [rows]="3" class="w-full"></textarea>
              </div>
            </div>
          </div>

          <!-- Right -->
          <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 class="text-lg font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <i class="pi pi-cog text-green-600"></i> Configuration
            </h3>
            <div class="flex flex-col gap-4">
              <div class="grid grid-cols-2 gap-4">
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Business Unit *</label>
                  <p-select appendTo="body" formControlName="businessUnitId" [options]="buOptions()" optionLabel="name" optionValue="id" [filter]="true" class="w-full" />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Project Manager *</label>
                  <p-select appendTo="body" formControlName="projectManagerId" [options]="userOptions()" optionLabel="name" optionValue="id" [filter]="true" class="w-full" />
                </div>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Sponsor</label>
                <p-select appendTo="body" formControlName="sponsorUserId" [options]="userOptions()" optionLabel="name" optionValue="id" [filter]="true" [showClear]="true" placeholder="Select sponsor" class="w-full" />
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Start Date *</label>
                  <p-datepicker appendTo="body" formControlName="startDate" dateFormat="yy-mm-dd" class="w-full" />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">End Date *</label>
                  <p-datepicker appendTo="body" formControlName="endDate" dateFormat="yy-mm-dd" class="w-full" />
                </div>
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Location</label>
                  <input pInputText formControlName="location" class="w-full" />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Category</label>
                  <p-select appendTo="body" formControlName="category" [options]="categoryOptions()" optionLabel="label" optionValue="value" [showClear]="true" placeholder="Select category" class="w-full" />
                </div>
              </div>
            </div>
          </div>
        </div>

        @if (serverError) {
          <div class="p-3 mb-4 bg-red-50 border border-red-200 rounded text-sm text-red-700">{{ serverError }}</div>
        }

        <div class="flex justify-end gap-2 mb-6">
          <p-button label="Cancel" severity="secondary" [outlined]="true" (onClick)="goBack()" />
          <p-button [label]="isNew ? 'Create Project' : 'Save Changes'" type="submit" icon="pi pi-save" [loading]="saving" [disabled]="form.pristine || form.invalid || saving" />
        </div>
      </form>

      <!-- Tabs (edit mode only) -->
      @if (!isNew && project()) {
        <p-tabs [value]="0">
          <p-tablist>
            <p-tab [value]="0">Overview</p-tab>
            <p-tab [value]="1">Milestones</p-tab>
            <p-tab [value]="2">Tasks</p-tab>
            <p-tab [value]="3">Budget</p-tab>
            <p-tab [value]="4">Cash Flow</p-tab>
            <p-tab [value]="5">PBG &amp; Retention</p-tab>
            <p-tab [value]="6">Risks &amp; Issues</p-tab>
            <p-tab [value]="7">Health</p-tab>
          </p-tablist>
          <p-tabpanels>
            <!-- Tab 0: Overview -->
            <p-tabpanel [value]="0">
              <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 mt-4">
                <div class="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <div class="text-xs text-blue-600 font-medium">Contract Value</div>
                  <div class="text-xl font-bold text-blue-800">{{ formatRupees(project()!.contractValuePaise) }}</div>
                </div>
                <div class="bg-green-50 rounded-lg p-4 border border-green-200">
                  <div class="text-xs text-green-600 font-medium">Milestones</div>
                  <div class="text-xl font-bold text-green-800">{{ project()!.milestoneSummary.completed }} / {{ project()!.milestoneSummary.total }}</div>
                </div>
                <div class="bg-purple-50 rounded-lg p-4 border border-purple-200">
                  <div class="text-xs text-purple-600 font-medium">Tasks</div>
                  <div class="text-xl font-bold text-purple-800">
                    @for (entry of taskSummaryEntries(); track entry[0]) {
                      <span class="text-sm">{{ entry[0] }}: {{ entry[1] }} </span>
                    }
                    @if (taskSummaryEntries().length === 0) { <span class="text-sm text-gray-400">None</span> }
                  </div>
                </div>
                <div class="bg-amber-50 rounded-lg p-4 border border-amber-200">
                  <div class="text-xs text-amber-600 font-medium">Budget Utilization</div>
                  <div class="text-xl font-bold text-amber-800">
                    @if (budget()) { {{ budgetUtilization() }}% } @else { N/A }
                  </div>
                </div>
              </div>
              <app-activity-panel entityType="PROJECT" [entityId]="project()!.id" />
            </p-tabpanel>

            <!-- Tab 1: Milestones -->
            <p-tabpanel [value]="1">
              <div class="flex justify-end mb-4 mt-4">
                <p-button label="Add Milestone" icon="pi pi-plus" size="small" (onClick)="openMilestoneDialog()" />
              </div>
              <p-table [value]="milestones()" styleClass="p-datatable-sm" [rows]="20">
                <ng-template pTemplate="header">
                  <tr>
                    <th style="width:50px">#</th><th>Name</th><th>Deliverable</th><th>Planned Date</th><th>Actual Date</th><th>% of Contract</th><th>Invoice Amount</th><th>Status</th><th style="width:100px">Actions</th>
                  </tr>
                </ng-template>
                <ng-template pTemplate="body" let-m let-i="rowIndex">
                  <tr>
                    <td>{{ i + 1 }}</td>
                    <td>{{ m.name }}</td>
                    <td>{{ m.deliverable || '-' }}</td>
                    <td>{{ m.plannedDate | date:'mediumDate' }}</td>
                    <td>{{ m.actualDate ? (m.actualDate | date:'mediumDate') : '-' }}</td>
                    <td>{{ m.percentOfContract != null ? m.percentOfContract + '%' : '-' }}</td>
                    <td>{{ m.invoiceAmountPaise != null ? formatRupees(m.invoiceAmountPaise) : '-' }}</td>
                    <td><p-tag [value]="m.status" [severity]="milestoneSeverity(m.status)" /></td>
                    <td>
                      <div class="flex gap-1">
                        <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small" (onClick)="openMilestoneDialog(m)" />
                        <p-button icon="pi pi-trash" [text]="true" [rounded]="true" size="small" severity="danger" (onClick)="deleteMilestone(m.id)" />
                      </div>
                    </td>
                  </tr>
                </ng-template>
                <ng-template pTemplate="emptymessage">
                  <tr><td colspan="9" class="text-center text-gray-400 py-4">No milestones yet</td></tr>
                </ng-template>
              </p-table>
            </p-tabpanel>

            <!-- Tab 2: Tasks -->
            <p-tabpanel [value]="2">
              <div class="flex items-center justify-between mb-4 mt-4">
                <div class="flex gap-2">
                  <p-button [label]="'Table'" [severity]="taskView === 'table' ? undefined : 'secondary'" [outlined]="taskView !== 'table'" size="small" icon="pi pi-list" (onClick)="taskView='table'" />
                  <p-button [label]="'Kanban'" [severity]="taskView === 'kanban' ? undefined : 'secondary'" [outlined]="taskView !== 'kanban'" size="small" icon="pi pi-th-large" (onClick)="taskView='kanban'" />
                </div>
                @if (taskView === 'table') {
                  <p-button label="Add Task" icon="pi pi-plus" size="small" (onClick)="openTaskDialog()" />
                }
              </div>
              @if (taskView === 'table') {
                <p-table [value]="tasks()" styleClass="p-datatable-sm" [rows]="20">
                  <ng-template pTemplate="header">
                    <tr>
                      <th>Title</th><th>Priority</th><th>Status</th><th>Owner</th><th>Milestone</th><th>Est Hrs</th><th>Actual Hrs</th><th>Start</th><th>End</th><th style="width:100px">Actions</th>
                    </tr>
                  </ng-template>
                  <ng-template pTemplate="body" let-t>
                    <tr>
                      <td>{{ t.title }}</td>
                      <td><p-tag [value]="t.priority" [severity]="prioritySeverity(t.priority)" /></td>
                      <td><p-tag [value]="t.status" [severity]="taskStatusSeverity(t.status)" /></td>
                      <td>{{ t.ownerName || '-' }}</td>
                      <td>{{ t.milestoneName || '-' }}</td>
                      <td>{{ t.estimateHours ?? '-' }}</td>
                      <td>{{ t.actualHours ?? '-' }}</td>
                      <td>{{ t.startDate ? (t.startDate | date:'mediumDate') : '-' }}</td>
                      <td>{{ t.endDate ? (t.endDate | date:'mediumDate') : '-' }}</td>
                      <td>
                        <div class="flex gap-1">
                          <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small" (onClick)="openTaskDialog(t)" />
                          <p-button icon="pi pi-trash" [text]="true" [rounded]="true" size="small" severity="danger" (onClick)="deleteTask(t.id)" />
                        </div>
                      </td>
                    </tr>
                  </ng-template>
                  <ng-template pTemplate="emptymessage">
                    <tr><td colspan="10" class="text-center text-gray-400 py-4">No tasks yet</td></tr>
                  </ng-template>
                </p-table>
              } @else {
                <app-kanban-board [projectId]="project()!.id" />
              }
            </p-tabpanel>

            <!-- Tab 3: Budget -->
            <p-tabpanel [value]="3">
              <div class="mt-4">
                @if (!budget()) {
                  <div class="text-center py-8">
                    <p class="text-gray-500 mb-4">No budget has been created for this project.</p>
                    <p-button label="Create Budget" icon="pi pi-plus" (onClick)="createBudget()" />
                  </div>
                } @else {
                  <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                    <div class="bg-blue-50 rounded-lg p-4 border border-blue-200">
                      <div class="text-xs text-blue-600 font-medium">Estimated</div>
                      <div class="text-lg font-bold text-blue-800">{{ formatRupees(budget()!.totals.estimated) }}</div>
                    </div>
                    <div class="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                      <div class="text-xs text-yellow-600 font-medium">Committed</div>
                      <div class="text-lg font-bold text-yellow-800">{{ formatRupees(budget()!.totals.committed) }}</div>
                    </div>
                    <div class="bg-green-50 rounded-lg p-4 border border-green-200">
                      <div class="text-xs text-green-600 font-medium">Actual</div>
                      <div class="text-lg font-bold text-green-800">{{ formatRupees(budget()!.totals.actual) }}</div>
                    </div>
                    <div class="rounded-lg p-4 border" [ngClass]="budget()!.totals.variance >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'">
                      <div class="text-xs font-medium" [ngClass]="budget()!.totals.variance >= 0 ? 'text-green-600' : 'text-red-600'">Variance</div>
                      <div class="text-lg font-bold" [ngClass]="budget()!.totals.variance >= 0 ? 'text-green-800' : 'text-red-800'">{{ formatRupees(budget()!.totals.variance) }}</div>
                    </div>
                  </div>
                  <div class="flex justify-end mb-4">
                    <p-button label="Add Budget Line" icon="pi pi-plus" size="small" (onClick)="openBudgetLineDialog()" />
                  </div>
                  <p-table [value]="budget()!.lines" styleClass="p-datatable-sm" [rows]="20">
                    <ng-template pTemplate="header">
                      <tr>
                        <th>Category</th><th>Description</th><th class="text-right">Estimated</th><th class="text-right">Committed</th><th class="text-right">Actual</th><th class="text-right">Variance</th><th style="width:100px">Actions</th>
                      </tr>
                    </ng-template>
                    <ng-template pTemplate="body" let-line>
                      <tr>
                        <td>{{ line.category }}</td>
                        <td>{{ line.description || '-' }}</td>
                        <td class="text-right">{{ formatRupees(line.estimatedPaise) }}</td>
                        <td class="text-right">{{ formatRupees(line.committedPaise) }}</td>
                        <td class="text-right">{{ formatRupees(line.actualPaise) }}</td>
                        <td class="text-right" [ngClass]="(line.estimatedPaise - line.actualPaise) >= 0 ? 'text-green-700' : 'text-red-700'">{{ formatRupees(line.estimatedPaise - line.actualPaise) }}</td>
                        <td>
                          <div class="flex gap-1">
                            <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small" (onClick)="openBudgetLineDialog(line)" />
                            <p-button icon="pi pi-trash" [text]="true" [rounded]="true" size="small" severity="danger" (onClick)="deleteBudgetLine(line.id)" />
                          </div>
                        </td>
                      </tr>
                    </ng-template>
                    <ng-template pTemplate="emptymessage">
                      <tr><td colspan="7" class="text-center text-gray-400 py-4">No budget lines yet</td></tr>
                    </ng-template>
                  </p-table>
                }
              </div>
            </p-tabpanel>

            <!-- Tab 4: Cash Flow -->
            <p-tabpanel [value]="4">
              <div class="mt-4">
                <!-- Inflow Plan -->
                <div class="mb-6">
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
                <div>
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
              </div>
            </p-tabpanel>

            <!-- Tab 5: PBG & Retention -->
            <p-tabpanel [value]="5">
              <div class="flex justify-end mb-4 mt-4">
                <p-button label="Add PBG / Retention" icon="pi pi-plus" size="small" (onClick)="openPbgDialog()" />
              </div>
              <p-table [value]="pbgRows()" styleClass="p-datatable-sm" [rows]="20">
                <ng-template pTemplate="header">
                  <tr>
                    <th>Type</th><th>Description</th><th class="text-right">Amount</th><th>Bank</th><th>BG Number</th><th>Issued</th><th>Expiry</th><th>Status</th><th style="width:100px">Actions</th>
                  </tr>
                </ng-template>
                <ng-template pTemplate="body" let-p>
                  <tr>
                    <td><p-tag [value]="p.type" [severity]="p.type === 'PBG' ? 'info' : 'warn'" /></td>
                    <td>{{ p.description }}</td>
                    <td class="text-right">{{ formatRupees(p.amountPaise) }}</td>
                    <td>{{ p.bankName || '-' }}</td>
                    <td>{{ p.bgNumber || '-' }}</td>
                    <td>{{ p.issuedDate ? (p.issuedDate | date:'mediumDate') : '-' }}</td>
                    <td>{{ p.expiryDate ? (p.expiryDate | date:'mediumDate') : '-' }}</td>
                    <td><p-tag [value]="p.status" [severity]="pbgStatusSeverity(p.status)" /></td>
                    <td>
                      <div class="flex gap-1">
                        <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small" (onClick)="openPbgDialog(p)" />
                        <p-button icon="pi pi-trash" [text]="true" [rounded]="true" size="small" severity="danger" (onClick)="deletePbg(p.id)" />
                      </div>
                    </td>
                  </tr>
                </ng-template>
                <ng-template pTemplate="emptymessage">
                  <tr><td colspan="9" class="text-center text-gray-400 py-4">No PBG / retention records yet</td></tr>
                </ng-template>
              </p-table>
            </p-tabpanel>

            <!-- Tab 6: Risks & Issues -->
            <p-tabpanel [value]="6">
              <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
                <!-- Risks -->
                <div>
                  <div class="flex items-center justify-between mb-4">
                    <h3 class="text-lg font-semibold text-gray-700">Risks</h3>
                    <p-button label="Add Risk" icon="pi pi-plus" size="small" (onClick)="openRiskDialog()" />
                  </div>
                  <p-table [value]="risks()" styleClass="p-datatable-sm" [rows]="20">
                    <ng-template pTemplate="header">
                      <tr>
                        <th>Title</th><th>Probability</th><th>Impact</th><th>Status</th><th>Owner</th><th style="width:90px">Actions</th>
                      </tr>
                    </ng-template>
                    <ng-template pTemplate="body" let-r>
                      <tr>
                        <td>{{ r.title }}</td>
                        <td><p-tag [value]="r.probability" [severity]="prioritySeverity(r.probability)" /></td>
                        <td><p-tag [value]="r.impact" [severity]="prioritySeverity(r.impact)" /></td>
                        <td><p-tag [value]="r.status" [severity]="riskStatusSeverity(r.status)" /></td>
                        <td>{{ r.ownerName || '-' }}</td>
                        <td>
                          <div class="flex gap-1">
                            <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small" (onClick)="openRiskDialog(r)" />
                            <p-button icon="pi pi-trash" [text]="true" [rounded]="true" size="small" severity="danger" (onClick)="deleteRisk(r.id)" />
                          </div>
                        </td>
                      </tr>
                    </ng-template>
                    <ng-template pTemplate="emptymessage">
                      <tr><td colspan="6" class="text-center text-gray-400 py-4">No risks</td></tr>
                    </ng-template>
                  </p-table>
                </div>

                <!-- Issues -->
                <div>
                  <div class="flex items-center justify-between mb-4">
                    <h3 class="text-lg font-semibold text-gray-700">Issues</h3>
                    <p-button label="Add Issue" icon="pi pi-plus" size="small" (onClick)="openIssueDialog()" />
                  </div>
                  <p-table [value]="issues()" styleClass="p-datatable-sm" [rows]="20">
                    <ng-template pTemplate="header">
                      <tr>
                        <th>Title</th><th>Severity</th><th>Status</th><th>Owner</th><th style="width:90px">Actions</th>
                      </tr>
                    </ng-template>
                    <ng-template pTemplate="body" let-iss>
                      <tr>
                        <td>{{ iss.title }}</td>
                        <td><p-tag [value]="iss.severity" [severity]="prioritySeverity(iss.severity)" /></td>
                        <td><p-tag [value]="iss.status" [severity]="issueStatusSeverity(iss.status)" /></td>
                        <td>{{ iss.ownerName || '-' }}</td>
                        <td>
                          <div class="flex gap-1">
                            <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small" (onClick)="openIssueDialog(iss)" />
                            <p-button icon="pi pi-trash" [text]="true" [rounded]="true" size="small" severity="danger" (onClick)="deleteIssue(iss.id)" />
                          </div>
                        </td>
                      </tr>
                    </ng-template>
                    <ng-template pTemplate="emptymessage">
                      <tr><td colspan="5" class="text-center text-gray-400 py-4">No issues</td></tr>
                    </ng-template>
                  </p-table>
                </div>
              </div>
            </p-tabpanel>

            <!-- Tab 7: Health -->
            <p-tabpanel [value]="7">
              <div class="mt-4">
                @if (!health()) {
                  <div class="text-center py-8">
                    <p class="text-gray-500 mb-4">Loading health data...</p>
                    <p-button label="Refresh" icon="pi pi-refresh" (onClick)="loadHealth()" />
                  </div>
                } @else {
                  <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <!-- Schedule -->
                    <div class="rounded-lg p-4 border" [ngClass]="ragClass(health()!.schedule.rag)">
                      <div class="text-xs font-medium mb-1">Schedule</div>
                      <div class="text-2xl font-bold mb-2">{{ health()!.schedule.rag }}</div>
                      <div class="text-sm">{{ health()!.schedule.completed }} / {{ health()!.schedule.total }} milestones</div>
                      <div class="text-sm">{{ health()!.schedule.overdue }} overdue</div>
                    </div>
                    <!-- Budget -->
                    <div class="rounded-lg p-4 border" [ngClass]="ragClass(health()!.budget.rag)">
                      <div class="text-xs font-medium mb-1">Budget</div>
                      <div class="text-2xl font-bold mb-2">{{ health()!.budget.rag }}</div>
                      <div class="text-sm">Utilization: {{ health()!.budget.utilization }}%</div>
                      <div class="text-sm">{{ formatRupees(health()!.budget.totalActual) }} / {{ formatRupees(health()!.budget.totalEstimated) }}</div>
                    </div>
                    <!-- Scope -->
                    <div class="rounded-lg p-4 border" [ngClass]="ragClass(health()!.scope.rag)">
                      <div class="text-xs font-medium mb-1">Scope</div>
                      <div class="text-2xl font-bold mb-2">{{ health()!.scope.rag }}</div>
                      <div class="text-sm">{{ health()!.scope.completion }}% complete</div>
                      <div class="text-sm">{{ health()!.scope.blocked }} blocked</div>
                    </div>
                    <!-- Overall -->
                    <div class="rounded-lg p-4 border" [ngClass]="ragClass(health()!.overall)">
                      <div class="text-xs font-medium mb-1">Overall</div>
                      <div class="text-3xl font-bold">{{ health()!.overall }}</div>
                    </div>
                  </div>
                }
              </div>
            </p-tabpanel>
          </p-tabpanels>
        </p-tabs>
      }

      <!-- ===== Dialogs ===== -->

      <!-- Milestone Dialog -->
      <p-dialog [header]="milestoneEditId ? 'Edit Milestone' : 'Add Milestone'" [(visible)]="milestoneDialogVisible" [modal]="true" [style]="{width:'600px'}">
        <form [formGroup]="milestoneForm" class="flex flex-col gap-4 pt-2">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Name *</label>
            <input pInputText formControlName="name" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Description</label>
            <textarea pTextarea formControlName="description" [rows]="2" class="w-full"></textarea>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Deliverable</label>
            <input pInputText formControlName="deliverable" class="w-full" />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Planned Date *</label>
              <p-datepicker appendTo="body" formControlName="plannedDate" dateFormat="yy-mm-dd" class="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Actual Date</label>
              <p-datepicker appendTo="body" formControlName="actualDate" dateFormat="yy-mm-dd" class="w-full" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">% of Contract</label>
              <p-inputNumber formControlName="percentOfContract" [min]="0" [max]="100" suffix="%" class="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Invoice Amount (₹)</label>
              <p-inputNumber formControlName="invoiceAmountRupees" mode="currency" currency="INR" locale="en-IN" class="w-full" />
            </div>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Status</label>
            <p-select appendTo="body" formControlName="status" [options]="milestoneStatuses" optionLabel="label" optionValue="value" class="w-full" />
          </div>
        </form>
        <ng-template pTemplate="footer">
          <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="milestoneDialogVisible=false" />
          <p-button [label]="milestoneEditId ? 'Update' : 'Add'" icon="pi pi-check" [disabled]="milestoneForm.invalid" (onClick)="saveMilestone()" />
        </ng-template>
      </p-dialog>

      <!-- Task Dialog -->
      <p-dialog [header]="taskEditId ? 'Edit Task' : 'Add Task'" [(visible)]="taskDialogVisible" [modal]="true" [style]="{width:'600px'}">
        <form [formGroup]="taskForm" class="flex flex-col gap-4 pt-2">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Title *</label>
            <input pInputText formControlName="title" class="w-full" />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Priority</label>
              <p-select appendTo="body" formControlName="priority" [options]="taskPriorities" optionLabel="label" optionValue="value" class="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Status</label>
              <p-select appendTo="body" formControlName="status" [options]="taskStatuses" optionLabel="label" optionValue="value" class="w-full" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Owner</label>
              <p-select appendTo="body" formControlName="ownerUserId" [options]="userOptions()" optionLabel="name" optionValue="id" [filter]="true" [showClear]="true" placeholder="Select owner" class="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Milestone</label>
              <p-select appendTo="body" formControlName="milestoneId" [options]="milestoneRefOptions()" optionLabel="name" optionValue="id" [showClear]="true" placeholder="Select milestone" class="w-full" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Estimate Hours</label>
              <p-inputNumber formControlName="estimateHours" [min]="0" class="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Actual Hours</label>
              <p-inputNumber formControlName="actualHours" [min]="0" class="w-full" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Start Date</label>
              <p-datepicker appendTo="body" formControlName="startDate" dateFormat="yy-mm-dd" class="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">End Date</label>
              <p-datepicker appendTo="body" formControlName="endDate" dateFormat="yy-mm-dd" class="w-full" />
            </div>
          </div>
        </form>
        <ng-template pTemplate="footer">
          <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="taskDialogVisible=false" />
          <p-button [label]="taskEditId ? 'Update' : 'Add'" icon="pi pi-check" [disabled]="taskForm.invalid" (onClick)="saveTask()" />
        </ng-template>
      </p-dialog>

      <!-- Budget Line Dialog -->
      <p-dialog [header]="budgetLineEditId ? 'Edit Budget Line' : 'Add Budget Line'" [(visible)]="budgetLineDialogVisible" [modal]="true" [style]="{width:'500px'}">
        <form [formGroup]="budgetLineForm" class="flex flex-col gap-4 pt-2">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Category *</label>
            <p-select appendTo="body" formControlName="category" [options]="budgetCategories" optionLabel="label" optionValue="value" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Description</label>
            <input pInputText formControlName="description" class="w-full" />
          </div>
          <div class="grid grid-cols-3 gap-4">
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Estimated (₹) *</label>
              <p-inputNumber formControlName="estimatedRupees" mode="currency" currency="INR" locale="en-IN" class="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Committed (₹)</label>
              <p-inputNumber formControlName="committedRupees" mode="currency" currency="INR" locale="en-IN" class="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Actual (₹)</label>
              <p-inputNumber formControlName="actualRupees" mode="currency" currency="INR" locale="en-IN" class="w-full" />
            </div>
          </div>
        </form>
        <ng-template pTemplate="footer">
          <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="budgetLineDialogVisible=false" />
          <p-button [label]="budgetLineEditId ? 'Update' : 'Add'" icon="pi pi-check" [disabled]="budgetLineForm.invalid" (onClick)="saveBudgetLine()" />
        </ng-template>
      </p-dialog>

      <!-- Inflow Dialog -->
      <p-dialog [header]="inflowEditId ? 'Edit Inflow' : 'Add Inflow'" [(visible)]="inflowDialogVisible" [modal]="true" [style]="{width:'500px'}">
        <form [formGroup]="inflowForm" class="flex flex-col gap-4 pt-2">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Description *</label>
            <input pInputText formControlName="description" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Milestone</label>
            <p-select appendTo="body" formControlName="milestoneId" [options]="milestoneRefOptions()" optionLabel="name" optionValue="id" [showClear]="true" placeholder="Select milestone" class="w-full" />
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

      <!-- PBG Dialog -->
      <p-dialog [header]="pbgEditId ? 'Edit PBG / Retention' : 'Add PBG / Retention'" [(visible)]="pbgDialogVisible" [modal]="true" [style]="{width:'600px'}">
        <form [formGroup]="pbgForm" class="flex flex-col gap-4 pt-2">
          <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Type *</label>
              <p-select appendTo="body" formControlName="type" [options]="pbgTypes" optionLabel="label" optionValue="value" class="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Status</label>
              <p-select appendTo="body" formControlName="status" [options]="pbgStatuses" optionLabel="label" optionValue="value" class="w-full" />
            </div>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Description *</label>
            <input pInputText formControlName="description" class="w-full" />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Amount (₹) *</label>
              <p-inputNumber formControlName="amountRupees" mode="currency" currency="INR" locale="en-IN" class="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Bank Name</label>
              <input pInputText formControlName="bankName" class="w-full" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">BG Number</label>
              <input pInputText formControlName="bgNumber" class="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Release Date</label>
              <p-datepicker appendTo="body" formControlName="releaseDate" dateFormat="yy-mm-dd" class="w-full" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Issued Date</label>
              <p-datepicker appendTo="body" formControlName="issuedDate" dateFormat="yy-mm-dd" class="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Expiry Date</label>
              <p-datepicker appendTo="body" formControlName="expiryDate" dateFormat="yy-mm-dd" class="w-full" />
            </div>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Notes</label>
            <textarea pTextarea formControlName="notes" [rows]="2" class="w-full"></textarea>
          </div>
        </form>
        <ng-template pTemplate="footer">
          <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="pbgDialogVisible=false" />
          <p-button [label]="pbgEditId ? 'Update' : 'Add'" icon="pi pi-check" [disabled]="pbgForm.invalid" (onClick)="savePbg()" />
        </ng-template>
      </p-dialog>

      <!-- Risk Dialog -->
      <p-dialog [header]="riskEditId ? 'Edit Risk' : 'Add Risk'" [(visible)]="riskDialogVisible" [modal]="true" [style]="{width:'500px'}">
        <form [formGroup]="riskForm" class="flex flex-col gap-4 pt-2">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Title *</label>
            <input pInputText formControlName="title" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Description</label>
            <textarea pTextarea formControlName="description" [rows]="2" class="w-full"></textarea>
          </div>
          <div class="grid grid-cols-3 gap-4">
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Probability *</label>
              <p-select appendTo="body" formControlName="probability" [options]="probabilityOptions" optionLabel="label" optionValue="value" class="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Impact *</label>
              <p-select appendTo="body" formControlName="impact" [options]="impactOptions" optionLabel="label" optionValue="value" class="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Status</label>
              <p-select appendTo="body" formControlName="status" [options]="riskStatuses" optionLabel="label" optionValue="value" class="w-full" />
            </div>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Mitigation</label>
            <textarea pTextarea formControlName="mitigation" [rows]="2" class="w-full"></textarea>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Owner</label>
            <p-select appendTo="body" formControlName="ownerUserId" [options]="userOptions()" optionLabel="name" optionValue="id" [filter]="true" [showClear]="true" placeholder="Select owner" class="w-full" />
          </div>
        </form>
        <ng-template pTemplate="footer">
          <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="riskDialogVisible=false" />
          <p-button [label]="riskEditId ? 'Update' : 'Add'" icon="pi pi-check" [disabled]="riskForm.invalid" (onClick)="saveRisk()" />
        </ng-template>
      </p-dialog>

      <!-- Issue Dialog -->
      <p-dialog [header]="issueEditId ? 'Edit Issue' : 'Add Issue'" [(visible)]="issueDialogVisible" [modal]="true" [style]="{width:'500px'}">
        <form [formGroup]="issueForm" class="flex flex-col gap-4 pt-2">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Title *</label>
            <input pInputText formControlName="title" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Description</label>
            <textarea pTextarea formControlName="description" [rows]="2" class="w-full"></textarea>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Severity *</label>
              <p-select appendTo="body" formControlName="severity" [options]="issueSeverities" optionLabel="label" optionValue="value" class="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Status</label>
              <p-select appendTo="body" formControlName="status" [options]="issueStatuses" optionLabel="label" optionValue="value" class="w-full" />
            </div>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Resolution</label>
            <textarea pTextarea formControlName="resolution" [rows]="2" class="w-full"></textarea>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Owner</label>
            <p-select appendTo="body" formControlName="ownerUserId" [options]="userOptions()" optionLabel="name" optionValue="id" [filter]="true" [showClear]="true" placeholder="Select owner" class="w-full" />
          </div>
        </form>
        <ng-template pTemplate="footer">
          <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="issueDialogVisible=false" />
          <p-button [label]="issueEditId ? 'Update' : 'Add'" icon="pi pi-check" [disabled]="issueForm.invalid" (onClick)="saveIssue()" />
        </ng-template>
      </p-dialog>
    }
  `,
})
export class ProjectDetailComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly msg = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  project = signal<Project | null>(null);
  loading = signal(true);
  saving = false;
  serverError = '';
  isNew = false;

  // Options
  buOptions = signal<Ref[]>([]);
  userOptions = signal<Ref[]>([]);
  categoryOptions = signal<LookupItem[]>([]);

  // Tab data
  milestones = signal<MilestoneRow[]>([]);
  tasks = signal<TaskRow[]>([]);
  budget = signal<BudgetData | null>(null);
  inflowItems = signal<InflowItem[]>([]);
  cashFlowRows = signal<CashFlowRow[]>([]);
  pbgRows = signal<PbgRow[]>([]);
  risks = signal<RiskRow[]>([]);
  issues = signal<IssueRow[]>([]);
  health = signal<HealthData | null>(null);

  // Task view toggle
  taskView: 'table' | 'kanban' = 'table';

  // Dropdown option constants
  milestoneStatuses = MILESTONE_STATUSES;
  taskPriorities = TASK_PRIORITIES;
  taskStatuses = TASK_STATUSES;
  budgetCategories = BUDGET_CATEGORIES;
  inflowStatuses = INFLOW_STATUSES;
  pbgTypes = PBG_TYPES;
  pbgStatuses = PBG_STATUSES;
  probabilityOptions = PROBABILITY_OPTIONS;
  impactOptions = IMPACT_OPTIONS;
  riskStatuses = RISK_STATUSES;
  issueSeverities = ISSUE_SEVERITIES;
  issueStatuses = ISSUE_STATUSES;

  // Dialog visibility & edit IDs
  milestoneDialogVisible = false;
  milestoneEditId: string | null = null;
  taskDialogVisible = false;
  taskEditId: string | null = null;
  budgetLineDialogVisible = false;
  budgetLineEditId: string | null = null;
  inflowDialogVisible = false;
  inflowEditId: string | null = null;
  cashFlowDialogVisible = false;
  cashFlowEditId: string | null = null;
  pbgDialogVisible = false;
  pbgEditId: string | null = null;
  riskDialogVisible = false;
  riskEditId: string | null = null;
  issueDialogVisible = false;
  issueEditId: string | null = null;

  // Main form
  form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    projectCode: [''],
    clientName: ['', [Validators.required, Validators.maxLength(255)]],
    workOrderRef: [''],
    contractValueRupees: [null as number | null, Validators.required],
    description: [''],
    businessUnitId: ['', Validators.required],
    projectManagerId: ['', Validators.required],
    sponsorUserId: [''],
    startDate: [null as Date | null, Validators.required],
    endDate: [null as Date | null, Validators.required],
    location: [''],
    category: [''],
  });

  // Sub-entity forms
  milestoneForm = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    description: [''],
    deliverable: [''],
    plannedDate: [null as Date | null, Validators.required],
    actualDate: [null as Date | null],
    percentOfContract: [null as number | null],
    invoiceAmountRupees: [null as number | null],
    status: ['NOT_STARTED', Validators.required],
  });

  taskForm = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(255)]],
    priority: ['MEDIUM', Validators.required],
    status: ['TODO', Validators.required],
    ownerUserId: [''],
    milestoneId: [''],
    estimateHours: [null as number | null],
    actualHours: [null as number | null],
    startDate: [null as Date | null],
    endDate: [null as Date | null],
  });

  budgetLineForm = this.fb.group({
    category: ['', Validators.required],
    description: [''],
    estimatedRupees: [null as number | null, [Validators.required, Validators.min(0)]],
    committedRupees: [null as number | null],
    actualRupees: [null as number | null],
  });

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

  pbgForm = this.fb.group({
    type: ['PBG', Validators.required],
    description: ['', [Validators.required, Validators.maxLength(255)]],
    amountRupees: [null as number | null, [Validators.required, Validators.min(0)]],
    bankName: [''],
    bgNumber: [''],
    issuedDate: [null as Date | null],
    expiryDate: [null as Date | null],
    status: ['ACTIVE', Validators.required],
    releaseDate: [null as Date | null],
    notes: [''],
  });

  riskForm = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(255)]],
    description: [''],
    probability: ['MEDIUM', Validators.required],
    impact: ['MEDIUM', Validators.required],
    mitigation: [''],
    status: ['OPEN', Validators.required],
    ownerUserId: [''],
  });

  issueForm = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(255)]],
    description: [''],
    severity: ['MEDIUM', Validators.required],
    status: ['OPEN', Validators.required],
    resolution: [''],
    ownerUserId: [''],
  });

  // Computed helpers
  milestoneRefOptions = signal<Ref[]>([]);

  taskSummaryEntries(): [string, number][] {
    const p = this.project();
    if (!p || !p.taskSummary) return [];
    return Object.entries(p.taskSummary);
  }

  budgetUtilization(): number {
    const b = this.budget();
    if (!b || b.totals.estimated === 0) return 0;
    return Math.round((b.totals.actual / b.totals.estimated) * 100);
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.isNew = !id;
    this.loadOptions();
    if (id) {
      this.loadProject(id);
    } else {
      this.loading.set(false);
    }
  }

  private loadProject(id: string): void {
    this.loading.set(true);
    this.http.get<{ data: Project }>(`${environment.apiBaseUrl}/projects/${id}`).subscribe({
      next: (r) => {
        this.project.set(r.data);
        this.patchForm(r.data);
        this.loading.set(false);
        this.loadAllTabData(id);
      },
      error: () => { this.project.set(null); this.loading.set(false); },
    });
  }

  private patchForm(p: Project): void {
    this.form.patchValue({
      name: p.name,
      projectCode: p.projectCode ?? '',
      clientName: p.clientName,
      workOrderRef: p.workOrderRef ?? '',
      contractValueRupees: p.contractValuePaise ? p.contractValuePaise / 100 : null,
      description: p.description ?? '',
      businessUnitId: p.businessUnitId,
      projectManagerId: p.projectManagerId,
      sponsorUserId: p.sponsorUserId ?? '',
      startDate: parseDate(p.startDate),
      endDate: parseDate(p.endDate),
      location: p.location ?? '',
      category: p.category ?? '',
    });
    this.form.markAsPristine();
  }

  private loadOptions(): void {
    this.http.get<{ data: Ref[] }>(`${environment.apiBaseUrl}/business-units?limit=200`).subscribe({ next: (r) => this.buOptions.set(r.data) });
    this.http.get<{ data: Array<{ id: string; fullName: string }> }>(`${environment.apiBaseUrl}/users?limit=200`).subscribe({
      next: (r) => this.userOptions.set(r.data.map((u) => ({ id: u.id, name: u.fullName }))),
    });
    this.http.get<{ data: LookupItem[] }>(`${environment.apiBaseUrl}/lookup-lists/by-code/project_category/items`).subscribe({
      next: (r) => this.categoryOptions.set(r.data.filter((i) => i.isActive !== false)),
      error: () => {},
    });
  }

  private loadAllTabData(id: string): void {
    this.loadMilestones(id);
    this.loadTasks(id);
    this.loadBudget(id);
    this.loadInflow(id);
    this.loadCashFlow(id);
    this.loadPbg(id);
    this.loadRisks(id);
    this.loadIssues(id);
    this.loadHealth();
  }

  // ===== Project Save =====

  onSave(): void {
    if (this.form.invalid) return;
    this.saving = true;
    this.serverError = '';
    const v = this.form.value;
    const body: Record<string, unknown> = {
      name: v.name,
      projectCode: v.projectCode || null,
      clientName: v.clientName,
      workOrderRef: v.workOrderRef || null,
      contractValuePaise: v.contractValueRupees != null ? Math.round(v.contractValueRupees * 100) : 0,
      description: v.description || null,
      businessUnitId: v.businessUnitId,
      projectManagerId: v.projectManagerId,
      sponsorUserId: v.sponsorUserId || null,
      startDate: v.startDate instanceof Date ? toLocalDate(v.startDate) : v.startDate,
      endDate: v.endDate instanceof Date ? toLocalDate(v.endDate) : v.endDate,
      location: v.location || null,
      category: v.category || null,
    };

    if (this.isNew) {
      this.http.post<{ data: Project }>(`${environment.apiBaseUrl}/projects`, body).subscribe({
        next: (r) => {
          this.saving = false;
          this.msg.add({ severity: 'success', summary: 'Created', detail: 'Project created' });
          this.router.navigate(['/projects', r.data.id]);
        },
        error: (err: HttpErrorResponse) => { this.saving = false; this.serverError = err.error?.error?.message ?? 'Error creating project'; },
      });
    } else {
      this.http.patch<{ data: Project }>(`${environment.apiBaseUrl}/projects/${this.project()!.id}`, body).subscribe({
        next: (r) => {
          this.saving = false;
          this.project.set(r.data);
          this.patchForm(r.data);
          this.msg.add({ severity: 'success', summary: 'Saved', detail: 'Project updated' });
        },
        error: (err: HttpErrorResponse) => { this.saving = false; this.serverError = err.error?.error?.message ?? 'Error saving project'; },
      });
    }
  }

  changeStatus(status: string): void {
    if (!this.project()) return;
    this.http.patch<{ data: Project }>(`${environment.apiBaseUrl}/projects/${this.project()!.id}`, { status }).subscribe({
      next: (r) => {
        this.project.set(r.data);
        this.patchForm(r.data);
        this.msg.add({ severity: 'success', summary: 'Status Updated', detail: `Project is now ${status}` });
      },
      error: (err: HttpErrorResponse) => this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed' }),
    });
  }

  // ===== Milestones =====

  private loadMilestones(id: string): void {
    this.http.get<{ data: MilestoneRow[] }>(`${environment.apiBaseUrl}/projects/${id}/milestones?limit=200`).subscribe({
      next: (r) => {
        this.milestones.set(r.data);
        this.milestoneRefOptions.set(r.data.map((m) => ({ id: m.id, name: m.name })));
      },
      error: () => {},
    });
  }

  openMilestoneDialog(m?: MilestoneRow): void {
    if (m) {
      this.milestoneEditId = m.id;
      this.milestoneForm.patchValue({
        name: m.name,
        description: m.description ?? '',
        deliverable: m.deliverable ?? '',
        plannedDate: parseDate(m.plannedDate),
        actualDate: m.actualDate ? parseDate(m.actualDate) : null,
        percentOfContract: m.percentOfContract,
        invoiceAmountRupees: m.invoiceAmountPaise != null ? m.invoiceAmountPaise / 100 : null,
        status: m.status,
      });
    } else {
      this.milestoneEditId = null;
      this.milestoneForm.reset({ status: 'NOT_STARTED' });
    }
    this.milestoneDialogVisible = true;
  }

  saveMilestone(): void {
    if (this.milestoneForm.invalid || !this.project()) return;
    const v = this.milestoneForm.value;
    const body: Record<string, unknown> = {
      name: v.name,
      description: v.description || null,
      deliverable: v.deliverable || null,
      plannedDate: v.plannedDate instanceof Date ? toLocalDate(v.plannedDate) : v.plannedDate,
      actualDate: v.actualDate instanceof Date ? toLocalDate(v.actualDate) : v.actualDate || null,
      percentOfContract: v.percentOfContract,
      invoiceAmountPaise: v.invoiceAmountRupees != null ? Math.round(v.invoiceAmountRupees * 100) : null,
      status: v.status,
    };
    const pid = this.project()!.id;
    const req$ = this.milestoneEditId
      ? this.http.patch(`${environment.apiBaseUrl}/projects/${pid}/milestones/${this.milestoneEditId}`, body)
      : this.http.post(`${environment.apiBaseUrl}/projects/${pid}/milestones`, body);

    req$.subscribe({
      next: () => {
        this.milestoneDialogVisible = false;
        this.loadMilestones(pid);
        this.msg.add({ severity: 'success', summary: 'Saved', detail: `Milestone ${this.milestoneEditId ? 'updated' : 'added'}` });
      },
      error: (err: HttpErrorResponse) => this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed' }),
    });
  }

  deleteMilestone(mid: string): void {
    this.confirm.confirm({
      message: 'Delete this milestone?',
      accept: () => {
        this.http.delete(`${environment.apiBaseUrl}/projects/${this.project()!.id}/milestones/${mid}`).subscribe({
          next: () => { this.loadMilestones(this.project()!.id); this.msg.add({ severity: 'success', summary: 'Deleted' }); },
        });
      },
    });
  }

  // ===== Tasks =====

  private loadTasks(id: string): void {
    this.http.get<{ data: TaskRow[] }>(`${environment.apiBaseUrl}/projects/${id}/tasks?limit=200`).subscribe({
      next: (r) => this.tasks.set(r.data),
      error: () => {},
    });
  }

  openTaskDialog(t?: TaskRow): void {
    if (t) {
      this.taskEditId = t.id;
      this.taskForm.patchValue({
        title: t.title,
        priority: t.priority,
        status: t.status,
        ownerUserId: '',
        milestoneId: '',
        estimateHours: t.estimateHours,
        actualHours: t.actualHours,
        startDate: t.startDate ? parseDate(t.startDate) : null,
        endDate: t.endDate ? parseDate(t.endDate) : null,
      });
    } else {
      this.taskEditId = null;
      this.taskForm.reset({ priority: 'MEDIUM', status: 'TODO' });
    }
    this.taskDialogVisible = true;
  }

  saveTask(): void {
    if (this.taskForm.invalid || !this.project()) return;
    const v = this.taskForm.value;
    const body: Record<string, unknown> = {
      title: v.title,
      priority: v.priority,
      status: v.status,
      ownerUserId: v.ownerUserId || null,
      milestoneId: v.milestoneId || null,
      estimateHours: v.estimateHours,
      actualHours: v.actualHours,
      startDate: v.startDate instanceof Date ? toLocalDate(v.startDate) : v.startDate || null,
      endDate: v.endDate instanceof Date ? toLocalDate(v.endDate) : v.endDate || null,
    };
    const pid = this.project()!.id;
    const req$ = this.taskEditId
      ? this.http.patch(`${environment.apiBaseUrl}/projects/${pid}/tasks/${this.taskEditId}`, body)
      : this.http.post(`${environment.apiBaseUrl}/projects/${pid}/tasks`, body);

    req$.subscribe({
      next: () => {
        this.taskDialogVisible = false;
        this.loadTasks(pid);
        this.msg.add({ severity: 'success', summary: 'Saved', detail: `Task ${this.taskEditId ? 'updated' : 'added'}` });
      },
      error: (err: HttpErrorResponse) => this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed' }),
    });
  }

  deleteTask(tid: string): void {
    this.confirm.confirm({
      message: 'Delete this task?',
      accept: () => {
        this.http.delete(`${environment.apiBaseUrl}/projects/${this.project()!.id}/tasks/${tid}`).subscribe({
          next: () => { this.loadTasks(this.project()!.id); this.msg.add({ severity: 'success', summary: 'Deleted' }); },
        });
      },
    });
  }

  // ===== Budget =====

  private loadBudget(id: string): void {
    this.http.get<{ data: BudgetData }>(`${environment.apiBaseUrl}/projects/${id}/budget`).subscribe({
      next: (r) => this.budget.set(r.data),
      error: () => this.budget.set(null),
    });
  }

  createBudget(): void {
    if (!this.project()) return;
    this.http.post<{ data: BudgetData }>(`${environment.apiBaseUrl}/projects/${this.project()!.id}/budget`, {}).subscribe({
      next: (r) => {
        this.budget.set(r.data);
        this.msg.add({ severity: 'success', summary: 'Budget Created' });
      },
      error: (err: HttpErrorResponse) => this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed' }),
    });
  }

  openBudgetLineDialog(line?: BudgetLineRow): void {
    if (line) {
      this.budgetLineEditId = line.id;
      this.budgetLineForm.patchValue({
        category: line.category,
        description: line.description ?? '',
        estimatedRupees: line.estimatedPaise / 100,
        committedRupees: line.committedPaise / 100,
        actualRupees: line.actualPaise / 100,
      });
    } else {
      this.budgetLineEditId = null;
      this.budgetLineForm.reset();
    }
    this.budgetLineDialogVisible = true;
  }

  saveBudgetLine(): void {
    if (this.budgetLineForm.invalid || !this.project() || !this.budget()) return;
    const v = this.budgetLineForm.value;
    const body: Record<string, unknown> = {
      category: v.category,
      description: v.description || null,
      estimatedPaise: v.estimatedRupees != null ? Math.round(v.estimatedRupees * 100) : 0,
      committedPaise: v.committedRupees != null ? Math.round(v.committedRupees * 100) : 0,
      actualPaise: v.actualRupees != null ? Math.round(v.actualRupees * 100) : 0,
    };
    const budgetId = this.budget()!.id;
    const pid = this.project()!.id;
    const req$ = this.budgetLineEditId
      ? this.http.patch(`${environment.apiBaseUrl}/projects/${pid}/budget/lines/${this.budgetLineEditId}`, body)
      : this.http.post(`${environment.apiBaseUrl}/projects/${pid}/budget/lines`, body);

    req$.subscribe({
      next: () => {
        this.budgetLineDialogVisible = false;
        this.loadBudget(pid);
        this.msg.add({ severity: 'success', summary: 'Saved', detail: `Budget line ${this.budgetLineEditId ? 'updated' : 'added'}` });
      },
      error: (err: HttpErrorResponse) => this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed' }),
    });
  }

  deleteBudgetLine(lid: string): void {
    this.confirm.confirm({
      message: 'Delete this budget line?',
      accept: () => {
        this.http.delete(`${environment.apiBaseUrl}/projects/${this.project()!.id}/budget/lines/${lid}`).subscribe({
          next: () => { this.loadBudget(this.project()!.id); this.msg.add({ severity: 'success', summary: 'Deleted' }); },
        });
      },
    });
  }

  // ===== Inflow Plan =====

  private loadInflow(id: string): void {
    this.http.get<{ data: InflowItem[] }>(`${environment.apiBaseUrl}/projects/${id}/inflow-plan?limit=200`).subscribe({
      next: (r) => this.inflowItems.set(r.data),
      error: () => {},
    });
  }

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
    if (this.inflowForm.invalid || !this.project()) return;
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
    const pid = this.project()!.id;
    const req$ = this.inflowEditId
      ? this.http.patch(`${environment.apiBaseUrl}/projects/${pid}/inflow-plan/${this.inflowEditId}`, body)
      : this.http.post(`${environment.apiBaseUrl}/projects/${pid}/inflow-plan`, body);

    req$.subscribe({
      next: () => {
        this.inflowDialogVisible = false;
        this.loadInflow(pid);
        this.msg.add({ severity: 'success', summary: 'Saved', detail: `Inflow ${this.inflowEditId ? 'updated' : 'added'}` });
      },
      error: (err: HttpErrorResponse) => this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed' }),
    });
  }

  deleteInflow(iid: string): void {
    this.confirm.confirm({
      message: 'Delete this inflow item?',
      accept: () => {
        this.http.delete(`${environment.apiBaseUrl}/projects/${this.project()!.id}/inflow-plan/${iid}`).subscribe({
          next: () => { this.loadInflow(this.project()!.id); this.msg.add({ severity: 'success', summary: 'Deleted' }); },
        });
      },
    });
  }

  // ===== Cash Flow Periods =====

  private loadCashFlow(id: string): void {
    this.http.get<{ data: CashFlowRow[] }>(`${environment.apiBaseUrl}/projects/${id}/cash-flow?limit=200`).subscribe({
      next: (r) => this.cashFlowRows.set(r.data),
      error: () => {},
    });
  }

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
    if (this.cashFlowForm.invalid || !this.project()) return;
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
    const pid = this.project()!.id;
    const req$ = this.cashFlowEditId
      ? this.http.patch(`${environment.apiBaseUrl}/projects/${pid}/cash-flow/${this.cashFlowEditId}`, body)
      : this.http.post(`${environment.apiBaseUrl}/projects/${pid}/cash-flow`, body);

    req$.subscribe({
      next: () => {
        this.cashFlowDialogVisible = false;
        this.loadCashFlow(pid);
        this.msg.add({ severity: 'success', summary: 'Saved', detail: `Cash flow period ${this.cashFlowEditId ? 'updated' : 'added'}` });
      },
      error: (err: HttpErrorResponse) => this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed' }),
    });
  }

  // ===== PBG & Retention =====

  private loadPbg(id: string): void {
    this.http.get<{ data: PbgRow[] }>(`${environment.apiBaseUrl}/projects/${id}/pbg-records?limit=200`).subscribe({
      next: (r) => this.pbgRows.set(r.data),
      error: () => {},
    });
  }

  openPbgDialog(p?: PbgRow): void {
    if (p) {
      this.pbgEditId = p.id;
      this.pbgForm.patchValue({
        type: p.type,
        description: p.description,
        amountRupees: p.amountPaise / 100,
        bankName: p.bankName ?? '',
        bgNumber: p.bgNumber ?? '',
        issuedDate: p.issuedDate ? parseDate(p.issuedDate) : null,
        expiryDate: p.expiryDate ? parseDate(p.expiryDate) : null,
        status: p.status,
        releaseDate: p.releaseDate ? parseDate(p.releaseDate) : null,
        notes: p.notes ?? '',
      });
    } else {
      this.pbgEditId = null;
      this.pbgForm.reset({ type: 'PBG', status: 'ACTIVE' });
    }
    this.pbgDialogVisible = true;
  }

  savePbg(): void {
    if (this.pbgForm.invalid || !this.project()) return;
    const v = this.pbgForm.value;
    const body: Record<string, unknown> = {
      type: v.type,
      description: v.description,
      amountPaise: v.amountRupees != null ? Math.round(v.amountRupees * 100) : 0,
      bankName: v.bankName || null,
      bgNumber: v.bgNumber || null,
      issuedDate: v.issuedDate instanceof Date ? toLocalDate(v.issuedDate) : v.issuedDate || null,
      expiryDate: v.expiryDate instanceof Date ? toLocalDate(v.expiryDate) : v.expiryDate || null,
      status: v.status,
      releaseDate: v.releaseDate instanceof Date ? toLocalDate(v.releaseDate) : v.releaseDate || null,
      notes: v.notes || null,
    };
    const pid = this.project()!.id;
    const req$ = this.pbgEditId
      ? this.http.patch(`${environment.apiBaseUrl}/projects/${pid}/pbg-records/${this.pbgEditId}`, body)
      : this.http.post(`${environment.apiBaseUrl}/projects/${pid}/pbg-records`, body);

    req$.subscribe({
      next: () => {
        this.pbgDialogVisible = false;
        this.loadPbg(pid);
        this.msg.add({ severity: 'success', summary: 'Saved', detail: `PBG record ${this.pbgEditId ? 'updated' : 'added'}` });
      },
      error: (err: HttpErrorResponse) => this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed' }),
    });
  }

  deletePbg(pid: string): void {
    this.confirm.confirm({
      message: 'Delete this PBG / retention record?',
      accept: () => {
        this.http.delete(`${environment.apiBaseUrl}/projects/${this.project()!.id}/pbg-records/${pid}`).subscribe({
          next: () => { this.loadPbg(this.project()!.id); this.msg.add({ severity: 'success', summary: 'Deleted' }); },
        });
      },
    });
  }

  // ===== Risks =====

  private loadRisks(id: string): void {
    this.http.get<{ data: RiskRow[] }>(`${environment.apiBaseUrl}/projects/${id}/risks?limit=200`).subscribe({
      next: (r) => this.risks.set(r.data),
      error: () => {},
    });
  }

  openRiskDialog(r?: RiskRow): void {
    if (r) {
      this.riskEditId = r.id;
      this.riskForm.patchValue({
        title: r.title,
        description: r.description ?? '',
        probability: r.probability,
        impact: r.impact,
        mitigation: r.mitigation ?? '',
        status: r.status,
        ownerUserId: '',
      });
    } else {
      this.riskEditId = null;
      this.riskForm.reset({ probability: 'MEDIUM', impact: 'MEDIUM', status: 'OPEN' });
    }
    this.riskDialogVisible = true;
  }

  saveRisk(): void {
    if (this.riskForm.invalid || !this.project()) return;
    const v = this.riskForm.value;
    const body: Record<string, unknown> = {
      title: v.title,
      description: v.description || null,
      probability: v.probability,
      impact: v.impact,
      mitigation: v.mitigation || null,
      status: v.status,
      ownerUserId: v.ownerUserId || null,
    };
    const pid = this.project()!.id;
    const req$ = this.riskEditId
      ? this.http.patch(`${environment.apiBaseUrl}/projects/${pid}/risks/${this.riskEditId}`, body)
      : this.http.post(`${environment.apiBaseUrl}/projects/${pid}/risks`, body);

    req$.subscribe({
      next: () => {
        this.riskDialogVisible = false;
        this.loadRisks(pid);
        this.msg.add({ severity: 'success', summary: 'Saved', detail: `Risk ${this.riskEditId ? 'updated' : 'added'}` });
      },
      error: (err: HttpErrorResponse) => this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed' }),
    });
  }

  deleteRisk(rid: string): void {
    this.confirm.confirm({
      message: 'Delete this risk?',
      accept: () => {
        this.http.delete(`${environment.apiBaseUrl}/projects/${this.project()!.id}/risks/${rid}`).subscribe({
          next: () => { this.loadRisks(this.project()!.id); this.msg.add({ severity: 'success', summary: 'Deleted' }); },
        });
      },
    });
  }

  // ===== Issues =====

  private loadIssues(id: string): void {
    this.http.get<{ data: IssueRow[] }>(`${environment.apiBaseUrl}/projects/${id}/issues?limit=200`).subscribe({
      next: (r) => this.issues.set(r.data),
      error: () => {},
    });
  }

  openIssueDialog(iss?: IssueRow): void {
    if (iss) {
      this.issueEditId = iss.id;
      this.issueForm.patchValue({
        title: iss.title,
        description: iss.description ?? '',
        severity: iss.severity,
        status: iss.status,
        resolution: iss.resolution ?? '',
        ownerUserId: '',
      });
    } else {
      this.issueEditId = null;
      this.issueForm.reset({ severity: 'MEDIUM', status: 'OPEN' });
    }
    this.issueDialogVisible = true;
  }

  saveIssue(): void {
    if (this.issueForm.invalid || !this.project()) return;
    const v = this.issueForm.value;
    const body: Record<string, unknown> = {
      title: v.title,
      description: v.description || null,
      severity: v.severity,
      status: v.status,
      resolution: v.resolution || null,
      ownerUserId: v.ownerUserId || null,
    };
    const pid = this.project()!.id;
    const req$ = this.issueEditId
      ? this.http.patch(`${environment.apiBaseUrl}/projects/${pid}/issues/${this.issueEditId}`, body)
      : this.http.post(`${environment.apiBaseUrl}/projects/${pid}/issues`, body);

    req$.subscribe({
      next: () => {
        this.issueDialogVisible = false;
        this.loadIssues(pid);
        this.msg.add({ severity: 'success', summary: 'Saved', detail: `Issue ${this.issueEditId ? 'updated' : 'added'}` });
      },
      error: (err: HttpErrorResponse) => this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed' }),
    });
  }

  deleteIssue(iid: string): void {
    this.confirm.confirm({
      message: 'Delete this issue?',
      accept: () => {
        this.http.delete(`${environment.apiBaseUrl}/projects/${this.project()!.id}/issues/${iid}`).subscribe({
          next: () => { this.loadIssues(this.project()!.id); this.msg.add({ severity: 'success', summary: 'Deleted' }); },
        });
      },
    });
  }

  // ===== Health =====

  loadHealth(): void {
    if (!this.project()) return;
    this.http.get<{ data: HealthData }>(`${environment.apiBaseUrl}/projects/${this.project()!.id}/health`).subscribe({
      next: (r) => this.health.set(r.data),
      error: () => this.health.set(null),
    });
  }

  // ===== Helpers =====

  goBack(): void { this.router.navigate(['/projects']); }

  formatRupees(paise: number): string {
    return '\u20B9' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  statusSeverity(s: string): 'secondary' | 'success' | 'warn' | 'info' {
    switch (s) {
      case 'DRAFT': return 'secondary';
      case 'ACTIVE': return 'success';
      case 'ON_HOLD': return 'warn';
      case 'CLOSED': return 'info';
      default: return 'secondary';
    }
  }

  milestoneSeverity(s: string): 'secondary' | 'info' | 'success' {
    switch (s) {
      case 'NOT_STARTED': return 'secondary';
      case 'IN_PROGRESS': return 'info';
      case 'COMPLETED': return 'success';
      case 'INVOICED': return 'success';
      default: return 'secondary';
    }
  }

  prioritySeverity(s: string): 'secondary' | 'info' | 'warn' | 'danger' {
    switch (s) {
      case 'LOW': return 'secondary';
      case 'MEDIUM': return 'info';
      case 'HIGH': return 'warn';
      case 'CRITICAL': return 'danger';
      default: return 'secondary';
    }
  }

  taskStatusSeverity(s: string): 'secondary' | 'info' | 'success' | 'warn' | 'danger' {
    switch (s) {
      case 'TODO': return 'secondary';
      case 'IN_PROGRESS': return 'info';
      case 'IN_REVIEW': return 'warn';
      case 'DONE': return 'success';
      case 'BLOCKED': return 'danger';
      default: return 'secondary';
    }
  }

  inflowStatusSeverity(s: string): 'secondary' | 'info' | 'success' {
    switch (s) {
      case 'PLANNED': return 'secondary';
      case 'INVOICED': return 'info';
      case 'RECEIVED': return 'success';
      default: return 'secondary';
    }
  }

  pbgStatusSeverity(s: string): 'success' | 'info' | 'warn' | 'danger' {
    switch (s) {
      case 'ACTIVE': return 'success';
      case 'RELEASED': return 'info';
      case 'EXPIRED': return 'warn';
      case 'INVOKED': return 'danger';
      default: return 'info';
    }
  }

  riskStatusSeverity(s: string): 'danger' | 'success' | 'secondary' {
    switch (s) {
      case 'OPEN': return 'danger';
      case 'MITIGATED': return 'success';
      case 'CLOSED': return 'secondary';
      default: return 'secondary';
    }
  }

  issueStatusSeverity(s: string): 'danger' | 'info' | 'success' | 'secondary' {
    switch (s) {
      case 'OPEN': return 'danger';
      case 'IN_PROGRESS': return 'info';
      case 'RESOLVED': return 'success';
      case 'CLOSED': return 'secondary';
      default: return 'secondary';
    }
  }

  ragClass(rag: string): string {
    switch (rag) {
      case 'GREEN': return 'bg-green-100 text-green-800 border-green-200';
      case 'AMBER': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'RED': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  }
}
