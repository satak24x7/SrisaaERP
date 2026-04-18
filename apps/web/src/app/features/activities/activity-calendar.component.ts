import { Component, OnInit, AfterViewInit, inject, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { FullCalendarModule, FullCalendarComponent } from '@fullcalendar/angular';
import { CalendarOptions, EventClickArg, DateSelectArg } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin, { DateClickArg } from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import { DialogModule } from 'primeng/dialog';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { DatePickerModule } from 'primeng/datepicker';
import { TextareaModule } from 'primeng/textarea';
import { InputSwitchModule } from 'primeng/inputswitch';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';

interface CalendarEvent {
  id: string; title: string;
  start: string | null; end: string | null; allDay: boolean;
  extendedProps: {
    activityType: string; categoryCode: string;
    taskStatus: string | null; userName: string | null; description: string | null;
  };
}

interface Ref { id: string; name: string; }
interface LookupItem { label: string; value: string; isActive?: boolean; }
interface ContactRef { id: string; name: string; }
interface Association { id: string; entityType: string; entityId: string; entityName: string | null; }
interface FullActivity {
  id: string; activityType: string; subject: string; description: string | null;
  categoryCode: string; userId: string; userName: string | null;
  startDateTime: string | null; endDateTime: string | null; isAllDay: boolean;
  dueDateTime: string | null; taskStatus: string | null;
  associations: Association[]; contacts: ContactRef[];
  createdAt: string; updatedAt: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  'Sales': '#3B82F6',
  'Project': '#10B981',
  'Administration': '#F59E0B',
  'TRAVEL': '#8B5CF6',
};

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

@Component({
  selector: 'app-activity-calendar',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, FullCalendarModule, DialogModule, TagModule, ButtonModule, InputTextModule, SelectModule, MultiSelectModule, DatePickerModule, TextareaModule, InputSwitchModule, ToastModule, ConfirmDialogModule],
  providers: [MessageService, ConfirmationService],
  template: `
    <p-toast /><p-confirmDialog />

    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-semibold text-gray-800">Activity Calendar</h2>
        <p class="text-sm text-gray-500 mt-1">Click a date or drag to select a range to create an activity</p>
      </div>
      <div class="flex items-center gap-3">
        <div class="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
          <button class="px-3 py-1.5 transition-colors" [class]="showMine ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'" (click)="toggleMine(true)">My Items</button>
          <button class="px-3 py-1.5 transition-colors" [class]="!showMine ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'" (click)="toggleMine(false)">All Items</button>
        </div>
        <p-button label="New Activity" icon="pi pi-plus" (onClick)="openCreateDialog()" />
      </div>
    </div>

    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <full-calendar #calendar [options]="calendarOptions" />
    </div>

    <!-- Detail Dialog (view existing) -->
    <p-dialog header="Activity Details" [(visible)]="detailVisible" [modal]="true" [style]="{width:'550px'}">
      @if (detailLoading) {
        <div class="flex items-center gap-2 text-gray-500 py-6 justify-center"><i class="pi pi-spin pi-spinner"></i> Loading...</div>
      } @else if (selectedActivity()) {
        <div class="flex flex-col gap-4 pt-2">
          <!-- Header: Type + Category + Status -->
          <div class="flex items-center gap-2 flex-wrap">
            <p-tag [value]="selectedActivity()!.activityType" [severity]="selectedActivity()!.activityType === 'EVENT' ? 'info' : 'warn'" />
            <span class="text-sm bg-gray-100 rounded px-2 py-0.5">{{ selectedActivity()!.categoryCode }}</span>
            @if (selectedActivity()!.activityType === 'TASK' && selectedActivity()!.taskStatus) {
              <p-tag [value]="selectedActivity()!.taskStatus!" [severity]="taskSeverity(selectedActivity()!.taskStatus!)" />
            }
          </div>

          <!-- Subject -->
          <h3 class="text-xl font-semibold text-gray-800">{{ selectedActivity()!.subject }}</h3>

          <!-- Description -->
          @if (selectedActivity()!.description) {
            <p class="text-sm text-gray-600 whitespace-pre-wrap">{{ selectedActivity()!.description }}</p>
          }

          <!-- Date/Time -->
          <div class="grid grid-cols-2 gap-4 bg-gray-50 rounded-lg p-3">
            @if (selectedActivity()!.activityType === 'EVENT') {
              <div>
                <div class="text-xs text-gray-500 font-medium mb-1">Start</div>
                <div class="text-sm font-medium">
                  @if (selectedActivity()!.isAllDay) {
                    {{ selectedActivity()!.startDateTime | date:'mediumDate' }} <span class="text-gray-400">(All day)</span>
                  } @else {
                    {{ selectedActivity()!.startDateTime | date:'medium' }}
                  }
                </div>
              </div>
              <div>
                <div class="text-xs text-gray-500 font-medium mb-1">End</div>
                <div class="text-sm font-medium">
                  @if (selectedActivity()!.isAllDay) {
                    {{ selectedActivity()!.endDateTime | date:'mediumDate' }}
                  } @else {
                    {{ selectedActivity()!.endDateTime | date:'medium' }}
                  }
                </div>
              </div>
            } @else {
              <div>
                <div class="text-xs text-gray-500 font-medium mb-1">Due Date</div>
                <div class="text-sm font-medium">{{ selectedActivity()!.dueDateTime | date:'medium' }}</div>
              </div>
              <div>
                <div class="text-xs text-gray-500 font-medium mb-1">Status</div>
                <div><p-tag [value]="selectedActivity()!.taskStatus ?? 'OPEN'" [severity]="taskSeverity(selectedActivity()!.taskStatus ?? 'OPEN')" /></div>
              </div>
            }
          </div>

          <!-- Owner -->
          <div class="flex items-center gap-2 text-sm">
            <i class="pi pi-user text-gray-400"></i>
            <span class="text-gray-500">Assigned to:</span>
            <span class="font-medium">{{ selectedActivity()!.userName || 'Unassigned' }}</span>
          </div>

          <!-- Contacts -->
          @if (selectedActivity()!.contacts.length > 0) {
            <div>
              <div class="text-xs text-gray-500 font-medium mb-2"><i class="pi pi-users mr-1"></i> Contacts</div>
              <div class="flex flex-wrap gap-2">
                @for (c of selectedActivity()!.contacts; track c.id) {
                  <span class="text-xs bg-blue-50 border border-blue-200 rounded-full px-3 py-1 text-blue-700">{{ c.name }}</span>
                }
              </div>
            </div>
          }

          <!-- Associated Objects -->
          @if (selectedActivity()!.associations.length > 0) {
            <div>
              <div class="text-xs text-gray-500 font-medium mb-2"><i class="pi pi-link mr-1"></i> Linked Objects</div>
              <div class="flex flex-col gap-1">
                @for (a of selectedActivity()!.associations; track a.id) {
                  <div class="flex items-center gap-2 bg-gray-50 rounded px-3 py-2 text-sm">
                    <span class="text-xs bg-gray-200 rounded px-2 py-0.5 font-medium text-gray-600">{{ entityLabel(a.entityType) }}</span>
                    <span class="text-gray-800">{{ a.entityName || a.entityId }}</span>
                  </div>
                }
              </div>
            </div>
          }

          <!-- Timestamps -->
          <div class="text-xs text-gray-400 border-t pt-2 flex gap-4">
            <span>Created: {{ selectedActivity()!.createdAt | date:'medium' }}</span>
            <span>Updated: {{ selectedActivity()!.updatedAt | date:'medium' }}</span>
          </div>
        </div>
      }
      <ng-template pTemplate="footer">
        <p-button label="Edit" icon="pi pi-pencil" severity="info" [text]="true" (onClick)="editFromDetail()" />
        <p-button label="Delete" icon="pi pi-trash" severity="danger" [text]="true" (onClick)="deleteFromDetail()" />
        <p-button label="Close" severity="secondary" [text]="true" (onClick)="detailVisible=false" />
      </ng-template>
    </p-dialog>

    <!-- Create / Edit Dialog -->
    <p-dialog [header]="editId ? 'Edit Activity' : 'New Activity'" [(visible)]="formVisible" [modal]="true" [style]="{width:'600px'}">
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

        @if (formError) {
          <div class="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{{ formError }}</div>
        }
      </form>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="formVisible=false" />
        <p-button [label]="editId ? 'Update' : 'Create'" icon="pi pi-check" [disabled]="actForm.invalid" (onClick)="saveActivity()" />
      </ng-template>
    </p-dialog>
  `,
})
export class ActivityCalendarComponent implements OnInit, AfterViewInit {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly msg = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  showMine = true;
  selectedActivity = signal<FullActivity | null>(null);
  detailVisible = false;
  detailLoading = false;

  // Form state
  formVisible = false;
  editId: string | null = null;
  formError = '';
  formAssociations: Array<{ entityType: string; entityId: string }> = [];

  // Options
  userOptions = signal<Ref[]>([]);
  contactOptions = signal<Ref[]>([]);
  categoryOptions = signal<LookupItem[]>([]);
  opportunityOptions = signal<Ref[]>([]);
  leadOptions = signal<Ref[]>([]);
  accountOptions = signal<Ref[]>([]);
  influencerOptions = signal<Ref[]>([]);

  activityTypes = ACTIVITY_TYPES;
  taskStatuses = TASK_STATUSES;
  entityTypes = ENTITY_TYPES;

  @ViewChild('calendar') calendarComponent!: FullCalendarComponent;

  private currentStart = '';
  private currentEnd = '';

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

  calendarOptions: CalendarOptions = {
    plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin],
    initialView: 'dayGridMonth',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek',
    },
    editable: false,
    selectable: true,
    selectMirror: true,
    eventClick: (info: EventClickArg) => {
      const evId = info.event.id;
      // Travel plans have IDs prefixed with "travel_"
      if (evId.startsWith('travel_')) {
        const travelPlanId = evId.replace('travel_', '');
        this.router.navigate(['/work-area/travels', travelPlanId]);
        return;
      }
      this.detailLoading = true;
      this.selectedActivity.set(null);
      this.detailVisible = true;
      this.http.get<{ data: FullActivity }>(`${environment.apiBaseUrl}/activities/${evId}`).subscribe({
        next: (r) => { this.selectedActivity.set(r.data); this.detailLoading = false; },
        error: () => { this.detailLoading = false; },
      });
    },
    dateClick: (info: DateClickArg) => {
      this.openCreateDialog(info.date, info.allDay);
    },
    select: (info: DateSelectArg) => {
      this.openCreateDialogWithRange(info.start, info.end, info.allDay);
    },
    datesSet: (arg) => {
      this.currentStart = arg.startStr;
      this.currentEnd = arg.endStr;
      if (this.viewReady) {
        this.loadEvents(arg.startStr, arg.endStr);
      }
    },
    eventColor: '#3B82F6',
    height: 'auto',
  };

  private viewReady = false;

  ngOnInit(): void {
    this.loadOptions();
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    // If datesSet already fired before view was ready, load now
    if (this.currentStart && this.currentEnd) {
      this.loadEvents(this.currentStart, this.currentEnd);
    }
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
  }

  private loadEvents(start: string, end: string): void {
    let url = `${environment.apiBaseUrl}/activities/calendar?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
    if (this.showMine) url += '&mine=true';
    this.http.get<{ data: CalendarEvent[] }>(url).subscribe({
      next: (r) => {
        const calApi = this.calendarComponent?.getApi();
        if (!calApi) return;
        // Remove all existing events and add fresh ones
        calApi.removeAllEvents();
        r.data
          .filter((e) => e.start != null)
          .forEach((e) => {
            calApi.addEvent({
              id: e.id,
              title: e.title,
              start: e.start!,
              end: e.end ?? undefined,
              allDay: e.allDay,
              color: CATEGORY_COLORS[e.extendedProps.categoryCode] ?? '#6B7280',
              extendedProps: e.extendedProps,
            });
          });
      },
      error: (err) => {
        console.error('Calendar load error:', err);
      },
    });
  }

  private reloadEvents(): void {
    if (this.currentStart && this.currentEnd) {
      this.loadEvents(this.currentStart, this.currentEnd);
    }
  }

  toggleMine(val: boolean): void {
    this.showMine = val;
    this.reloadEvents();
  }

  // --- Create / Edit ---

  openCreateDialog(date?: Date, allDay?: boolean): void {
    this.editId = null;
    this.formError = '';
    this.formAssociations = [];
    const now = date ?? new Date();
    const end = new Date(now.getTime() + 60 * 60 * 1000); // +1 hour

    this.actForm.reset({
      activityType: 'EVENT',
      isAllDay: allDay ?? false,
      taskStatus: 'OPEN',
      startDateTime: now,
      endDateTime: end,
    });
    this.formVisible = true;
  }

  openCreateDialogWithRange(start: Date, end: Date, allDay: boolean): void {
    this.editId = null;
    this.formError = '';
    this.formAssociations = [];

    this.actForm.reset({
      activityType: 'EVENT',
      isAllDay: allDay,
      taskStatus: 'OPEN',
      startDateTime: start,
      endDateTime: end,
    });
    this.formVisible = true;
  }

  editFromDetail(): void {
    const a = this.selectedActivity();
    if (!a) return;
    this.detailVisible = false;

    this.editId = a.id;
    this.formError = '';
    this.actForm.patchValue({
      activityType: a.activityType,
      subject: a.subject,
      description: a.description ?? '',
      categoryCode: a.categoryCode,
      userId: a.userId,
      startDateTime: a.startDateTime ? new Date(a.startDateTime) : null,
      endDateTime: a.endDateTime ? new Date(a.endDateTime) : null,
      isAllDay: a.isAllDay,
      dueDateTime: a.dueDateTime ? new Date(a.dueDateTime) : null,
      taskStatus: a.taskStatus ?? 'OPEN',
      contactIds: a.contacts.map((c) => c.id),
    });
    this.formAssociations = a.associations.map((assoc) => ({ entityType: assoc.entityType, entityId: assoc.entityId }));
    this.formVisible = true;
  }

  deleteFromDetail(): void {
    const a = this.selectedActivity();
    if (!a) return;
    this.confirm.confirm({
      message: `Delete "${a.subject}"?`,
      accept: () => {
        this.http.delete(`${environment.apiBaseUrl}/activities/${a.id}`).subscribe({
          next: () => {
            this.detailVisible = false;
            this.reloadEvents();
            this.msg.add({ severity: 'success', summary: 'Deleted' });
          },
        });
      },
    });
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
        this.formVisible = false;
        this.reloadEvents();
        this.msg.add({ severity: 'success', summary: 'Saved', detail: `Activity ${this.editId ? 'updated' : 'created'}` });
      },
      error: (err: HttpErrorResponse) => {
        this.formError = err.error?.error?.message ?? 'An error occurred';
      },
    });
  }

  // --- Associations ---

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
      default: return [];
    }
  }

  taskSeverity(s: string): 'success' | 'warn' | 'danger' | 'info' {
    if (s === 'CLOSED') return 'success';
    if (s === 'OVERDUE') return 'danger';
    return 'warn';
  }

  entityLabel(type: string): string {
    const labels: Record<string, string> = {
      OPPORTUNITY: 'Opportunity', LEAD: 'Lead', ACCOUNT: 'Account',
      CONTACT: 'Contact', INFLUENCER: 'Influencer', PROJECT: 'Project',
    };
    return labels[type] ?? type;
  }
}
