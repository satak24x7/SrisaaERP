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
interface DateChange { id: string; field: string; oldValue: string | null; newValue: string | null; reason: string | null; changedBy: string; changedByName: string; changedAt: string; }
interface FullActivity {
  id: string; activityType: string; subject: string; description: string | null;
  categoryCode: string; userId: string; userName: string | null;
  startDateTime: string | null; endDateTime: string | null; isAllDay: boolean;
  dueDateTime: string | null; taskStatus: string | null;
  associations: Association[]; contacts: ContactRef[];
  createdAt: string; updatedAt: string;
}

interface TaskGroup {
  label: string;
  key: string;
  items: FullActivity[];
  collapsed: boolean;
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
  { label: 'Initiative', value: 'INITIATIVE' },
];

@Component({
  selector: 'app-activity-calendar',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, FullCalendarModule, DialogModule, TagModule, ButtonModule, InputTextModule, SelectModule, MultiSelectModule, DatePickerModule, TextareaModule, InputSwitchModule, ToastModule, ConfirmDialogModule],
  providers: [MessageService, ConfirmationService],
  template: `
    <p-toast /><p-confirmDialog />

    <div class="flex items-center justify-between mb-4">
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

    <!-- 2/3 Calendar + 1/3 Task Panel -->
    <div class="flex gap-4" style="min-height: calc(100vh - 160px)">
      <!-- Calendar: 2/3 -->
      <div class="flex-[2] bg-white rounded-lg shadow-sm border border-gray-200 p-4 min-w-0">
        <full-calendar #calendar [options]="calendarOptions" />
      </div>

      <!-- Task Panel: 1/3 -->
      <div class="flex-[1] bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col min-w-[280px] max-w-[400px]">
        <div class="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 class="text-sm font-semibold text-gray-700">
            <i class="pi pi-list-check mr-2"></i>Tasks
          </h3>
          <span class="text-xs text-gray-400">{{ taskPanelTotal() }} items</span>
        </div>

        <div class="flex-1 overflow-y-auto">
          @if (taskPanelLoading()) {
            <div class="flex items-center justify-center py-10 text-gray-400">
              <i class="pi pi-spin pi-spinner mr-2"></i> Loading...
            </div>
          } @else if (taskGroups().length === 0) {
            <div class="flex flex-col items-center justify-center py-10 text-gray-400">
              <i class="pi pi-check-circle text-3xl mb-2"></i>
              <span class="text-sm">No open tasks in this period</span>
            </div>
          } @else {
            @for (group of taskGroups(); track group.key) {
              <div class="border-b border-gray-100 last:border-b-0">
                <!-- Group header -->
                <button
                  (click)="group.collapsed = !group.collapsed"
                  class="w-full flex items-center justify-between px-4 py-2 text-xs font-semibold uppercase tracking-wider hover:bg-gray-50 transition-colors"
                  [class.text-red-600]="group.key === 'overdue'"
                  [class.bg-red-50]="group.key === 'overdue'"
                  [class.text-gray-500]="group.key !== 'overdue'"
                >
                  <span class="flex items-center gap-2">
                    <i class="pi text-[10px]" [class.pi-chevron-down]="!group.collapsed" [class.pi-chevron-right]="group.collapsed"></i>
                    {{ group.label }}
                  </span>
                  <span class="bg-gray-200 text-gray-600 text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center"
                        [class.bg-red-200]="group.key === 'overdue'" [class.text-red-700]="group.key === 'overdue'">
                    {{ group.items.length }}
                  </span>
                </button>

                <!-- Items -->
                @if (!group.collapsed) {
                  <div class="pb-1">
                    @for (item of group.items; track item.id) {
                      <div
                        (click)="openTaskDetail(item.id)"
                        class="mx-2 mb-1 px-3 py-2 rounded-md hover:bg-gray-50 cursor-pointer transition-colors border border-transparent hover:border-gray-200"
                      >
                        <div class="flex items-start gap-2">
                          <!-- Status indicator -->
                          <div class="mt-0.5 shrink-0">
                            <i class="pi pi-check-square text-xs"
                               [class.text-red-500]="item.taskStatus === 'OVERDUE'"
                               [class.text-amber-500]="item.taskStatus === 'OPEN'"
                               [class.text-green-500]="item.taskStatus === 'CLOSED'"></i>
                          </div>
                          <div class="flex-1 min-w-0">
                            <p class="text-sm font-medium text-gray-800 truncate" [class.line-through]="item.taskStatus === 'CLOSED'" [class.text-gray-400]="item.taskStatus === 'CLOSED'">{{ item.subject }}</p>
                            <div class="flex items-center gap-2 mt-0.5">
                              @if (item.dueDateTime) {
                                <span class="text-[11px] text-gray-400">
                                  {{ formatTaskTime(item.dueDateTime) }}
                                </span>
                              }
                              @if (item.userName) {
                                <span class="text-[11px] text-gray-400 truncate">
                                  <i class="pi pi-user text-[9px] mr-0.5"></i>{{ item.userName }}
                                </span>
                              }
                            </div>
                            @if (item.associations.length > 0) {
                              <div class="flex flex-wrap gap-1 mt-1">
                                @for (a of item.associations; track a.id) {
                                  <span class="text-[10px] bg-gray-100 text-gray-500 rounded px-1.5 py-0.5 truncate max-w-[120px]">
                                    {{ a.entityName || a.entityType }}
                                  </span>
                                }
                              </div>
                            }
                          </div>
                          <!-- Category color dot -->
                          <div class="w-2 h-2 rounded-full shrink-0 mt-1.5" [style.background]="getCategoryColor(item.categoryCode)"></div>
                        </div>
                      </div>
                    }
                  </div>
                }
              </div>
            }
          }
        </div>
      </div>
    </div>

    <!-- Detail Dialog (view existing) -->
    <p-dialog header="Activity Details" [(visible)]="detailVisible" [modal]="true" [style]="{width:'550px'}">
      @if (detailLoading) {
        <div class="flex items-center gap-2 py-6 justify-center"><i class="pi pi-spin pi-spinner"></i> Loading...</div>
      } @else if (selectedActivity()) {
        <div class="flex flex-col gap-4 pt-2">
          <!-- Header: Type + Category + Status -->
          <div class="flex items-center gap-2 flex-wrap">
            <p-tag [value]="selectedActivity()!.activityType" [severity]="selectedActivity()!.activityType === 'EVENT' ? 'info' : 'warn'" />
            <p-tag [value]="selectedActivity()!.categoryCode" severity="secondary" />
            @if (selectedActivity()!.activityType === 'TASK' && selectedActivity()!.taskStatus) {
              <p-tag [value]="selectedActivity()!.taskStatus!" [severity]="taskSeverity(selectedActivity()!.taskStatus!)" />
            }
          </div>

          <!-- Subject -->
          <h3 class="text-xl font-semibold">{{ selectedActivity()!.subject }}</h3>

          <!-- Description -->
          @if (selectedActivity()!.description) {
            <p class="text-sm opacity-80 whitespace-pre-wrap">{{ selectedActivity()!.description }}</p>
          }

          <!-- Date/Time -->
          <div class="grid grid-cols-2 gap-4 rounded-lg p-3 border border-gray-600">
            @if (selectedActivity()!.activityType === 'EVENT') {
              <div>
                <div class="text-xs opacity-60 font-medium mb-1">Start</div>
                <div class="text-sm font-medium">
                  @if (selectedActivity()!.isAllDay) {
                    {{ selectedActivity()!.startDateTime | date:'mediumDate' }} <span class="opacity-50">(All day)</span>
                  } @else {
                    {{ selectedActivity()!.startDateTime | date:'medium' }}
                  }
                </div>
              </div>
              <div>
                <div class="text-xs opacity-60 font-medium mb-1">End</div>
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
                <div class="text-xs opacity-60 font-medium mb-1">Due Date</div>
                <div class="text-sm font-medium">{{ selectedActivity()!.dueDateTime | date:'medium' }}</div>
              </div>
              <div>
                <div class="text-xs opacity-60 font-medium mb-1">Status</div>
                <div><p-tag [value]="selectedActivity()!.taskStatus ?? 'OPEN'" [severity]="taskSeverity(selectedActivity()!.taskStatus ?? 'OPEN')" /></div>
              </div>
            }
          </div>

          <!-- Owner -->
          <div class="flex items-center gap-2 text-sm">
            <i class="pi pi-user opacity-50"></i>
            <span class="opacity-60">Assigned to:</span>
            <span class="font-medium">{{ selectedActivity()!.userName || 'Unassigned' }}</span>
          </div>

          <!-- Contacts -->
          @if (selectedActivity()!.contacts.length > 0) {
            <div>
              <div class="text-xs opacity-60 font-medium mb-2"><i class="pi pi-users mr-1"></i> Contacts</div>
              <div class="flex flex-wrap gap-2">
                @for (c of selectedActivity()!.contacts; track c.id) {
                  <p-tag [value]="c.name" severity="info" />
                }
              </div>
            </div>
          }

          <!-- Associated Objects -->
          @if (selectedActivity()!.associations.length > 0) {
            <div>
              <div class="text-xs opacity-60 font-medium mb-2"><i class="pi pi-link mr-1"></i> Linked Objects</div>
              <div class="flex flex-col gap-1">
                @for (a of selectedActivity()!.associations; track a.id) {
                  <div class="flex items-center gap-2 rounded px-3 py-2 text-sm border border-gray-600">
                    <p-tag [value]="entityLabel(a.entityType)" severity="secondary" />
                    <span>{{ a.entityName || a.entityId }}</span>
                  </div>
                }
              </div>
            </div>
          }

          <!-- Timestamps -->
          <div class="text-xs opacity-40 border-t border-gray-600 pt-2 flex gap-4">
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

        <!-- Date Change History -->
        @if (editId && dateChanges().length > 0) {
          <div class="mt-4 border-t pt-3">
            <label class="text-sm font-medium text-gray-700 flex items-center gap-1 mb-2">
              <i class="pi pi-history text-xs"></i> Date Change History
            </label>
            <div class="max-h-40 overflow-y-auto space-y-2">
              @for (ch of dateChanges(); track ch.id) {
                <div class="flex items-start gap-2 text-xs bg-gray-50 rounded p-2">
                  <i class="pi pi-clock text-gray-400 mt-0.5"></i>
                  <div class="flex-1">
                    <span class="font-medium">{{ dateFieldLabel(ch.field) }}</span>
                    changed from
                    <span class="text-red-600">{{ ch.oldValue ? (ch.oldValue | date:'short') : '(none)' }}</span>
                    to
                    <span class="text-green-600">{{ ch.newValue ? (ch.newValue | date:'short') : '(none)' }}</span>
                    <div class="text-gray-400 mt-0.5">by {{ ch.changedByName }} &middot; {{ ch.changedAt | date:'short' }}</div>
                  </div>
                </div>
              }
            </div>
          </div>
        }
      </form>
      <ng-template pTemplate="footer">
        <div class="flex justify-between w-full">
          <div>
            @if (editId && actForm.value.activityType === 'TASK' && actForm.value.taskStatus === 'CLOSED') {
              <p-button label="Close & Add New" icon="pi pi-plus-circle" severity="success" [outlined]="true" [disabled]="actForm.invalid" (onClick)="closeAndAddNew()" />
            }
          </div>
          <div class="flex gap-2">
            <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="formVisible=false" />
            <p-button [label]="editId ? 'Update' : 'Create'" icon="pi pi-check" [disabled]="actForm.invalid" (onClick)="saveActivity()" />
          </div>
        </div>
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

  // Task panel
  taskGroups = signal<TaskGroup[]>([]);
  taskPanelLoading = signal(false);
  taskPanelTotal = signal(0);

  // Form state
  formVisible = false;
  editId: string | null = null;
  formError = '';
  formAssociations: Array<{ entityType: string; entityId: string }> = [];
  dateChanges = signal<DateChange[]>([]);

  // Options
  userOptions = signal<Ref[]>([]);
  contactOptions = signal<Ref[]>([]);
  categoryOptions = signal<LookupItem[]>([]);
  opportunityOptions = signal<Ref[]>([]);
  leadOptions = signal<Ref[]>([]);
  accountOptions = signal<Ref[]>([]);
  influencerOptions = signal<Ref[]>([]);
  projectOptions = signal<Ref[]>([]);
  initiativeOptions = signal<Ref[]>([]);

  activityTypes = ACTIVITY_TYPES;
  taskStatuses = TASK_STATUSES;
  entityTypes = ENTITY_TYPES;

  @ViewChild('calendar') calendarComponent!: FullCalendarComponent;

  private currentStart = '';
  private currentEnd = '';
  private currentViewType = 'dayGridMonth';

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
      right: 'dayGridMonth,timeGridWeek,timeGridDay',
    },
    editable: false,
    selectable: true,
    selectMirror: true,
    eventClick: (info: EventClickArg) => {
      const evId = info.event.id;
      if (evId.startsWith('travel_')) {
        const travelPlanId = evId.replace('travel_', '');
        this.router.navigate(['/work-area/travels', travelPlanId]);
        return;
      }
      this.openTaskDetail(evId);
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
      this.currentViewType = arg.view.type;
      if (this.viewReady) {
        this.loadEvents(arg.startStr, arg.endStr);
        this.loadTaskPanel(arg.startStr, arg.endStr);
      }
    },
    eventColor: '#3B82F6',
    height: 'auto',
    eventDidMount: (info) => {
      const isTask = info.event.extendedProps['activityType'] === 'TASK';
      const isClosed = info.event.extendedProps['taskStatus'] === 'CLOSED';

      // Tasks in week/day view: render as compact milestone markers instead of 1-hour blocks
      if (isTask && (info.view.type === 'timeGridWeek' || info.view.type === 'timeGridDay')) {
        const el = info.el as HTMLElement;
        const textColor = isClosed ? '#9CA3AF' : '#374151';
        const accentColor = isClosed ? '#9CA3AF' : (info.event.backgroundColor || '#6B7280');
        el.style.cssText = `min-height:0; height:22px; border-radius:4px; border-left:3px solid ${accentColor}; background-color:${isClosed ? '#F3F4F6' : '#F8FAFC'}; color:${textColor}; font-size:11px; padding:2px 6px; overflow:hidden; display:flex; align-items:center; border-right:none; border-top:none; border-bottom:none;`;
        // Force text color on all inner elements (FullCalendar sets white by default)
        el.querySelectorAll('.fc-event-main, .fc-event-title, .fc-event-title-container').forEach((child) => {
          (child as HTMLElement).style.color = textColor;
        });
        // Remove the time label inside
        const timeEl = el.querySelector('.fc-event-time');
        if (timeEl) (timeEl as HTMLElement).style.display = 'none';
        // Add a diamond marker before the title
        const titleEl = el.querySelector('.fc-event-title');
        if (titleEl && !(titleEl as HTMLElement).dataset['marked']) {
          (titleEl as HTMLElement).dataset['marked'] = '1';
          (titleEl as HTMLElement).insertAdjacentHTML('beforebegin', '<span style="margin-right:4px;font-size:8px;color:' + accentColor + '">◆</span>');
        }
      }

      // Strikethrough for closed tasks (all views)
      if (isClosed) {
        const titleEl = info.el.querySelector('.fc-event-title, .fc-event-title-container, .fc-list-event-title');
        if (titleEl) {
          (titleEl as HTMLElement).style.textDecoration = 'line-through';
          (titleEl as HTMLElement).style.opacity = '0.6';
        } else {
          info.el.style.textDecoration = 'line-through';
          info.el.style.opacity = '0.6';
        }
      }
    },
  };

  private viewReady = false;

  ngOnInit(): void {
    this.loadOptions();
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    if (this.currentStart && this.currentEnd) {
      this.loadEvents(this.currentStart, this.currentEnd);
      this.loadTaskPanel(this.currentStart, this.currentEnd);
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
    this.http.get<{ data: Array<{ id: string; name: string }> }>(`${environment.apiBaseUrl}/projects?limit=200`).subscribe({
      next: (r) => this.projectOptions.set(r.data.map((p) => ({ id: p.id, name: p.name }))),
    });
    this.http.get<{ data: Array<{ id: string; title: string }> }>(`${environment.apiBaseUrl}/initiatives?limit=200`).subscribe({
      next: (r) => this.initiativeOptions.set(r.data.map((i) => ({ id: i.id, name: i.title }))),
    });
  }

  private loadEvents(start: string, end: string): void {
    let url = `${environment.apiBaseUrl}/activities/calendar?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
    if (this.showMine) url += '&mine=true';
    this.http.get<{ data: CalendarEvent[] }>(url).subscribe({
      next: (r) => {
        const calApi = this.calendarComponent?.getApi();
        if (!calApi) return;
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
    });
  }

  private loadTaskPanel(start: string, end: string): void {
    this.taskPanelLoading.set(true);
    let url = `${environment.apiBaseUrl}/activities/calendar-tasks?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
    if (this.showMine) url += '&mine=true';
    this.http.get<{ data: { overdue: FullActivity[]; range: FullActivity[] } }>(url).subscribe({
      next: (r) => {
        const groups = this.buildTaskGroups(r.data.overdue, r.data.range, start, end);
        this.taskGroups.set(groups);
        this.taskPanelTotal.set(groups.reduce((sum, g) => sum + g.items.length, 0));
        this.taskPanelLoading.set(false);
      },
      error: () => this.taskPanelLoading.set(false),
    });
  }

  private buildTaskGroups(overdue: FullActivity[], range: FullActivity[], _startStr: string, _endStr: string): TaskGroup[] {
    const groups: TaskGroup[] = [];

    // Overdue
    if (overdue.length > 0) {
      groups.push({ label: 'Overdue', key: 'overdue', items: overdue, collapsed: false });
    }

    // Date boundaries
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const dayAfterTomorrow = new Date(today);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);

    // End of this week: next Sunday at 00:00 (week starts Monday)
    const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon...
    const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
    const endOfThisWeek = new Date(today);
    endOfThisWeek.setDate(endOfThisWeek.getDate() + daysUntilSunday + 1); // Monday after this week

    // End of next week: the Monday after next week
    const endOfNextWeek = new Date(endOfThisWeek);
    endOfNextWeek.setDate(endOfNextWeek.getDate() + 7);

    // Buckets
    const todayItems: FullActivity[] = [];
    const tomorrowItems: FullActivity[] = [];
    const thisWeekItems: FullActivity[] = [];
    const nextWeekItems: FullActivity[] = [];
    const plannedItems: FullActivity[] = [];

    for (const item of range) {
      const dateStr = item.activityType === 'TASK' ? item.dueDateTime : item.startDateTime;
      if (!dateStr) continue;

      const d = new Date(dateStr);
      d.setHours(0, 0, 0, 0);

      if (d.getTime() === today.getTime()) {
        todayItems.push(item);
      } else if (d.getTime() === tomorrow.getTime()) {
        tomorrowItems.push(item);
      } else if (d >= dayAfterTomorrow && d < endOfThisWeek) {
        thisWeekItems.push(item);
      } else if (d >= endOfThisWeek && d < endOfNextWeek) {
        nextWeekItems.push(item);
      } else if (d >= endOfNextWeek) {
        plannedItems.push(item);
      }
      // Items before today but in range are already covered by overdue from API
    }

    if (todayItems.length > 0) {
      groups.push({ label: 'Today', key: 'today', items: todayItems, collapsed: false });
    }
    if (tomorrowItems.length > 0) {
      groups.push({ label: 'Tomorrow', key: 'tomorrow', items: tomorrowItems, collapsed: false });
    }
    if (thisWeekItems.length > 0) {
      groups.push({ label: 'This Week', key: 'this-week', items: thisWeekItems, collapsed: false });
    }
    if (nextWeekItems.length > 0) {
      groups.push({ label: 'Next Week', key: 'next-week', items: nextWeekItems, collapsed: false });
    }
    if (plannedItems.length > 0) {
      groups.push({ label: 'Planned', key: 'planned', items: plannedItems, collapsed: true });
    }

    return groups;
  }

  private reloadAll(): void {
    if (this.currentStart && this.currentEnd) {
      this.loadEvents(this.currentStart, this.currentEnd);
      this.loadTaskPanel(this.currentStart, this.currentEnd);
    }
  }

  toggleMine(val: boolean): void {
    this.showMine = val;
    this.reloadAll();
  }

  // --- Task panel ---

  openTaskDetail(id: string): void {
    this.detailLoading = true;
    this.selectedActivity.set(null);
    this.detailVisible = true;
    this.http.get<{ data: FullActivity }>(`${environment.apiBaseUrl}/activities/${id}`).subscribe({
      next: (r) => { this.selectedActivity.set(r.data); this.detailLoading = false; },
      error: () => { this.detailLoading = false; },
    });
  }

  getCategoryColor(code: string): string {
    return CATEGORY_COLORS[code] ?? '#6B7280';
  }

  formatTaskTime(iso: string): string {
    const d = new Date(iso);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const itemDate = new Date(d);
    itemDate.setHours(0, 0, 0, 0);

    if (itemDate.getTime() === today.getTime()) {
      return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) +
      ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }

  // --- Create / Edit ---

  openCreateDialog(date?: Date, allDay?: boolean): void {
    this.editId = null;
    this.formError = '';
    this.formAssociations = [];
    const now = date ?? new Date();
    const end = new Date(now.getTime() + 60 * 60 * 1000);

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
    this.dateChanges.set([]);
    this.loadDateChanges(a.id);
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
            this.reloadAll();
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
        this.reloadAll();
        this.msg.add({ severity: 'success', summary: 'Saved', detail: `Activity ${this.editId ? 'updated' : 'created'}` });
      },
      error: (err: HttpErrorResponse) => {
        this.formError = err.error?.error?.message ?? 'An error occurred';
      },
    });
  }

  closeAndAddNew(): void {
    if (this.actForm.invalid || !this.editId) return;

    const v = this.actForm.value;
    const carryCategory = v.categoryCode ?? '';
    const carryUserId = v.userId ?? '';
    const carryContacts = v.contactIds ?? [];
    const carryAssociations = this.formAssociations.map((a) => ({ ...a }));

    this.actForm.patchValue({ taskStatus: 'CLOSED' });
    const body: Record<string, unknown> = {
      activityType: v.activityType, subject: v.subject,
      description: v.description || undefined,
      categoryCode: v.categoryCode, userId: v.userId,
      isAllDay: v.isAllDay ?? false, contactIds: v.contactIds ?? [],
      associations: this.formAssociations.filter((a) => a.entityType && a.entityId),
      dueDateTime: v.dueDateTime instanceof Date ? v.dueDateTime.toISOString() : v.dueDateTime,
      taskStatus: 'CLOSED',
    };

    this.http.patch(`${environment.apiBaseUrl}/activities/${this.editId}`, body).subscribe({
      next: () => {
        this.msg.add({ severity: 'success', summary: 'Closed', detail: 'Activity closed. Fill in subject & due date for the new activity.' });
        this.reloadAll();

        this.editId = null;
        this.formError = '';
        this.actForm.reset();
        this.actForm.patchValue({
          activityType: 'TASK',
          isAllDay: false,
          taskStatus: 'OPEN',
          categoryCode: carryCategory,
          userId: carryUserId,
          contactIds: carryContacts,
        });
        this.formAssociations = carryAssociations;
        this.actForm.markAsDirty();
      },
      error: (err: HttpErrorResponse) => {
        this.formError = err.error?.error?.message ?? 'Failed to close activity';
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
      case 'PROJECT': return this.projectOptions();
      case 'INITIATIVE': return this.initiativeOptions();
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

  private loadDateChanges(activityId: string): void {
    this.http.get<{ data: DateChange[] }>(`${environment.apiBaseUrl}/activities/${activityId}/date-changes`).subscribe({
      next: (r) => this.dateChanges.set(r.data),
      error: () => {},
    });
  }

  dateFieldLabel(field: string): string {
    switch (field) {
      case 'startDateTime': return 'Start Date';
      case 'endDateTime': return 'End Date';
      case 'dueDateTime': return 'Due Date';
      default: return field;
    }
  }
}
