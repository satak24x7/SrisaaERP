import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ReactiveFormsModule, FormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
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

interface ProjectDocumentRow { id: string; name: string; fileName: string; mimeType: string; fileSize: number; sortOrder: number; createdAt: string; }

interface DeliverableRow { id: string; milestoneId: string; name: string; description: string | null; status: string; completedAt: string | null; sortOrder: number; }

interface MilestoneRow { id: string; name: string; description: string | null; plannedDate: string; originalPlannedDate: string | null; actualDate: string | null; percentOfContract: number | null; invoiceAmountPaise: number | null; status: string; sortOrder: number; deliverables: DeliverableRow[]; }

interface TaskRow { id: string; title: string; priority: string; kanbanColumn: string; ownerId: string | null; ownerName: string | null; milestoneId: string | null; milestoneName: string | null; estimateHours: number | null; actualHours: number | null; startDate: string | null; endDate: string | null; status: string; }

interface BudgetLineRow { id: string; category: string; description: string | null; estimatedPaise: number; committedPaise: number; actualPaise: number; }
interface BudgetData { id: string; totalEstimatedPaise: number; notes: string | null; lines: BudgetLineRow[]; totals: { totalEstimated: number; totalCommitted: number; totalActual: number; variance: number }; }

interface PbgRow { id: string; type: string; description: string; amountPaise: number; bankName: string | null; bgNumber: string | null; issuedDate: string | null; expiryDate: string | null; status: string; releaseDate: string | null; notes: string | null; }

interface RiskRow { id: string; title: string; description: string | null; probability: string; impact: string; mitigation: string | null; status: string; ownerId: string | null; ownerName: string | null; }
interface IssueRow { id: string; title: string; description: string | null; severity: string; resolution: string | null; status: string; ownerId: string | null; ownerName: string | null; }

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
  milestones: { total: number; byStatus: Record<string, number> };
  tasks: { total: number; byColumn: Record<string, number> };
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
  imports: [CommonModule, ReactiveFormsModule, FormsModule, DragDropModule, ButtonModule, InputTextModule, SelectModule, MultiSelectModule, InputNumberModule, TagModule, DialogModule, ToastModule, ConfirmDialogModule, TabsModule, TableModule, DatePickerModule, TextareaModule, ChartModule, ActivityPanelComponent, KanbanBoardComponent],
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
            <p-tab [value]="0">Health</p-tab>
            <p-tab [value]="1">Overview</p-tab>
            <p-tab [value]="2">Activities</p-tab>
            <p-tab [value]="3">Work Items</p-tab>
            <p-tab [value]="4">Milestones</p-tab>
            <p-tab [value]="5">Budget</p-tab>
            <p-tab [value]="6">Bank Guarantees</p-tab>
            <p-tab [value]="7">Risks &amp; Issues</p-tab>
            <p-tab [value]="8">Documents</p-tab>
          </p-tablist>
          <p-tabpanels>
            <!-- Tab 1: Overview -->
            <p-tabpanel [value]="1">
              <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 mt-4">
                <div class="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <div class="text-xs text-blue-600 font-medium">Contract Value</div>
                  <div class="text-xl font-bold text-blue-800">{{ formatRupees(project()!.contractValuePaise) }}</div>
                </div>
                <div class="bg-green-50 rounded-lg p-4 border border-green-200">
                  <div class="text-xs text-green-600 font-medium">Milestones</div>
                  <div class="text-xl font-bold text-green-800">{{ project()!.milestones.byStatus['COMPLETED'] || 0 }} / {{ project()!.milestones.total }}</div>
                </div>
                <div class="bg-purple-50 rounded-lg p-4 border border-purple-200">
                  <div class="text-xs text-purple-600 font-medium">Work Items</div>
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

            <!-- Tab 8: Documents -->
            <p-tabpanel [value]="8">
              <div class="mt-4">
                <div class="flex items-center justify-between mb-4">
                  <h3 class="text-lg font-semibold text-gray-700">Project Documents</h3>
                  <p-button label="Add Document" icon="pi pi-plus" size="small" (onClick)="openDocDialog()" />
                </div>
                @if (documents().length === 0) {
                  <div class="text-center py-8 text-gray-400">
                    <i class="pi pi-inbox text-4xl mb-2"></i>
                    <p>No documents uploaded yet</p>
                  </div>
                } @else {
                  <div cdkDropListGroup class="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-12 gap-2"
                       cdkDropList [cdkDropListData]="documents()" (cdkDropListDropped)="onDocDrop($event)"
                       cdkDropListOrientation="mixed">
                    @for (doc of documents(); track doc.id) {
                      <div cdkDrag class="bg-gray-50 rounded border border-gray-200 px-2 py-3 flex flex-col items-center text-center
                                  hover:shadow hover:border-gray-300 transition-shadow cursor-grab active:cursor-grabbing">
                        <i [class]="docTypeIcon(doc.mimeType) + ' text-xl mb-1'"
                           [style.color]="docTypeColor(doc.mimeType)"></i>
                        <h4 class="text-xs font-medium text-gray-800 line-clamp-2 w-full leading-tight">{{ doc.name }}</h4>
                        <p class="text-[10px] text-gray-400 mt-0.5">{{ formatSize(doc.fileSize) }}</p>
                        <div class="flex gap-0 mt-1.5" (click)="$event.stopPropagation()">
                          <p-button icon="pi pi-eye" severity="info" [text]="true" size="small"
                                    [style]="{'padding':'0.15rem'}" (onClick)="viewDocument(doc)" />
                          <p-button icon="pi pi-pencil" severity="warn" [text]="true" size="small"
                                    [style]="{'padding':'0.15rem'}" (onClick)="openDocDialog(doc)" />
                          <p-button icon="pi pi-trash" severity="danger" [text]="true" size="small"
                                    [style]="{'padding':'0.15rem'}" (onClick)="deleteDocument(doc)" />
                        </div>
                        <div *cdkDragPlaceholder class="bg-blue-100 border-2 border-dashed border-blue-300 rounded w-full h-full min-h-[80px]"></div>
                      </div>
                    }
                  </div>
                }
              </div>
            </p-tabpanel>

            <!-- Tab 4: Milestones -->
            <p-tabpanel [value]="4">
              <div class="flex justify-end mb-4 mt-4">
                <p-button label="Add Milestone" icon="pi pi-plus" size="small" (onClick)="openMilestoneDialog()" />
              </div>
              <p-table [value]="milestones()" styleClass="p-datatable-sm" [rows]="20">
                <ng-template pTemplate="header">
                  <tr>
                    <th style="width:40px"></th><th style="width:50px">#</th><th>Name</th><th>Deliverables</th><th>Original Date</th><th>Planned Date</th><th>Actual Date</th><th>% of Contract</th><th>Invoice Amount</th><th>Status</th><th style="width:100px">Actions</th>
                  </tr>
                </ng-template>
                <ng-template pTemplate="body" let-m let-i="rowIndex">
                  <tr>
                    <td>
                      <p-button [icon]="expandedMilestoneId === m.id ? 'pi pi-chevron-down' : 'pi pi-chevron-right'" [text]="true" [rounded]="true" size="small" (onClick)="toggleMilestoneExpand(m.id)" />
                    </td>
                    <td>{{ i + 1 }}</td>
                    <td>{{ m.name }}</td>
                    <td>
                      @if (m.deliverables && m.deliverables.length > 0) {
                        <span class="text-green-700 font-medium">{{ completedDeliverableCount(m.deliverables) }}</span><span class="text-gray-400">/{{ m.deliverables.length }}</span>
                      } @else {
                        <span class="text-gray-400">0</span>
                      }
                    </td>
                    <td>{{ m.originalPlannedDate ? (m.originalPlannedDate | date:'mediumDate') : '-' }}</td>
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
                  @if (expandedMilestoneId === m.id) {
                    <tr>
                      <td colspan="11" class="!p-0">
                        <div class="bg-gray-50 border-t border-b border-gray-200 p-4 ml-8">
                          <div class="flex items-center justify-between mb-3">
                            <h4 class="text-sm font-semibold text-gray-700">Deliverables</h4>
                            <p-button label="Add Deliverable" icon="pi pi-plus" size="small" [outlined]="true" (onClick)="openDeliverableDialog(m.id)" />
                          </div>
                          @if (!m.deliverables || m.deliverables.length === 0) {
                            <div class="text-center text-gray-400 py-4 text-sm">No deliverables yet</div>
                          } @else {
                            <table class="w-full text-sm">
                              <thead>
                                <tr class="text-left text-gray-500 border-b border-gray-200">
                                  <th class="py-2 px-2" style="width:40px"></th>
                                  <th class="py-2 px-2">Name</th>
                                  <th class="py-2 px-2" style="width:120px">Status</th>
                                  <th class="py-2 px-2" style="width:100px">Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                @for (d of m.deliverables; track d.id) {
                                  <tr class="border-b border-gray-100 hover:bg-gray-100">
                                    <td class="py-2 px-2">
                                      <p-button [icon]="d.status === 'COMPLETED' ? 'pi pi-check-circle' : 'pi pi-circle'" [text]="true" [rounded]="true" size="small" [severity]="d.status === 'COMPLETED' ? 'success' : 'secondary'" (onClick)="toggleDeliverableComplete(m.id, d.id)" />
                                    </td>
                                    <td class="py-2 px-2" [class.line-through]="d.status === 'COMPLETED'" [class.text-gray-400]="d.status === 'COMPLETED'">{{ d.name }}</td>
                                    <td class="py-2 px-2"><p-tag [value]="d.status" [severity]="d.status === 'COMPLETED' ? 'success' : 'secondary'" /></td>
                                    <td class="py-2 px-2">
                                      <div class="flex gap-1">
                                        <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small" (onClick)="openDeliverableDialog(m.id, d)" />
                                        <p-button icon="pi pi-trash" [text]="true" [rounded]="true" size="small" severity="danger" (onClick)="deleteDeliverable(m.id, d.id)" />
                                      </div>
                                    </td>
                                  </tr>
                                }
                              </tbody>
                            </table>
                          }
                        </div>
                      </td>
                    </tr>
                  }
                </ng-template>
                <ng-template pTemplate="emptymessage">
                  <tr><td colspan="11" class="text-center text-gray-400 py-4">No milestones yet</td></tr>
                </ng-template>
              </p-table>
            </p-tabpanel>

            <!-- Tab 3: Work Items -->
            <p-tabpanel [value]="3">
              <div class="flex items-center justify-between mb-4 mt-4">
                <div class="flex gap-2">
                  <p-button [label]="'Table'" [severity]="taskView === 'table' ? undefined : 'secondary'" [outlined]="taskView !== 'table'" size="small" icon="pi pi-list" (onClick)="taskView='table'" />
                  <p-button [label]="'Kanban'" [severity]="taskView === 'kanban' ? undefined : 'secondary'" [outlined]="taskView !== 'kanban'" size="small" icon="pi pi-th-large" (onClick)="taskView='kanban'" />
                </div>
                @if (taskView === 'table') {
                  <p-button label="Add Work Item" icon="pi pi-plus" size="small" (onClick)="openTaskDialog()" />
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
                    <tr><td colspan="10" class="text-center text-gray-400 py-4">No work items yet</td></tr>
                  </ng-template>
                </p-table>
              } @else {
                <app-kanban-board [projectId]="project()!.id" />
              }
            </p-tabpanel>

            <!-- Tab 5: Budget -->
            <p-tabpanel [value]="5">
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
                      <div class="text-lg font-bold text-blue-800">{{ formatRupees(budget()!.totals.totalEstimated) }}</div>
                    </div>
                    <div class="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                      <div class="text-xs text-yellow-600 font-medium">Committed</div>
                      <div class="text-lg font-bold text-yellow-800">{{ formatRupees(budget()!.totals.totalCommitted) }}</div>
                    </div>
                    <div class="bg-green-50 rounded-lg p-4 border border-green-200">
                      <div class="text-xs text-green-600 font-medium">Actual</div>
                      <div class="text-lg font-bold text-green-800">{{ formatRupees(budget()!.totals.totalActual) }}</div>
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

            <!-- Tab 6: Bank Guarantees -->
            <p-tabpanel [value]="6">
              <div class="flex justify-end mb-4 mt-4">
                <p-button label="Add Bank Guarantee" icon="pi pi-plus" size="small" (onClick)="openPbgDialog()" />
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
                  <tr><td colspan="9" class="text-center text-gray-400 py-4">No bank guarantee records yet</td></tr>
                </ng-template>
              </p-table>
            </p-tabpanel>

            <!-- Tab 7: Risks & Issues -->
            <p-tabpanel [value]="7">
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

            <!-- Tab 0: Health -->
            <p-tabpanel [value]="0">
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

            <!-- Tab 2: Activities -->
            <p-tabpanel [value]="2">
              <div class="mt-4">
                <app-activity-panel entityType="PROJECT" [entityId]="project()!.id" />
              </div>
            </p-tabpanel>
          </p-tabpanels>
        </p-tabs>
      }

      <!-- ===== Dialogs ===== -->

      <!-- Document Dialog -->
      <p-dialog [header]="docEditId ? 'Edit Document' : 'Add Document'" [(visible)]="docDialogVisible" [modal]="true" [style]="{width:'480px'}">
        <div class="flex flex-col gap-4 pt-2">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Document Name *</label>
            <input pInputText [(ngModel)]="docName" placeholder="e.g. Work Order" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">
              {{ docEditId ? 'Replace File (optional)' : 'Select File *' }}
            </label>
            <input type="file" (change)="onDocFileSelect($event)"
                   class="block w-full text-sm text-gray-500
                          file:mr-4 file:py-2 file:px-4 file:rounded file:border-0
                          file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700
                          hover:file:bg-blue-100" />
          </div>
        </div>
        <ng-template pTemplate="footer">
          <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="docDialogVisible=false" />
          <p-button [label]="docEditId ? 'Update' : 'Upload'" icon="pi pi-upload"
                    [disabled]="!docName.trim() || (!docEditId && !docFile)"
                    (onClick)="saveDocument()" />
        </ng-template>
      </p-dialog>

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

      <!-- Deliverable Dialog -->
      <p-dialog [header]="deliverableEditId ? 'Edit Deliverable' : 'Add Deliverable'" [(visible)]="deliverableDialogVisible" [modal]="true" [style]="{width:'500px'}">
        <form [formGroup]="deliverableForm" class="flex flex-col gap-4 pt-2">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Name *</label>
            <input pInputText formControlName="name" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Description</label>
            <textarea pTextarea formControlName="description" [rows]="2" class="w-full"></textarea>
          </div>
        </form>
        <ng-template pTemplate="footer">
          <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="deliverableDialogVisible=false" />
          <p-button [label]="deliverableEditId ? 'Update' : 'Add'" icon="pi pi-check" [disabled]="deliverableForm.invalid" (onClick)="saveDeliverable()" />
        </ng-template>
      </p-dialog>

      <!-- Task Dialog -->
      <p-dialog [header]="taskEditId ? 'Edit Work Item' : 'Add Work Item'" [(visible)]="taskDialogVisible" [modal]="true" [style]="{width:'600px'}">
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
              <label class="text-sm font-medium text-gray-700">Milestone *</label>
              <p-select appendTo="body" formControlName="milestoneId" [options]="milestoneRefOptions()" optionLabel="name" optionValue="id" placeholder="Select milestone" class="w-full" />
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

      <!-- PBG Dialog -->
      <p-dialog [header]="pbgEditId ? 'Edit Bank Guarantee' : 'Add Bank Guarantee'" [(visible)]="pbgDialogVisible" [modal]="true" [style]="{width:'600px'}">
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
  documents = signal<ProjectDocumentRow[]>([]);
  milestones = signal<MilestoneRow[]>([]);
  tasks = signal<TaskRow[]>([]);
  budget = signal<BudgetData | null>(null);
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
  pbgTypes = PBG_TYPES;
  pbgStatuses = PBG_STATUSES;
  probabilityOptions = PROBABILITY_OPTIONS;
  impactOptions = IMPACT_OPTIONS;
  riskStatuses = RISK_STATUSES;
  issueSeverities = ISSUE_SEVERITIES;
  issueStatuses = ISSUE_STATUSES;

  // Document dialog state
  docDialogVisible = false;
  docEditId: string | null = null;
  docName = '';
  docFile: File | null = null;

  // Dialog visibility & edit IDs
  milestoneDialogVisible = false;
  milestoneEditId: string | null = null;
  taskDialogVisible = false;
  taskEditId: string | null = null;
  budgetLineDialogVisible = false;
  budgetLineEditId: string | null = null;
  pbgDialogVisible = false;
  pbgEditId: string | null = null;
  riskDialogVisible = false;
  riskEditId: string | null = null;
  issueDialogVisible = false;
  issueEditId: string | null = null;

  // Deliverable state
  expandedMilestoneId: string | null = null;
  deliverableDialogVisible = false;
  deliverableEditId: string | null = null;
  deliverableEditMilestoneId: string | null = null;

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
    plannedDate: [null as Date | null, Validators.required],
    actualDate: [null as Date | null],
    percentOfContract: [null as number | null],
    invoiceAmountRupees: [null as number | null],
    status: ['NOT_STARTED', Validators.required],
  });

  deliverableForm = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    description: [''],
  });

  taskForm = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(255)]],
    priority: ['MEDIUM', Validators.required],
    status: ['TODO', Validators.required],
    ownerUserId: [''],
    milestoneId: ['', Validators.required],
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
    if (!p || !p.tasks || !p.tasks.byColumn) return [];
    return Object.entries(p.tasks.byColumn);
  }

  budgetUtilization(): number {
    const b = this.budget();
    if (!b || b.totals.totalEstimated === 0) return 0;
    return Math.round((b.totals.totalActual / b.totals.totalEstimated) * 100);
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
    this.loadDocuments(id);
    this.loadMilestones(id);
    this.loadTasks(id);
    this.loadBudget(id);
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

  // ===== Documents =====

  private loadDocuments(id: string): void {
    this.http.get<{ data: ProjectDocumentRow[] }>(`${environment.apiBaseUrl}/projects/${id}/documents`).subscribe({
      next: (r) => this.documents.set(r.data),
      error: () => {},
    });
  }

  openDocDialog(doc?: ProjectDocumentRow): void {
    if (doc) {
      this.docEditId = doc.id;
      this.docName = doc.name;
    } else {
      this.docEditId = null;
      this.docName = '';
    }
    this.docFile = null;
    this.docDialogVisible = true;
  }

  onDocFileSelect(event: Event): void {
    this.docFile = (event.target as HTMLInputElement).files?.[0] ?? null;
  }

  saveDocument(): void {
    if (!this.project()) return;
    const formData = new FormData();
    formData.append('name', this.docName.trim());
    if (this.docFile) formData.append('file', this.docFile);

    const pid = this.project()!.id;
    const url = `${environment.apiBaseUrl}/projects/${pid}/documents`;
    const req$ = this.docEditId
      ? this.http.patch(`${url}/${this.docEditId}`, formData)
      : this.http.post(url, formData);

    req$.subscribe({
      next: () => {
        this.docDialogVisible = false;
        this.loadDocuments(pid);
        this.msg.add({ severity: 'success', summary: 'Saved', detail: `Document ${this.docEditId ? 'updated' : 'uploaded'}` });
      },
      error: (err: HttpErrorResponse) => this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed' }),
    });
  }

  viewDocument(doc: ProjectDocumentRow): void {
    if (!this.project()) return;
    this.http.get(`${environment.apiBaseUrl}/projects/${this.project()!.id}/documents/${doc.id}/download`, { responseType: 'blob' }).subscribe({
      next: (blob) => window.open(URL.createObjectURL(blob), '_blank'),
      error: () => this.msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to open document' }),
    });
  }

  deleteDocument(doc: ProjectDocumentRow): void {
    this.confirm.confirm({
      message: `Delete "${doc.name}"?`,
      accept: () => {
        this.http.delete(`${environment.apiBaseUrl}/projects/${this.project()!.id}/documents/${doc.id}`).subscribe({
          next: () => { this.loadDocuments(this.project()!.id); this.msg.add({ severity: 'success', summary: 'Deleted' }); },
          error: (err: HttpErrorResponse) => this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed' }),
        });
      },
    });
  }

  onDocDrop(event: CdkDragDrop<ProjectDocumentRow[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const docs = [...this.documents()];
    moveItemInArray(docs, event.previousIndex, event.currentIndex);
    this.documents.set(docs);
    this.http.put(`${environment.apiBaseUrl}/projects/${this.project()!.id}/documents/reorder`, { ids: docs.map(d => d.id) }).subscribe({
      error: () => { this.msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to save order' }); this.loadDocuments(this.project()!.id); },
    });
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  docTypeIcon(mime: string): string {
    if (mime.startsWith('image/')) return 'pi pi-image';
    if (mime === 'application/pdf') return 'pi pi-file-pdf';
    if (mime.includes('word') || mime.includes('.document')) return 'pi pi-file-word';
    if (mime.includes('presentation') || mime.includes('powerpoint')) return 'pi pi-desktop';
    if (mime.includes('spreadsheet') || mime.includes('excel')) return 'pi pi-table';
    return 'pi pi-file';
  }

  docTypeColor(mime: string): string {
    if (mime.startsWith('image/')) return '#8B5CF6';
    if (mime === 'application/pdf') return '#EF4444';
    if (mime.includes('word') || mime.includes('.document')) return '#3B82F6';
    if (mime.includes('presentation') || mime.includes('powerpoint')) return '#F97316';
    if (mime.includes('spreadsheet') || mime.includes('excel')) return '#22C55E';
    return '#6B7280';
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

  toggleMilestoneExpand(mid: string): void {
    this.expandedMilestoneId = this.expandedMilestoneId === mid ? null : mid;
  }

  // ===== Deliverables =====

  openDeliverableDialog(milestoneId: string, d?: DeliverableRow): void {
    this.deliverableEditMilestoneId = milestoneId;
    if (d) {
      this.deliverableEditId = d.id;
      this.deliverableForm.patchValue({ name: d.name, description: d.description ?? '' });
    } else {
      this.deliverableEditId = null;
      this.deliverableForm.reset();
    }
    this.deliverableDialogVisible = true;
  }

  saveDeliverable(): void {
    if (this.deliverableForm.invalid || !this.project() || !this.deliverableEditMilestoneId) return;
    const v = this.deliverableForm.value;
    const body: Record<string, unknown> = {
      name: v.name,
      description: v.description || null,
    };
    const pid = this.project()!.id;
    const mid = this.deliverableEditMilestoneId;
    const req$ = this.deliverableEditId
      ? this.http.patch(`${environment.apiBaseUrl}/projects/${pid}/milestones/${mid}/deliverables/${this.deliverableEditId}`, body)
      : this.http.post(`${environment.apiBaseUrl}/projects/${pid}/milestones/${mid}/deliverables`, body);

    req$.subscribe({
      next: () => {
        this.deliverableDialogVisible = false;
        this.loadMilestones(pid);
        this.msg.add({ severity: 'success', summary: 'Saved', detail: `Deliverable ${this.deliverableEditId ? 'updated' : 'added'}` });
      },
      error: (err: HttpErrorResponse) => this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed' }),
    });
  }

  deleteDeliverable(milestoneId: string, did: string): void {
    this.confirm.confirm({
      message: 'Delete this deliverable?',
      accept: () => {
        const pid = this.project()!.id;
        this.http.delete(`${environment.apiBaseUrl}/projects/${pid}/milestones/${milestoneId}/deliverables/${did}`).subscribe({
          next: () => { this.loadMilestones(pid); this.msg.add({ severity: 'success', summary: 'Deleted' }); },
          error: (err: HttpErrorResponse) => this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed' }),
        });
      },
    });
  }

  toggleDeliverableComplete(milestoneId: string, did: string): void {
    if (!this.project()) return;
    const pid = this.project()!.id;
    this.http.post(`${environment.apiBaseUrl}/projects/${pid}/milestones/${milestoneId}/deliverables/${did}/complete`, {}).subscribe({
      next: () => {
        this.loadMilestones(pid);
        this.msg.add({ severity: 'success', summary: 'Updated', detail: 'Deliverable status toggled' });
      },
      error: (err: HttpErrorResponse) => this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed' }),
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
        status: t.kanbanColumn || t.status,
        ownerUserId: t.ownerId ?? '',
        milestoneId: t.milestoneId ?? '',
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
      kanbanColumn: v.status || 'BACKLOG',
      ownerId: v.ownerUserId || null,
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

  // ===== PBG & Retention =====

  private loadPbg(id: string): void {
    this.http.get<{ data: PbgRow[] }>(`${environment.apiBaseUrl}/projects/${id}/pbg?limit=200`).subscribe({
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
      ? this.http.patch(`${environment.apiBaseUrl}/projects/${pid}/pbg/${this.pbgEditId}`, body)
      : this.http.post(`${environment.apiBaseUrl}/projects/${pid}/pbg`, body);

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
        this.http.delete(`${environment.apiBaseUrl}/projects/${this.project()!.id}/pbg/${pid}`).subscribe({
          next: () => { this.loadPbg(this.project()!.id); this.msg.add({ severity: 'success', summary: 'Deleted' }); },
        });
      },
    });
  }

  // ===== Risks =====

  private loadRisks(id: string): void {
    this.http.get<{ data: RiskRow[] }>(`${environment.apiBaseUrl}/projects/${id}/risk-issues/risks?limit=200`).subscribe({
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
        ownerUserId: r.ownerId ?? '',
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
      ownerId: v.ownerUserId || null,
    };
    const pid = this.project()!.id;
    const req$ = this.riskEditId
      ? this.http.patch(`${environment.apiBaseUrl}/projects/${pid}/risk-issues/risks/${this.riskEditId}`, body)
      : this.http.post(`${environment.apiBaseUrl}/projects/${pid}/risk-issues/risks`, body);

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
        this.http.delete(`${environment.apiBaseUrl}/projects/${this.project()!.id}/risk-issues/risks/${rid}`).subscribe({
          next: () => { this.loadRisks(this.project()!.id); this.msg.add({ severity: 'success', summary: 'Deleted' }); },
        });
      },
    });
  }

  // ===== Issues =====

  private loadIssues(id: string): void {
    this.http.get<{ data: IssueRow[] }>(`${environment.apiBaseUrl}/projects/${id}/risk-issues/issues?limit=200`).subscribe({
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
        ownerUserId: iss.ownerId ?? '',
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
      ownerId: v.ownerUserId || null,
    };
    const pid = this.project()!.id;
    const req$ = this.issueEditId
      ? this.http.patch(`${environment.apiBaseUrl}/projects/${pid}/risk-issues/issues/${this.issueEditId}`, body)
      : this.http.post(`${environment.apiBaseUrl}/projects/${pid}/risk-issues/issues`, body);

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
        this.http.delete(`${environment.apiBaseUrl}/projects/${this.project()!.id}/risk-issues/issues/${iid}`).subscribe({
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

  goBack(): void { this.router.navigate(['/projects/list']); }

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

  completedDeliverableCount(deliverables: DeliverableRow[]): number {
    return deliverables.filter((d) => d.status === 'COMPLETED').length;
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
