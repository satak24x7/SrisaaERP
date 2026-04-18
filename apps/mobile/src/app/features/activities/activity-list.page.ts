import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonIcon,
  IonBadge,
  IonFab,
  IonFabButton,
  IonRefresher,
  IonRefresherContent,
  IonItemSliding,
  IonItemOptions,
  IonItemOption,
  IonSpinner,
  IonSegment,
  IonSegmentButton,
  IonToggle,
  IonButtons,
  AlertController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  calendarOutline,
  checkboxOutline,
  addOutline,
  checkmarkCircleOutline,
  trashOutline,
  personOutline,
} from 'ionicons/icons';
import { ActivityService } from '../../core/services/activity.service';

addIcons({
  calendarOutline,
  checkboxOutline,
  addOutline,
  checkmarkCircleOutline,
  trashOutline,
  personOutline,
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
  selector: 'app-activity-list',
  standalone: true,
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonIcon,
    IonBadge,
    IonFab,
    IonFabButton,
    IonRefresher,
    IonRefresherContent,
    IonItemSliding,
    IonItemOptions,
    IonItemOption,
    IonSpinner,
    IonSegment,
    IonSegmentButton,
    IonToggle,
    IonButtons,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-title>Activities</ion-title>
        <ion-buttons slot="end">
          <ion-toggle
            [checked]="myItems()"
            (ionChange)="toggleMyItems($event)"
            labelPlacement="start"
          >
            <ion-icon slot="start" name="person-outline" style="margin-right: 4px;"></ion-icon>
            My Items
          </ion-toggle>
        </ion-buttons>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment [value]="activeTab()" (ionChange)="onTabChange($event)">
          <ion-segment-button value="all">All</ion-segment-button>
          <ion-segment-button value="open">Open</ion-segment-button>
          <ion-segment-button value="upcoming">Upcoming</ion-segment-button>
          <ion-segment-button value="completed">Completed</ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-refresher slot="fixed" (ionRefresh)="onRefresh($event)">
        <ion-refresher-content></ion-refresher-content>
      </ion-refresher>

      @if (loading()) {
        <div class="ion-text-center ion-padding">
          <ion-spinner name="crescent"></ion-spinner>
        </div>
      }

      @if (!loading() && activities().length === 0) {
        <div class="ion-text-center ion-padding" style="margin-top: 40px; color: var(--ion-color-medium);">
          <ion-icon name="checkbox-outline" style="font-size: 64px;"></ion-icon>
          <p>No activities found</p>
        </div>
      }

      <ion-list>
        @for (activity of sortedActivities(); track activity.id) {
          <ion-item-sliding>
            <ion-item [button]="true" (click)="openDetail(activity.id)" [style.background]="getRowBackground(activity)">
              <ion-icon
                slot="start"
                [name]="activity.activityType === 'EVENT' ? 'calendar-outline' : 'checkbox-outline'"
                [color]="activity.activityType === 'EVENT' ? 'tertiary' : 'primary'"
                style="font-size: 24px;"
              ></ion-icon>
              <ion-label>
                <h2 style="font-weight: 600;">{{ activity.subject }}</h2>
                <p>
                  {{ getDateDisplay(activity) }}
                  @if (activity.categoryCode) {
                    <span> &middot; {{ activity.categoryCode }}</span>
                  }
                  @if (isTomorrow(activity)) {
                    <span style="color: #b45309; font-weight: 600;"> &middot; Tomorrow</span>
                  }
                </p>
              </ion-label>
              @if (activity.activityType === 'TASK' && activity.taskStatus) {
                <ion-badge
                  slot="end"
                  [color]="getStatusColor(activity.taskStatus)"
                >
                  {{ activity.taskStatus }}
                </ion-badge>
              }
            </ion-item>

            <ion-item-options side="end">
              @if (activity.activityType === 'TASK' && activity.taskStatus !== 'CLOSED') {
                <ion-item-option color="success" (click)="completeTask(activity.id)">
                  <ion-icon slot="icon-only" name="checkmark-circle-outline"></ion-icon>
                </ion-item-option>
              }
              <ion-item-option color="danger" (click)="deleteActivity(activity.id)">
                <ion-icon slot="icon-only" name="trash-outline"></ion-icon>
              </ion-item-option>
            </ion-item-options>
          </ion-item-sliding>
        }
      </ion-list>

      <ion-fab vertical="bottom" horizontal="end" slot="fixed">
        <ion-fab-button (click)="navigateToNew()">
          <ion-icon name="add-outline"></ion-icon>
        </ion-fab-button>
      </ion-fab>
    </ion-content>
  `,
})
export class ActivityListPage implements OnInit {
  private readonly activityService = inject(ActivityService);
  private readonly router = inject(Router);
  private readonly alertCtrl = inject(AlertController);

  readonly activities = signal<Activity[]>([]);
  readonly loading = signal(false);
  readonly activeTab = signal('all');
  readonly myItems = signal(true);

  ngOnInit(): void {
    this.loadActivities();
  }

  loadActivities(): void {
    this.loading.set(true);
    const params: Record<string, string | boolean> = {};
    if (this.activeTab() !== 'all') {
      params['tab'] = this.activeTab();
    }
    if (this.myItems()) {
      params['mine'] = true;
    }
    this.activityService.list(params).subscribe({
      next: (res: unknown) => {
        const result = res as { data: Activity[] };
        this.activities.set(result.data ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  onTabChange(event: CustomEvent): void {
    this.activeTab.set(event.detail.value as string);
    this.loadActivities();
  }

  toggleMyItems(event: CustomEvent): void {
    this.myItems.set(event.detail.checked as boolean);
    this.loadActivities();
  }

  onRefresh(event: CustomEvent): void {
    this.activityService.list({
      tab: this.activeTab() !== 'all' ? this.activeTab() : undefined,
      mine: this.myItems() || undefined,
    }).subscribe({
      next: (res: unknown) => {
        const result = res as { data: Activity[] };
        this.activities.set(result.data ?? []);
        (event.target as HTMLIonRefresherElement).complete();
      },
      error: () => {
        (event.target as HTMLIonRefresherElement).complete();
      },
    });
  }

  openDetail(id: string): void {
    this.router.navigate(['/tabs/activities', id]);
  }

  navigateToNew(): void {
    this.router.navigate(['/tabs/activities/new']);
  }

  async completeTask(id: string): Promise<void> {
    this.activityService.update(id, { taskStatus: 'CLOSED' }).subscribe({
      next: () => this.loadActivities(),
    });
  }

  async deleteActivity(id: string): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Delete Activity',
      message: 'Are you sure you want to delete this activity?',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          role: 'destructive',
          handler: () => {
            this.activityService.delete(id).subscribe({
              next: () => this.loadActivities(),
            });
          },
        },
      ],
    });
    await alert.present();
  }

  getDateDisplay(activity: Activity): string {
    if (activity.activityType === 'EVENT') {
      if (activity.startDateTime) {
        const d = new Date(activity.startDateTime);
        return activity.isAllDay
          ? d.toLocaleDateString()
          : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
      }
      return '';
    }
    if (activity.dueDateTime) {
      return 'Due: ' + new Date(activity.dueDateTime).toLocaleDateString();
    }
    return '';
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

  getRowBackground(activity: Activity): string {
    const tab = this.activeTab();
    if (tab === 'open') {
      if (activity.taskStatus === 'OVERDUE') return '#fee2e2'; // red-100
      return '#ffffff'; // white for active/open
    }
    if (tab === 'upcoming' && this.isTomorrow(activity)) {
      return '#fef9c3'; // yellow-100
    }
    return '';
  }

  isTomorrow(activity: Activity): boolean {
    const dateStr = activity.activityType === 'EVENT' ? activity.startDateTime : activity.dueDateTime;
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return d.getFullYear() === tomorrow.getFullYear()
      && d.getMonth() === tomorrow.getMonth()
      && d.getDate() === tomorrow.getDate();
  }

  sortedActivities(): Activity[] {
    const list = this.activities();
    if (this.activeTab() === 'open') {
      // Overdue items first, then open
      return [...list].sort((a, b) => {
        const aOverdue = a.taskStatus === 'OVERDUE' ? 0 : 1;
        const bOverdue = b.taskStatus === 'OVERDUE' ? 0 : 1;
        return aOverdue - bOverdue;
      });
    }
    if (this.activeTab() === 'upcoming') {
      // Tomorrow items first, then rest sorted by date
      return [...list].sort((a, b) => {
        const aTomorrow = this.isTomorrow(a) ? 0 : 1;
        const bTomorrow = this.isTomorrow(b) ? 0 : 1;
        if (aTomorrow !== bTomorrow) return aTomorrow - bTomorrow;
        const aDate = a.activityType === 'EVENT' ? a.startDateTime : a.dueDateTime;
        const bDate = b.activityType === 'EVENT' ? b.startDateTime : b.dueDateTime;
        return (aDate ?? '').localeCompare(bDate ?? '');
      });
    }
    return list;
  }
}
