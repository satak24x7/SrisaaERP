import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DatePickerModule } from 'primeng/datepicker';
import { TextareaModule } from 'primeng/textarea';
import { InputSwitchModule } from 'primeng/inputswitch';
import { ConfirmationService, MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';

interface Ref { id: string; name: string; }
interface LookupItem { label: string; value: string; isActive?: boolean; }
interface Association { id: string; entityType: string; entityId: string; entityName: string | null; }
interface ContactRef { id: string; name: string; }
interface Activity {
  id: string; activityType: string; subject: string; description: string | null;
  categoryCode: string; userId: string; userName: string | null;
  startDateTime: string | null; endDateTime: string | null; isAllDay: boolean;
  dueDateTime: string | null; taskStatus: string | null;
  associations: Association[]; contacts: ContactRef[];
  createdAt: string; updatedAt: string;
}

const ACTIVITY_TYPES = [
  { label: 'Event', value: 'EVENT' },
  { label: 'Task', value: 'TASK' },
];
const TASK_STATUSES = [
  { label: 'Open', value: 'OPEN' },
  { label: 'Overdue', value: 'OVERDUE' },
  { label: 'Closed', value: 'CLOSED' },
];
const ENTITY_TYPES = [
  { label: 'Opportunity', value: 'OPPORTUNITY' },
  { label: 'Lead', value: 'LEAD' },
  { label: 'Account', value: 'ACCOUNT' },
  { label: 'Contact', value: 'CONTACT' },
  { label: 'Influencer', value: 'INFLUENCER' },
  { label: 'Project', value: 'PROJECT' },
];
const ENTITY_TYPE_LABELS: Record<string, string> = Object.fromEntries(ENTITY_TYPES.map((e) => [e.value, e.label]));

@Component({
  selector: 'app-activity-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, ButtonModule, InputTextModule, SelectModule, MultiSelectModule, TableModule, TagModule, DialogModule, ToastModule, ConfirmDialogModule, DatePickerModule, TextareaModule, InputSwitchModule],
  providers: [MessageService, ConfirmationService],
  template: `
    <p-toast /><p-confirmDialog />

    <div class="flex items-center justify-between mb-6">
      <h2 class="text-2xl font-semibold text-gray-800">Activities</h2>
      <div class="flex items-center gap-3">
        <div class="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
          <button class="px-3 py-1.5 transition-colors" [class]="showMine ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'" (click)="showMine=true; loadActivities()">My Items</button>
          <button class="px-3 py-1.5 transition-colors" [class]="!showMine ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'" (click)="showMine=false; loadActivities()">All Items</button>
        </div>
        <p-button label="New Activity" icon="pi pi-plus" (onClick)="openDialog()" />
      </div>
    </div>

    <!-- Tab bar -->
    <div class="flex gap-2 mb-4">
      @for (t of tabs; track t.value) {
        <button class="px-4 py-2 rounded-full text-sm font-medium transition-colors"
                [class]="activeTab === t.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
                (click)="activeTab = t.value; loadActivities()">{{ t.label }}</button>
      }
    </div>

    <!-- Filters -->
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <p-select appendTo="body" [(ngModel)]="filterType" [options]="activityTypes" optionLabel="label" optionValue="value" [showClear]="true" placeholder="All Types" class="w-full" (onChange)="loadActivities()" />
        <p-select appendTo="body" [(ngModel)]="filterCategory" [options]="categoryOptions()" optionLabel="label" optionValue="value" [showClear]="true" placeholder="All Categories" class="w-full" (onChange)="loadActivities()" />
        <p-select appendTo="body" [(ngModel)]="filterUser" [options]="userOptions()" optionLabel="name" optionValue="id" [filter]="true" [showClear]="true" placeholder="All Users" class="w-full" (onChange)="loadActivities()" />
        <p-button label="Reset" icon="pi pi-refresh" severity="secondary" [outlined]="true" (onClick)="resetFilters()" />
      </div>
    </div>

    <!-- Table -->
    <div class="bg-white rounded-lg shadow-sm border border-gray-200">
      <p-table [value]="activities()" styleClass="p-datatable-sm" [paginator]="true" [rows]="20">
        <ng-template pTemplate="header">
          <tr>
            <th style="width:40px"></th>
            <th>Subject</th><th>Type</th><th>Date / Time</th><th>Status</th><th>Linked To</th><th>Category</th><th>Owner</th><th style="width:100px">Actions</th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-a>
          <tr>
            <td><i [class]="typeIcon(a.activityType)" class="text-gray-500"></i></td>
            <td class="font-medium">{{ a.subject }}</td>
            <td><p-tag [value]="a.activityType" [severity]="a.activityType === 'EVENT' ? 'info' : 'warn'" /></td>
            <td>
              @if (a.activityType === 'EVENT') {
                {{ a.startDateTime | date:'short' }}
                @if (a.isAllDay) { <span class="text-xs text-gray-400 ml-1">(All day)</span> }
              } @else {
                {{ a.dueDateTime | date:'short' }}
              }
            </td>
            <td>
              @if (a.activityType === 'TASK' && a.taskStatus) {
                <p-tag [value]="a.taskStatus" [severity]="taskStatusSeverity(a.taskStatus)" />
              } @else if (a.activityType === 'EVENT') {
                <span class="text-xs text-gray-400">-</span>
              }
            </td>
            <td>
              <div class="flex flex-wrap gap-1">
                @for (assoc of a.associations; track assoc.id) {
                  <span class="text-xs bg-gray-100 rounded px-2 py-0.5" [title]="entityLabel(assoc.entityType)">{{ assoc.entityName || entityLabel(assoc.entityType) }}</span>
                }
                @if (a.associations.length === 0) { <span class="text-xs text-gray-400">-</span> }
              </div>
            </td>
            <td>{{ resolveCategoryLabel(a.categoryCode) }}</td>
            <td>{{ a.userName || '-' }}</td>
            <td>
              <div class="flex gap-1">
                <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small" (onClick)="openDialog(a)" />
                <p-button icon="pi pi-trash" [text]="true" [rounded]="true" size="small" severity="danger" (onClick)="deleteActivity(a.id)" />
              </div>
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr><td colspan="9" class="text-center text-gray-400 py-8">No activities found</td></tr>
        </ng-template>
      </p-table>
    </div>

    <!-- Add/Edit Dialog -->
    <p-dialog [header]="editId ? 'Edit Activity' : 'New Activity'" [(visible)]="dialogVisible" [modal]="true" [style]="{width:'600px'}">
      <form [formGroup]="actForm" class="flex flex-col gap-4 pt-2">
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Type *</label>
            <p-select appendTo="body" formControlName="activityType" [options]="activityTypes" optionLabel="label" optionValue="value" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Category *</label>
            <p-select appendTo="body" formControlName="categoryCode" [options]="categoryOptions()" optionLabel="label" optionValue="value" class="w-full" />
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Subject *</label>
          <input pInputText formControlName="subject" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Description</label>
          <textarea pTextarea formControlName="description" [rows]="3" class="w-full"></textarea>
        </div>

        <!-- Event fields -->
        @if (actForm.get('activityType')?.value === 'EVENT') {
          <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Start *</label>
              <p-datepicker appendTo="body" formControlName="startDateTime" [showTime]="!actForm.get('isAllDay')?.value" class="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">End *</label>
              <p-datepicker appendTo="body" formControlName="endDateTime" [showTime]="!actForm.get('isAllDay')?.value" class="w-full" />
            </div>
          </div>
          <div class="flex items-center gap-2">
            <p-inputSwitch formControlName="isAllDay" />
            <label class="text-sm text-gray-700">All Day</label>
          </div>
        }

        <!-- Task fields -->
        @if (actForm.get('activityType')?.value === 'TASK') {
          <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Due Date/Time *</label>
              <p-datepicker appendTo="body" formControlName="dueDateTime" [showTime]="true" class="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Status</label>
              <p-select appendTo="body" formControlName="taskStatus" [options]="taskStatuses" optionLabel="label" optionValue="value" class="w-full" />
            </div>
          </div>
        }

        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Assigned To *</label>
          <p-select appendTo="body" formControlName="userId" [options]="userOptions()" optionLabel="name" optionValue="id" [filter]="true" class="w-full" />
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Contacts</label>
          <p-multiSelect appendTo="body" formControlName="contactIds" [options]="contactOptions()" optionLabel="name" optionValue="id" display="chip" placeholder="Select contacts" class="w-full" />
        </div>

        <!-- Associations -->
        <div class="flex flex-col gap-2">
          <label class="text-sm font-medium text-gray-700">Linked Objects</label>
          @for (assoc of formAssociations; track $index) {
            <div class="flex gap-2 items-center">
              <p-select appendTo="body" [(ngModel)]="assoc.entityType" [ngModelOptions]="{standalone: true}" [options]="entityTypes" optionLabel="label" optionValue="value" placeholder="Type" class="w-40" (onChange)="onEntityTypeChange(assoc)" />
              <p-select appendTo="body" [(ngModel)]="assoc.entityId" [ngModelOptions]="{standalone: true}" [options]="getEntityOptions(assoc.entityType)" optionLabel="name" optionValue="id" [filter]="true" placeholder="Search..." class="flex-1" />
              <p-button icon="pi pi-times" [text]="true" [rounded]="true" severity="danger" size="small" (onClick)="removeAssociation($index)" />
            </div>
          }
          <p-button label="Add Link" icon="pi pi-plus" [text]="true" size="small" (onClick)="addAssociation()" />
        </div>

        @if (dialogError) {
          <div class="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{{ dialogError }}</div>
        }
      </form>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="dialogVisible=false" />
        <p-button [label]="editId ? 'Update' : 'Create'" icon="pi pi-check" [disabled]="actForm.invalid" (onClick)="saveActivity()" />
      </ng-template>
    </p-dialog>
  `,
})
export class ActivityListComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly msg = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  activities = signal<Activity[]>([]);
  loading = signal(true);
  userOptions = signal<Ref[]>([]);
  contactOptions = signal<Ref[]>([]);
  categoryOptions = signal<LookupItem[]>([]);

  // Entity options for associations
  opportunityOptions = signal<Ref[]>([]);
  leadOptions = signal<Ref[]>([]);
  accountOptions = signal<Ref[]>([]);
  influencerOptions = signal<Ref[]>([]);
  projectOptions = signal<Ref[]>([]);

  activityTypes = ACTIVITY_TYPES;
  taskStatuses = TASK_STATUSES;
  entityTypes = ENTITY_TYPES;

  tabs = [
    { label: 'All', value: '' },
    { label: 'Open', value: 'open' },
    { label: 'Upcoming', value: 'upcoming' },
    { label: 'Completed', value: 'completed' },
  ];
  showMine = true;
  activeTab = '';
  filterType = '';
  filterCategory = '';
  filterUser = '';

  dialogVisible = false;
  editId: string | null = null;
  dialogError = '';
  formAssociations: Array<{ entityType: string; entityId: string }> = [];

  actForm = this.fb.group({
    activityType: ['EVENT', Validators.required],
    subject: ['', [Validators.required, Validators.maxLength(255)]],
    description: [''],
    categoryCode: ['', Validators.required],
    userId: ['', Validators.required],
    startDateTime: [null as Date | null],
    endDateTime: [null as Date | null],
    isAllDay: [false],
    dueDateTime: [null as Date | null],
    taskStatus: ['OPEN'],
    contactIds: [[] as string[]],
  });

  ngOnInit(): void {
    this.loadOptions();
    this.loadActivities();
  }

  private loadOptions(): void {
    this.http.get<{ data: Array<{ id: string; fullName: string }> }>(`${environment.apiBaseUrl}/users?limit=200`).subscribe({
      next: (r) => this.userOptions.set(r.data.map((u) => ({ id: u.id, name: u.fullName }))),
    });
    this.http.get<{ data: Array<{ id: string; firstName: string; lastName: string | null }> }>(`${environment.apiBaseUrl}/contacts?limit=200`).subscribe({
      next: (r) => this.contactOptions.set(r.data.map((c) => ({ id: c.id, name: `${c.firstName}${c.lastName ? ' ' + c.lastName : ''}` }))),
    });
    this.http.get<{ data: LookupItem[] }>(`${environment.apiBaseUrl}/lookup-lists/by-code/activity_category/items`).subscribe({
      next: (r) => this.categoryOptions.set(r.data.filter((i) => i.isActive !== false)),
      error: () => {},
    });
    // Entity options for associations
    this.http.get<{ data: Array<{ id: string; title: string }> }>(`${environment.apiBaseUrl}/opportunities?limit=200`).subscribe({
      next: (r) => this.opportunityOptions.set(r.data.map((o) => ({ id: o.id, name: o.title }))),
    });
    this.http.get<{ data: Array<{ id: string; title: string }> }>(`${environment.apiBaseUrl}/leads?limit=200`).subscribe({
      next: (r) => this.leadOptions.set(r.data.map((l) => ({ id: l.id, name: l.title }))),
    });
    this.http.get<{ data: Ref[] }>(`${environment.apiBaseUrl}/accounts?limit=200`).subscribe({
      next: (r) => this.accountOptions.set(r.data),
    });
    this.http.get<{ data: Ref[] }>(`${environment.apiBaseUrl}/influencers?limit=200`).subscribe({
      next: (r) => this.influencerOptions.set(r.data),
    });
    this.http.get<{ data: Array<{ id: string; name: string }> }>(`${environment.apiBaseUrl}/projects?limit=200`).subscribe({
      next: (r) => this.projectOptions.set(r.data.map((p) => ({ id: p.id, name: p.name }))),
    });
  }

  loadActivities(): void {
    this.loading.set(true);
    const params: string[] = ['limit=200'];
    if (this.showMine) params.push('mine=true');
    if (this.activeTab) params.push(`tab=${this.activeTab}`);
    if (this.filterType) params.push(`activityType=${this.filterType}`);
    if (this.filterCategory) params.push(`categoryCode=${this.filterCategory}`);
    if (this.filterUser) params.push(`userId=${this.filterUser}`);

    this.http.get<{ data: Activity[] }>(`${environment.apiBaseUrl}/activities?${params.join('&')}`).subscribe({
      next: (r) => { this.activities.set(r.data); this.loading.set(false); },
      error: () => { this.loading.set(false); },
    });
  }

  resetFilters(): void {
    this.filterType = '';
    this.filterCategory = '';
    this.filterUser = '';
    this.activeTab = '';
    this.loadActivities();
  }

  openDialog(activity?: Activity): void {
    this.dialogError = '';
    if (activity) {
      this.editId = activity.id;
      this.actForm.patchValue({
        activityType: activity.activityType,
        subject: activity.subject,
        description: activity.description ?? '',
        categoryCode: activity.categoryCode,
        userId: activity.userId,
        startDateTime: activity.startDateTime ? new Date(activity.startDateTime) : null,
        endDateTime: activity.endDateTime ? new Date(activity.endDateTime) : null,
        isAllDay: activity.isAllDay,
        dueDateTime: activity.dueDateTime ? new Date(activity.dueDateTime) : null,
        taskStatus: activity.taskStatus ?? 'OPEN',
        contactIds: activity.contacts.map((c) => c.id),
      });
      this.formAssociations = activity.associations.map((a) => ({ entityType: a.entityType, entityId: a.entityId }));
    } else {
      this.editId = null;
      this.actForm.reset({ activityType: 'EVENT', isAllDay: false, taskStatus: 'OPEN' });
      this.formAssociations = [];
    }
    this.dialogVisible = true;
  }

  saveActivity(): void {
    if (this.actForm.invalid) return;
    const v = this.actForm.value;
    const body: Record<string, unknown> = {
      activityType: v.activityType,
      subject: v.subject,
      description: v.description || undefined,
      categoryCode: v.categoryCode,
      userId: v.userId,
      isAllDay: v.isAllDay ?? false,
      contactIds: v.contactIds ?? [],
      associations: this.formAssociations.filter((a) => a.entityType && a.entityId),
    };

    if (v.activityType === 'EVENT') {
      body['startDateTime'] = v.startDateTime instanceof Date ? v.startDateTime.toISOString() : v.startDateTime;
      body['endDateTime'] = v.endDateTime instanceof Date ? v.endDateTime.toISOString() : v.endDateTime;
    } else {
      body['dueDateTime'] = v.dueDateTime instanceof Date ? v.dueDateTime.toISOString() : v.dueDateTime;
      body['taskStatus'] = v.taskStatus;
    }

    const url = `${environment.apiBaseUrl}/activities`;
    const req$ = this.editId
      ? this.http.patch(`${url}/${this.editId}`, body)
      : this.http.post(url, body);

    req$.subscribe({
      next: () => {
        this.dialogVisible = false;
        this.loadActivities();
        this.msg.add({ severity: 'success', summary: 'Saved', detail: `Activity ${this.editId ? 'updated' : 'created'}` });
      },
      error: (err: HttpErrorResponse) => {
        this.dialogError = err.error?.error?.message ?? 'An error occurred';
      },
    });
  }

  deleteActivity(id: string): void {
    this.confirm.confirm({
      message: 'Delete this activity?',
      accept: () => {
        this.http.delete(`${environment.apiBaseUrl}/activities/${id}`).subscribe({
          next: () => {
            this.loadActivities();
            this.msg.add({ severity: 'success', summary: 'Deleted' });
          },
        });
      },
    });
  }

  addAssociation(): void {
    this.formAssociations = [...this.formAssociations, { entityType: '', entityId: '' }];
  }

  removeAssociation(index: number): void {
    this.formAssociations = this.formAssociations.filter((_, i) => i !== index);
  }

  onEntityTypeChange(assoc: { entityType: string; entityId: string }): void {
    assoc.entityId = '';
  }

  getEntityOptions(entityType: string): Ref[] {
    switch (entityType) {
      case 'OPPORTUNITY': return this.opportunityOptions();
      case 'LEAD': return this.leadOptions();
      case 'ACCOUNT': return this.accountOptions();
      case 'CONTACT': return this.contactOptions();
      case 'INFLUENCER': return this.influencerOptions();
      case 'PROJECT': return this.projectOptions();
      default: return [];
    }
  }

  entityLabel(type: string): string { return ENTITY_TYPE_LABELS[type] ?? type; }

  resolveCategoryLabel(code: string): string {
    if (!code) return '-';
    const match = this.categoryOptions().find((o) => o.value === code);
    return match?.label ?? code;
  }

  typeIcon(type: string): string {
    return type === 'EVENT' ? 'pi pi-calendar' : 'pi pi-check-square';
  }

  taskStatusSeverity(s: string): 'success' | 'warn' | 'danger' | 'info' {
    if (s === 'CLOSED') return 'success';
    if (s === 'OVERDUE') return 'danger';
    return 'warn';
  }
}
