import { Component, OnInit, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormControl, FormArray, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonBackButton,
  IonButtons,
  IonButton,
  IonIcon,
  IonLabel,
  IonList,
  IonItem,
  IonInput,
  IonTextarea,
  IonSelect,
  IonSelectOption,
  IonDatetime,
  IonDatetimeButton,
  IonModal,
  IonToggle,
  IonSegment,
  IonSegmentButton,
  IonNote,
  IonSpinner,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  saveOutline,
  addCircleOutline,
  trashOutline,
  closeCircleOutline,
} from 'ionicons/icons';
import { ActivityService } from '../../core/services/activity.service';
import { LookupService } from '../../core/services/lookup.service';

addIcons({ saveOutline, addCircleOutline, trashOutline, closeCircleOutline });

interface Activity {
  id: string;
  activityType: 'EVENT' | 'TASK';
  subject: string;
  description: string | null;
  categoryCode: string;
  userId: string;
  userName: string | null;
  startDateTime: string | null;
  endDateTime: string | null;
  isAllDay: boolean;
  dueDateTime: string | null;
  taskStatus: 'OPEN' | 'OVERDUE' | 'CLOSED' | null;
  associations: { id: string; entityType: string; entityId: string; entityName: string | null }[];
  contacts: { id: string; name: string }[];
  createdAt: string;
  updatedAt: string;
}

interface AssociationRow {
  entityType: FormControl<string>;
  entityId: FormControl<string>;
}

@Component({
  selector: 'app-activity-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonBackButton,
    IonButtons,
    IonButton,
    IonIcon,
    IonLabel,
    IonList,
    IonItem,
    IonInput,
    IonTextarea,
    IonSelect,
    IonSelectOption,
    IonDatetime,
    IonDatetimeButton,
    IonModal,
    IonToggle,
    IonSegment,
    IonSegmentButton,
    IonNote,
    IonSpinner,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start">
          <ion-back-button [defaultHref]="isEdit() ? '/tabs/activities/' + activityId() : '/tabs/activities'"></ion-back-button>
        </ion-buttons>
        <ion-title>{{ isEdit() ? 'Edit Activity' : 'New Activity' }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="save()" [disabled]="saving() || form.invalid">
            <ion-icon slot="icon-only" name="save-outline"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      @if (loadingEdit()) {
        <div class="ion-text-center ion-padding">
          <ion-spinner name="crescent"></ion-spinner>
        </div>
      } @else {
        <!-- Activity Type Segment -->
        <ion-segment [value]="activityType()" (ionChange)="onTypeChange($event)" style="margin-bottom: 16px;">
          <ion-segment-button value="EVENT">Event</ion-segment-button>
          <ion-segment-button value="TASK">Task</ion-segment-button>
        </ion-segment>

        <form [formGroup]="form">
          <ion-list>
            <!-- Subject -->
            <ion-item>
              <ion-input
                label="Subject"
                labelPlacement="stacked"
                placeholder="Enter subject"
                formControlName="subject"
              ></ion-input>
            </ion-item>
            @if (form.controls['subject'].touched && form.controls['subject'].invalid) {
              <ion-note color="danger" style="padding-left: 16px;">Subject is required</ion-note>
            }

            <!-- Description -->
            <ion-item>
              <ion-textarea
                label="Description"
                labelPlacement="stacked"
                placeholder="Enter description"
                formControlName="description"
                [autoGrow]="true"
                [rows]="3"
              ></ion-textarea>
            </ion-item>

            <!-- Category -->
            <ion-item>
              <ion-select
                label="Category"
                labelPlacement="stacked"
                placeholder="Select category"
                formControlName="categoryCode"
                interface="action-sheet"
              >
                @for (cat of categories(); track $index) {
                  <ion-select-option [value]="cat.code">{{ cat.label }}</ion-select-option>
                }
              </ion-select>
            </ion-item>
            @if (form.controls['categoryCode'].touched && form.controls['categoryCode'].invalid) {
              <ion-note color="danger" style="padding-left: 16px;">Category is required</ion-note>
            }

            <!-- EVENT fields -->
            @if (activityType() === 'EVENT') {
              <ion-item>
                <ion-toggle formControlName="isAllDay" labelPlacement="start">All Day</ion-toggle>
              </ion-item>

              <ion-item>
                <ion-label>Start Date/Time</ion-label>
                <ion-datetime-button datetime="startPicker"></ion-datetime-button>
              </ion-item>
              <ion-modal [keepContentsMounted]="true">
                <ng-template>
                  <ion-datetime
                    id="startPicker"
                    [presentation]="form.value.isAllDay ? 'date' : 'date-time'"
                    formControlName="startDateTime"
                  ></ion-datetime>
                </ng-template>
              </ion-modal>

              <ion-item>
                <ion-label>End Date/Time</ion-label>
                <ion-datetime-button datetime="endPicker"></ion-datetime-button>
              </ion-item>
              <ion-modal [keepContentsMounted]="true">
                <ng-template>
                  <ion-datetime
                    id="endPicker"
                    [presentation]="form.value.isAllDay ? 'date' : 'date-time'"
                    formControlName="endDateTime"
                  ></ion-datetime>
                </ng-template>
              </ion-modal>
            }

            <!-- TASK fields -->
            @if (activityType() === 'TASK') {
              <ion-item>
                <ion-label>Due Date/Time</ion-label>
                <ion-datetime-button datetime="duePicker"></ion-datetime-button>
              </ion-item>
              <ion-modal [keepContentsMounted]="true">
                <ng-template>
                  <ion-datetime
                    id="duePicker"
                    presentation="date-time"
                    formControlName="dueDateTime"
                  ></ion-datetime>
                </ng-template>
              </ion-modal>

              @if (isEdit()) {
                <ion-item>
                  <ion-select
                    label="Status"
                    labelPlacement="stacked"
                    formControlName="taskStatus"
                    interface="action-sheet"
                  >
                    <ion-select-option value="OPEN">Open</ion-select-option>
                    <ion-select-option value="OVERDUE">Overdue</ion-select-option>
                    <ion-select-option value="CLOSED">Closed</ion-select-option>
                  </ion-select>
                </ion-item>
              }
            }

            <!-- Contacts -->
            <ion-item>
              <ion-select
                label="Contacts"
                labelPlacement="stacked"
                placeholder="Select contacts"
                formControlName="contactIds"
                [multiple]="true"
                interface="alert"
              >
                @for (contact of contactOptions(); track $index) {
                  <ion-select-option [value]="contact.id">{{ contact.name }}</ion-select-option>
                }
              </ion-select>
            </ion-item>
          </ion-list>

          <!-- Associations -->
          <div style="margin-top: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 0 16px;">
              <h3 style="font-weight: 600; margin: 0;">Associations</h3>
              <ion-button fill="clear" size="small" (click)="addAssociation()">
                <ion-icon slot="start" name="add-circle-outline"></ion-icon>
                Add
              </ion-button>
            </div>
            <ion-list>
              @for (assoc of associations.controls; track $index; let i = $index) {
                <ion-item>
                  <ion-select
                    label="Type"
                    labelPlacement="stacked"
                    [formControl]="getAssocTypeControl(i)"
                    interface="action-sheet"
                    style="flex: 1;"
                  >
                    <ion-select-option value="ACCOUNT">Account</ion-select-option>
                    <ion-select-option value="OPPORTUNITY">Opportunity</ion-select-option>
                    <ion-select-option value="PROJECT">Project</ion-select-option>
                  </ion-select>
                  <ion-input
                    label="Entity ID"
                    labelPlacement="stacked"
                    placeholder="Enter entity ID"
                    [formControl]="getAssocIdControl(i)"
                    style="flex: 1;"
                  ></ion-input>
                  <ion-button slot="end" fill="clear" color="danger" (click)="removeAssociation(i)">
                    <ion-icon slot="icon-only" name="close-circle-outline"></ion-icon>
                  </ion-button>
                </ion-item>
              }
            </ion-list>
          </div>
        </form>

        <!-- Save Button -->
        <div style="padding: 16px;">
          <ion-button
            expand="block"
            (click)="save()"
            [disabled]="saving() || form.invalid"
          >
            @if (saving()) {
              <ion-spinner name="crescent" style="margin-right: 8px;"></ion-spinner>
            }
            {{ isEdit() ? 'Update Activity' : 'Create Activity' }}
          </ion-button>
        </div>
      }
    </ion-content>
  `,
})
export class ActivityFormPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly activityService = inject(ActivityService);
  private readonly lookupService = inject(LookupService);
  private readonly toastCtrl = inject(ToastController);

  readonly isEdit = signal(false);
  readonly activityId = signal('');
  readonly activityType = signal<'EVENT' | 'TASK'>('TASK');
  readonly saving = signal(false);
  readonly loadingEdit = signal(false);
  readonly categories = signal<{ code: string; label: string }[]>([]);
  readonly contactOptions = signal<{ id: string; name: string }[]>([]);

  readonly form = this.fb.group({
    subject: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    description: new FormControl('', { nonNullable: true }),
    categoryCode: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    isAllDay: new FormControl(false, { nonNullable: true }),
    startDateTime: new FormControl('', { nonNullable: true }),
    endDateTime: new FormControl('', { nonNullable: true }),
    dueDateTime: new FormControl('', { nonNullable: true }),
    taskStatus: new FormControl<'OPEN' | 'OVERDUE' | 'CLOSED'>('OPEN', { nonNullable: true }),
    contactIds: new FormControl<string[]>([], { nonNullable: true }),
    associations: this.fb.array<FormGroup<AssociationRow>>([]),
  });

  get associations(): FormArray<FormGroup<AssociationRow>> {
    return this.form.controls.associations;
  }

  ngOnInit(): void {
    // Load lookup data
    this.lookupService.loadAll().subscribe({
      next: () => {
        const cats = this.lookupService.categoryOptions() as { code: string; label: string }[];
        this.categories.set(cats);
        const contacts = this.lookupService.contacts() as { id: string; name: string }[];
        this.contactOptions.set(contacts);
      },
    });

    // Check if edit mode
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.isEdit.set(true);
      this.activityId.set(id);
      this.loadActivity(id);
    }
  }

  private loadActivity(id: string): void {
    this.loadingEdit.set(true);
    this.activityService.getById(id).subscribe({
      next: (res: unknown) => {
        const result = res as { data: Activity };
        const a = result.data;
        this.activityType.set(a.activityType);
        this.form.patchValue({
          subject: a.subject,
          description: a.description ?? '',
          categoryCode: a.categoryCode,
          isAllDay: a.isAllDay,
          startDateTime: a.startDateTime ? toLocalDate(a.startDateTime) : '',
          endDateTime: a.endDateTime ? toLocalDate(a.endDateTime) : '',
          dueDateTime: a.dueDateTime ? toLocalDate(a.dueDateTime) : '',
          taskStatus: a.taskStatus ?? 'OPEN',
          contactIds: a.contacts.map((c) => c.id),
        });
        // Load associations
        this.associations.clear();
        for (const assoc of a.associations) {
          this.associations.push(
            this.fb.group({
              entityType: new FormControl(assoc.entityType, { nonNullable: true }),
              entityId: new FormControl(assoc.entityId, { nonNullable: true }),
            })
          );
        }
        this.loadingEdit.set(false);
      },
      error: () => {
        this.loadingEdit.set(false);
      },
    });
  }

  onTypeChange(event: CustomEvent): void {
    this.activityType.set(event.detail.value as 'EVENT' | 'TASK');
  }

  addAssociation(): void {
    this.associations.push(
      this.fb.group({
        entityType: new FormControl('ACCOUNT', { nonNullable: true }),
        entityId: new FormControl('', { nonNullable: true }),
      })
    );
  }

  removeAssociation(index: number): void {
    this.associations.removeAt(index);
  }

  getAssocTypeControl(index: number): FormControl<string> {
    return this.associations.at(index).controls.entityType;
  }

  getAssocIdControl(index: number): FormControl<string> {
    return this.associations.at(index).controls.entityId;
  }

  async save(): Promise<void> {
    if (this.form.invalid) return;
    this.saving.set(true);

    const v = this.form.getRawValue();
    const body: Record<string, unknown> = {
      activityType: this.activityType(),
      subject: v.subject,
      description: v.description || null,
      categoryCode: v.categoryCode,
      contactIds: v.contactIds,
      associations: v.associations
        .filter((a) => a.entityId)
        .map((a) => ({ entityType: a.entityType, entityId: a.entityId })),
    };

    if (this.activityType() === 'EVENT') {
      body['isAllDay'] = v.isAllDay;
      body['startDateTime'] = v.startDateTime || null;
      body['endDateTime'] = v.endDateTime || null;
    } else {
      body['dueDateTime'] = v.dueDateTime || null;
      if (this.isEdit()) {
        body['taskStatus'] = v.taskStatus;
      }
    }

    const action$ = this.isEdit()
      ? this.activityService.update(this.activityId(), body)
      : this.activityService.create(body);

    action$.subscribe({
      next: async () => {
        this.saving.set(false);
        const toast = await this.toastCtrl.create({
          message: this.isEdit() ? 'Activity updated' : 'Activity created',
          duration: 2000,
          color: 'success',
          position: 'bottom',
        });
        await toast.present();
        this.router.navigate(['/tabs/activities']);
      },
      error: async () => {
        this.saving.set(false);
        const toast = await this.toastCtrl.create({
          message: 'Failed to save activity',
          duration: 3000,
          color: 'danger',
          position: 'bottom',
        });
        await toast.present();
      },
    });
  }
}

/** Convert ISO datetime string to local format for ion-datetime */
function toLocalDate(iso: string): string {
  const d = new Date(iso);
  // Return ISO string without timezone offset for ion-datetime
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
