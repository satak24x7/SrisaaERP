import { Component, OnInit, inject, signal, computed } from '@angular/core';
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
  IonBadge,
  IonSegment,
  IonSegmentButton,
  IonRefresher,
  IonRefresherContent,
  IonFab,
  IonFabButton,
  IonIcon,
  IonSpinner,
  IonChip,
  IonNote,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addOutline } from 'ionicons/icons';
import { TravelPlanService } from '../../core/services/travel-plan.service';

addIcons({ addOutline });

interface TravelPlanSummary {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  status: string;
  leadTravellerName: string | null;
  advanceAmountPaise: number;
  reimbursementAmountPaise: number;
}

const STATUS_LIST = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'COMPLETED'] as const;

@Component({
  selector: 'app-travel-list',
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
    IonBadge,
    IonSegment,
    IonSegmentButton,
    IonRefresher,
    IonRefresherContent,
    IonFab,
    IonFabButton,
    IonIcon,
    IonSpinner,
    IonChip,
    IonNote,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
  ],
  styles: [
    `
      .status-chips {
        display: flex;
        overflow-x: auto;
        padding: 8px 16px;
        gap: 6px;
      }

      .status-chips ion-chip {
        flex-shrink: 0;
      }

      .travel-card {
        margin: 8px 16px;
      }

      .travel-dates {
        font-size: 13px;
        color: var(--ion-color-medium);
      }

      .travel-amount {
        font-size: 15px;
        font-weight: 600;
        color: var(--ion-color-primary);
      }

      .card-top-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
    `,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Travel Plans</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment [value]="viewMode()" (ionChange)="onViewChange($event)">
          <ion-segment-button value="my">My</ion-segment-button>
          <ion-segment-button value="all">All</ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-refresher slot="fixed" (ionRefresh)="doRefresh($event)">
        <ion-refresher-content></ion-refresher-content>
      </ion-refresher>

      <div class="status-chips">
        <ion-chip
          [color]="activeStatus() === null ? 'primary' : 'medium'"
          (click)="filterStatus(null)"
        >
          All
        </ion-chip>
        @for (s of statuses; track s) {
          <ion-chip
            [color]="activeStatus() === s ? 'primary' : 'medium'"
            (click)="filterStatus(s)"
          >
            {{ s }}
          </ion-chip>
        }
      </div>

      @if (loading()) {
        <div class="ion-text-center ion-padding">
          <ion-spinner name="crescent"></ion-spinner>
        </div>
      } @else if (filteredPlans().length === 0) {
        <div class="ion-text-center ion-padding" style="color: var(--ion-color-medium)">
          <p>No travel plans found.</p>
        </div>
      } @else {
        @for (plan of filteredPlans(); track plan.id) {
          <ion-card class="travel-card" button (click)="openDetail(plan.id)">
            <ion-card-header>
              <div class="card-top-row">
                <ion-card-title style="font-size: 16px">{{ plan.title }}</ion-card-title>
                <ion-badge [color]="statusColor(plan.status)">{{ plan.status }}</ion-badge>
              </div>
            </ion-card-header>
            <ion-card-content>
              <p class="travel-dates">
                {{ plan.startDate | date : 'dd MMM' }} - {{ plan.endDate | date : 'dd MMM yyyy' }}
              </p>
              @if (plan.leadTravellerName) {
                <p style="font-size: 13px">{{ plan.leadTravellerName }}</p>
              }
              <p class="travel-amount">
                &#8377;{{ totalAmount(plan) | number : '1.0-0' }}
              </p>
            </ion-card-content>
          </ion-card>
        }
      }

      <ion-fab slot="fixed" vertical="bottom" horizontal="end">
        <ion-fab-button (click)="createNew()">
          <ion-icon name="add-outline"></ion-icon>
        </ion-fab-button>
      </ion-fab>
    </ion-content>
  `,
})
export class TravelListPage implements OnInit {
  private readonly travelService = inject(TravelPlanService);
  private readonly router = inject(Router);

  readonly statuses = STATUS_LIST;
  readonly viewMode = signal<'my' | 'all'>('my');
  readonly activeStatus = signal<string | null>(null);
  readonly loading = signal(false);
  readonly plans = signal<TravelPlanSummary[]>([]);

  readonly filteredPlans = computed(() => {
    const status = this.activeStatus();
    const list = this.plans();
    if (!status) return list;
    return list.filter((p) => p.status === status);
  });

  ngOnInit(): void {
    this.loadPlans();
  }

  onViewChange(event: CustomEvent): void {
    this.viewMode.set(event.detail.value);
    this.loadPlans();
  }

  filterStatus(status: string | null): void {
    this.activeStatus.set(status);
  }

  doRefresh(event: CustomEvent): void {
    this.loadPlans(() => {
      (event.target as HTMLIonRefresherElement).complete();
    });
  }

  openDetail(id: string): void {
    this.router.navigate(['/tabs/travels', id]);
  }

  createNew(): void {
    this.router.navigate(['/tabs/travels/new']);
  }

  totalAmount(plan: TravelPlanSummary): number {
    return (plan.advanceAmountPaise + plan.reimbursementAmountPaise) / 100;
  }

  statusColor(status: string): string {
    switch (status) {
      case 'DRAFT':
        return 'medium';
      case 'SUBMITTED':
        return 'warning';
      case 'APPROVED':
        return 'success';
      case 'REJECTED':
        return 'danger';
      case 'COMPLETED':
        return 'primary';
      default:
        return 'medium';
    }
  }

  private loadPlans(done?: () => void): void {
    this.loading.set(true);
    const mine = this.viewMode() === 'my' ? true : undefined;
    this.travelService.list({ mine }).subscribe({
      next: (res: unknown) => {
        const payload = res as { data?: TravelPlanSummary[] };
        this.plans.set(payload.data ?? []);
        this.loading.set(false);
        done?.();
      },
      error: () => {
        this.plans.set([]);
        this.loading.set(false);
        done?.();
      },
    });
  }
}
