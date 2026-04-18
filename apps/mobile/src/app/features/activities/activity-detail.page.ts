import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonButton,
  IonIcon,
  IonBadge,
  IonChip,
  IonLabel,
  IonList,
  IonItem,
  IonNote,
  IonSpinner,
  AlertController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  createOutline,
  trashOutline,
  checkmarkCircleOutline,
  calendarOutline,
  checkboxOutline,
  personOutline,
  linkOutline,
  businessOutline,
  briefcaseOutline,
  cashOutline,
  timeOutline,
  arrowBackOutline,
} from 'ionicons/icons';
import { ActivityService } from '../../core/services/activity.service';

addIcons({
  createOutline,
  trashOutline,
  checkmarkCircleOutline,
  calendarOutline,
  checkboxOutline,
  personOutline,
  linkOutline,
  businessOutline,
  briefcaseOutline,
  cashOutline,
  timeOutline,
  arrowBackOutline,
});

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

@Component({
  selector: 'app-activity-detail',
  standalone: true,
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonButton,
    IonIcon,
    IonBadge,
    IonChip,
    IonLabel,
    IonList,
    IonItem,
    IonNote,
    IonSpinner,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start">
          <ion-button (click)="goBack()">
            <ion-icon slot="icon-only" name="arrow-back-outline"></ion-icon>
          </ion-button>
        </ion-buttons>
        <ion-title>{{ activity()?.subject ?? 'Activity' }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      @if (loading()) {
        <div class="ion-text-center ion-padding">
          <ion-spinner name="crescent"></ion-spinner>
        </div>
      }

      @if (activity(); as a) {
        <!-- Type & Category -->
        <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 16px;">
          <ion-chip [color]="a.activityType === 'EVENT' ? 'tertiary' : 'primary'">
            <ion-icon [name]="a.activityType === 'EVENT' ? 'calendar-outline' : 'checkbox-outline'"></ion-icon>
            <ion-label>{{ a.activityType }}</ion-label>
          </ion-chip>
          @if (a.categoryCode) {
            <ion-chip color="medium">
              <ion-label>{{ a.categoryCode }}</ion-label>
            </ion-chip>
          }
          @if (a.activityType === 'TASK' && a.taskStatus) {
            <ion-badge [color]="getStatusColor(a.taskStatus)">
              {{ a.taskStatus }}
            </ion-badge>
          }
        </div>

        <!-- Description -->
        @if (a.description) {
          <p style="margin-bottom: 16px; color: var(--ion-text-color);">{{ a.description }}</p>
        }

        <!-- Date/Time Details -->
        <ion-list>
          @if (a.activityType === 'EVENT') {
            @if (a.startDateTime) {
              <ion-item>
                <ion-icon name="time-outline" slot="start" color="tertiary"></ion-icon>
                <ion-label>
                  <h3>Start</h3>
                  <p>{{ formatDateTime(a.startDateTime, a.isAllDay) }}</p>
                </ion-label>
              </ion-item>
            }
            @if (a.endDateTime) {
              <ion-item>
                <ion-icon name="time-outline" slot="start" color="tertiary"></ion-icon>
                <ion-label>
                  <h3>End</h3>
                  <p>{{ formatDateTime(a.endDateTime, a.isAllDay) }}</p>
                </ion-label>
              </ion-item>
            }
            @if (a.isAllDay) {
              <ion-item>
                <ion-icon name="calendar-outline" slot="start" color="tertiary"></ion-icon>
                <ion-label>All Day Event</ion-label>
              </ion-item>
            }
          }
          @if (a.activityType === 'TASK' && a.dueDateTime) {
            <ion-item>
              <ion-icon name="time-outline" slot="start" color="primary"></ion-icon>
              <ion-label>
                <h3>Due Date</h3>
                <p>{{ formatDateTime(a.dueDateTime, false) }}</p>
              </ion-label>
            </ion-item>
          }
          @if (a.userName) {
            <ion-item>
              <ion-icon name="person-outline" slot="start" color="medium"></ion-icon>
              <ion-label>
                <h3>Assigned To</h3>
                <p>{{ a.userName }}</p>
              </ion-label>
            </ion-item>
          }
        </ion-list>

        <!-- Associations -->
        @if (a.associations.length > 0) {
          <h3 style="margin: 16px 0 8px; font-weight: 600; color: var(--ion-text-color);">Associations</h3>
          <ion-list>
            @for (assoc of a.associations; track assoc.id) {
              <ion-item>
                <ion-icon [name]="getEntityIcon(assoc.entityType)" slot="start" color="medium"></ion-icon>
                <ion-label>
                  <h3>{{ assoc.entityName ?? assoc.entityId }}</h3>
                  <p>{{ assoc.entityType }}</p>
                </ion-label>
              </ion-item>
            }
          </ion-list>
        }

        <!-- Contacts -->
        @if (a.contacts.length > 0) {
          <h3 style="margin: 16px 0 8px; font-weight: 600; color: var(--ion-text-color);">Contacts</h3>
          <ion-list>
            @for (contact of a.contacts; track contact.id) {
              <ion-item>
                <ion-icon name="person-outline" slot="start" color="medium"></ion-icon>
                <ion-label>{{ contact.name }}</ion-label>
              </ion-item>
            }
          </ion-list>
        }

        <!-- Timestamps -->
        <ion-list style="margin-top: 16px;">
          <ion-item>
            <ion-note slot="start">Created</ion-note>
            <ion-label class="ion-text-end">{{ formatTimestamp(a.createdAt) }}</ion-label>
          </ion-item>
          <ion-item>
            <ion-note slot="start">Updated</ion-note>
            <ion-label class="ion-text-end">{{ formatTimestamp(a.updatedAt) }}</ion-label>
          </ion-item>
        </ion-list>
      }
    </ion-content>

    @if (activity(); as a) {
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button (click)="editActivity()">
            <ion-icon slot="start" name="create-outline"></ion-icon>
            Edit
          </ion-button>
        </ion-buttons>
        @if (a.activityType === 'TASK' && a.taskStatus !== 'CLOSED') {
          <ion-button (click)="completeTask()" color="success" fill="solid" expand="block"
                      style="margin: 0 8px;">
            <ion-icon slot="start" name="checkmark-circle-outline"></ion-icon>
            Complete
          </ion-button>
        }
        <ion-buttons slot="end">
          <ion-button (click)="deleteActivity()" color="danger">
            <ion-icon slot="start" name="trash-outline"></ion-icon>
            Delete
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    }
  `,
})
export class ActivityDetailPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly activityService = inject(ActivityService);
  private readonly alertCtrl = inject(AlertController);

  readonly activity = signal<Activity | null>(null);
  readonly loading = signal(false);

  goBack(): void {
    this.location.back();
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadActivity(id);
    }
  }

  private loadActivity(id: string): void {
    this.loading.set(true);
    this.activityService.getById(id).subscribe({
      next: (res: unknown) => {
        const result = res as { data: Activity };
        this.activity.set(result.data);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  editActivity(): void {
    const a = this.activity();
    if (a) {
      this.router.navigate(['/tabs/activities', a.id, 'edit']);
    }
  }

  completeTask(): void {
    const a = this.activity();
    if (a) {
      this.activityService.update(a.id, { taskStatus: 'CLOSED' }).subscribe({
        next: () => this.loadActivity(a.id),
      });
    }
  }

  async deleteActivity(): Promise<void> {
    const a = this.activity();
    if (!a) return;

    const alert = await this.alertCtrl.create({
      header: 'Delete Activity',
      message: 'Are you sure you want to delete this activity?',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          role: 'destructive',
          handler: () => {
            this.activityService.delete(a.id).subscribe({
              next: () => this.router.navigate(['/tabs/activities']),
            });
          },
        },
      ],
    });
    await alert.present();
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'OPEN':
        return 'primary';
      case 'OVERDUE':
        return 'danger';
      case 'CLOSED':
        return 'success';
      default:
        return 'medium';
    }
  }

  getEntityIcon(entityType: string): string {
    switch (entityType) {
      case 'ACCOUNT':
        return 'business-outline';
      case 'OPPORTUNITY':
        return 'briefcase-outline';
      case 'PROJECT':
        return 'briefcase-outline';
      case 'EXPENSE':
        return 'cash-outline';
      default:
        return 'link-outline';
    }
  }

  formatDateTime(dateStr: string, allDay: boolean): string {
    const d = new Date(dateStr);
    return allDay
      ? d.toLocaleDateString()
      : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  }

  formatTimestamp(dateStr: string): string {
    return new Date(dateStr).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  }
}
