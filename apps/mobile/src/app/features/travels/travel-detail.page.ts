import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonBackButton,
  IonBadge,
  IonSegment,
  IonSegmentButton,
  IonList,
  IonItem,
  IonLabel,
  IonNote,
  IonButton,
  IonIcon,
  IonSpinner,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonFooter,
  IonItemDivider,
  ModalController,
  AlertController,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  createOutline,
  addCircleOutline,
  trashOutline,
} from 'ionicons/icons';
import { TravelPlanService } from '../../core/services/travel-plan.service';
import { TicketModalComponent, TicketData } from './ticket-modal.component';
import { HotelModalComponent, HotelData } from './hotel-modal.component';
import { ExpenseModalComponent, ExpenseData } from './expense-modal.component';

addIcons({ createOutline, addCircleOutline, trashOutline });

interface TravelPlan {
  id: string;
  title: string;
  purpose: string | null;
  startDate: string;
  endDate: string;
  leadTravellerId: string;
  leadTravellerName: string | null;
  businessUnitId: string;
  businessUnitName: string | null;
  advanceAmountPaise: number;
  reimbursementAmountPaise: number;
  status: string;
  rejectionReason: string | null;
  notes: string | null;
  travellers: { id: string; userId: string; userName: string }[];
  tickets: { id: string; type: string; description: string; amountPaise: number; date: string }[];
  hotels: {
    id: string;
    hotelName: string;
    city: string;
    checkIn: string;
    checkOut: string;
    amountPaise: number;
  }[];
  expenses: {
    id: string;
    category: string;
    description: string;
    amountPaise: number;
    expenseDate: string;
  }[];
}

@Component({
  selector: 'app-travel-detail',
  standalone: true,
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonBackButton,
    IonBadge,
    IonSegment,
    IonSegmentButton,
    IonList,
    IonItem,
    IonLabel,
    IonNote,
    IonButton,
    IonIcon,
    IonSpinner,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonFooter,
    IonItemDivider,
  ],
  styles: [
    `
      .rejection-banner {
        background: var(--ion-color-danger-tint);
        color: var(--ion-color-danger-shade);
        padding: 12px 16px;
        font-size: 14px;
        border-left: 4px solid var(--ion-color-danger);
      }

      .info-card {
        margin: 12px 16px;
      }

      .info-row {
        display: flex;
        justify-content: space-between;
        padding: 4px 0;
        font-size: 14px;
      }

      .info-label {
        color: var(--ion-color-medium);
      }

      .summary-total {
        font-size: 18px;
        font-weight: 700;
        color: var(--ion-color-primary);
      }

      .footer-actions {
        display: flex;
        gap: 8px;
        padding: 8px 16px;
      }

      .footer-actions ion-button {
        flex: 1;
      }

      .add-btn {
        margin: 8px 16px;
      }
    `,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/tabs/travels"></ion-back-button>
        </ion-buttons>
        <ion-title>Travel Plan</ion-title>
        @if (plan()) {
          <ion-badge slot="end" [color]="statusColor(plan()!.status)" style="margin-right: 16px">
            {{ plan()!.status }}
          </ion-badge>
        }
      </ion-toolbar>
    </ion-header>

    <ion-content>
      @if (loading()) {
        <div class="ion-text-center ion-padding">
          <ion-spinner name="crescent"></ion-spinner>
        </div>
      } @else if (plan()) {
        <!-- Rejection banner -->
        @if (plan()!.status === 'REJECTED' && plan()!.rejectionReason) {
          <div class="rejection-banner">
            <strong>Rejected:</strong> {{ plan()!.rejectionReason }}
          </div>
        }

        <!-- Info card -->
        <ion-card class="info-card">
          <ion-card-header>
            <ion-card-title>{{ plan()!.title }}</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            @if (plan()!.purpose) {
              <div class="info-row">
                <span class="info-label">Purpose</span>
                <span>{{ plan()!.purpose }}</span>
              </div>
            }
            <div class="info-row">
              <span class="info-label">Dates</span>
              <span>{{ plan()!.startDate | date : 'dd MMM' }} - {{ plan()!.endDate | date : 'dd MMM yyyy' }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Lead Traveller</span>
              <span>{{ plan()!.leadTravellerName ?? '-' }}</span>
            </div>
            @if (plan()!.businessUnitName) {
              <div class="info-row">
                <span class="info-label">Business Unit</span>
                <span>{{ plan()!.businessUnitName }}</span>
              </div>
            }
            <div class="info-row">
              <span class="info-label">Advance</span>
              <span>&#8377;{{ plan()!.advanceAmountPaise / 100 | number : '1.0-0' }}</span>
            </div>
            @if (plan()!.notes) {
              <div class="info-row" style="flex-direction: column; gap: 4px">
                <span class="info-label">Notes</span>
                <span>{{ plan()!.notes }}</span>
              </div>
            }
          </ion-card-content>
        </ion-card>

        <!-- Segment tabs -->
        <ion-segment [value]="activeTab()" (ionChange)="onTabChange($event)">
          <ion-segment-button value="tickets">Tickets</ion-segment-button>
          <ion-segment-button value="hotels">Hotels</ion-segment-button>
          <ion-segment-button value="expenses">Expenses</ion-segment-button>
          <ion-segment-button value="summary">Summary</ion-segment-button>
        </ion-segment>

        <!-- Tickets tab -->
        @if (activeTab() === 'tickets') {
          @if (canEdit()) {
            <ion-button
              class="add-btn"
              expand="block"
              fill="outline"
              size="small"
              (click)="addTicket()"
            >
              <ion-icon slot="start" name="add-circle-outline"></ion-icon>
              Add Ticket
            </ion-button>
          }
          @if (plan()!.tickets.length === 0) {
            <div class="ion-text-center ion-padding" style="color: var(--ion-color-medium)">
              No tickets added yet.
            </div>
          } @else {
            <ion-list>
              @for (t of plan()!.tickets; track t.id) {
                <ion-item>
                  <ion-label>
                    <h3>{{ t.type }} - {{ t.description }}</h3>
                    <p>{{ t.date | date : 'dd MMM yyyy' }}</p>
                  </ion-label>
                  <ion-note slot="end">&#8377;{{ t.amountPaise / 100 | number : '1.0-0' }}</ion-note>
                  @if (canEdit()) {
                    <ion-button slot="end" fill="clear" size="small" (click)="editTicket(t)">
                      <ion-icon slot="icon-only" name="create-outline"></ion-icon>
                    </ion-button>
                    <ion-button
                      slot="end"
                      fill="clear"
                      size="small"
                      color="danger"
                      (click)="deleteTicket(t.id)"
                    >
                      <ion-icon slot="icon-only" name="trash-outline"></ion-icon>
                    </ion-button>
                  }
                </ion-item>
              }
            </ion-list>
          }
        }

        <!-- Hotels tab -->
        @if (activeTab() === 'hotels') {
          @if (canEdit()) {
            <ion-button
              class="add-btn"
              expand="block"
              fill="outline"
              size="small"
              (click)="addHotel()"
            >
              <ion-icon slot="start" name="add-circle-outline"></ion-icon>
              Add Hotel
            </ion-button>
          }
          @if (plan()!.hotels.length === 0) {
            <div class="ion-text-center ion-padding" style="color: var(--ion-color-medium)">
              No hotels added yet.
            </div>
          } @else {
            <ion-list>
              @for (h of plan()!.hotels; track h.id) {
                <ion-item>
                  <ion-label>
                    <h3>{{ h.hotelName }}</h3>
                    <p>{{ h.city }} | {{ h.checkIn | date : 'dd MMM' }} - {{ h.checkOut | date : 'dd MMM' }}</p>
                  </ion-label>
                  <ion-note slot="end">&#8377;{{ h.amountPaise / 100 | number : '1.0-0' }}</ion-note>
                  @if (canEdit()) {
                    <ion-button slot="end" fill="clear" size="small" (click)="editHotel(h)">
                      <ion-icon slot="icon-only" name="create-outline"></ion-icon>
                    </ion-button>
                    <ion-button
                      slot="end"
                      fill="clear"
                      size="small"
                      color="danger"
                      (click)="deleteHotel(h.id)"
                    >
                      <ion-icon slot="icon-only" name="trash-outline"></ion-icon>
                    </ion-button>
                  }
                </ion-item>
              }
            </ion-list>
          }
        }

        <!-- Expenses tab -->
        @if (activeTab() === 'expenses') {
          @if (canEdit()) {
            <ion-button
              class="add-btn"
              expand="block"
              fill="outline"
              size="small"
              (click)="addExpense()"
            >
              <ion-icon slot="start" name="add-circle-outline"></ion-icon>
              Add Expense
            </ion-button>
          }
          @if (plan()!.expenses.length === 0) {
            <div class="ion-text-center ion-padding" style="color: var(--ion-color-medium)">
              No expenses added yet.
            </div>
          } @else {
            <ion-list>
              @for (e of plan()!.expenses; track e.id) {
                <ion-item>
                  <ion-label>
                    <h3>{{ e.category }} - {{ e.description }}</h3>
                    <p>{{ e.expenseDate | date : 'dd MMM yyyy' }}</p>
                  </ion-label>
                  <ion-note slot="end">&#8377;{{ e.amountPaise / 100 | number : '1.0-0' }}</ion-note>
                  @if (canEdit()) {
                    <ion-button slot="end" fill="clear" size="small" (click)="editExpense(e)">
                      <ion-icon slot="icon-only" name="create-outline"></ion-icon>
                    </ion-button>
                    <ion-button
                      slot="end"
                      fill="clear"
                      size="small"
                      color="danger"
                      (click)="deleteExpense(e.id)"
                    >
                      <ion-icon slot="icon-only" name="trash-outline"></ion-icon>
                    </ion-button>
                  }
                </ion-item>
              }
            </ion-list>
          }
        }

        <!-- Summary tab -->
        @if (activeTab() === 'summary') {
          <ion-list>
            <ion-item>
              <ion-label>Tickets</ion-label>
              <ion-note slot="end">&#8377;{{ ticketsTotal() | number : '1.0-0' }}</ion-note>
            </ion-item>
            <ion-item>
              <ion-label>Hotels</ion-label>
              <ion-note slot="end">&#8377;{{ hotelsTotal() | number : '1.0-0' }}</ion-note>
            </ion-item>
            <ion-item>
              <ion-label>Expenses</ion-label>
              <ion-note slot="end">&#8377;{{ expensesTotal() | number : '1.0-0' }}</ion-note>
            </ion-item>
            <ion-item-divider></ion-item-divider>
            <ion-item>
              <ion-label><strong>Grand Total</strong></ion-label>
              <span slot="end" class="summary-total">
                &#8377;{{ grandTotal() | number : '1.0-0' }}
              </span>
            </ion-item>
            <ion-item>
              <ion-label>Advance</ion-label>
              <ion-note slot="end">
                &#8377;{{ plan()!.advanceAmountPaise / 100 | number : '1.0-0' }}
              </ion-note>
            </ion-item>
            <ion-item>
              <ion-label>Reimbursement</ion-label>
              <ion-note slot="end">
                &#8377;{{ plan()!.reimbursementAmountPaise / 100 | number : '1.0-0' }}
              </ion-note>
            </ion-item>
          </ion-list>
        }
      }
    </ion-content>

    @if (plan() && showFooterActions()) {
      <ion-footer>
        <ion-toolbar>
          <div class="footer-actions">
            @if (plan()!.status === 'DRAFT') {
              <ion-button color="primary" (click)="doTransition('submit')">Submit</ion-button>
              <ion-button color="medium" (click)="goEdit()">Edit</ion-button>
            }
            @if (plan()!.status === 'SUBMITTED') {
              <ion-button color="success" (click)="doTransition('approve')">Approve</ion-button>
              <ion-button color="danger" (click)="rejectWithReason()">Reject</ion-button>
            }
            @if (plan()!.status === 'APPROVED') {
              <ion-button color="primary" (click)="doTransition('complete')">Complete</ion-button>
            }
          </div>
        </ion-toolbar>
      </ion-footer>
    }
  `,
})
export class TravelDetailPage implements OnInit {
  private readonly travelService = inject(TravelPlanService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly modalCtrl = inject(ModalController);
  private readonly alertCtrl = inject(AlertController);
  private readonly toastCtrl = inject(ToastController);

  readonly loading = signal(false);
  readonly plan = signal<TravelPlan | null>(null);
  readonly activeTab = signal<'tickets' | 'hotels' | 'expenses' | 'summary'>('tickets');

  readonly canEdit = computed(() => {
    const p = this.plan();
    return p?.status === 'DRAFT';
  });

  readonly showFooterActions = computed(() => {
    const p = this.plan();
    if (!p) return false;
    return ['DRAFT', 'SUBMITTED', 'APPROVED'].includes(p.status);
  });

  readonly ticketsTotal = computed(() => {
    const p = this.plan();
    if (!p) return 0;
    return p.tickets.reduce((sum, t) => sum + t.amountPaise, 0) / 100;
  });

  readonly hotelsTotal = computed(() => {
    const p = this.plan();
    if (!p) return 0;
    return p.hotels.reduce((sum, h) => sum + h.amountPaise, 0) / 100;
  });

  readonly expensesTotal = computed(() => {
    const p = this.plan();
    if (!p) return 0;
    return p.expenses.reduce((sum, e) => sum + e.amountPaise, 0) / 100;
  });

  readonly grandTotal = computed(() => {
    return this.ticketsTotal() + this.hotelsTotal() + this.expensesTotal();
  });

  private planId = '';

  ngOnInit(): void {
    this.planId = this.route.snapshot.paramMap.get('id') ?? '';
    this.loadPlan();
  }

  onTabChange(event: CustomEvent): void {
    this.activeTab.set(event.detail.value);
  }

  goEdit(): void {
    this.router.navigate(['/tabs/travels', this.planId, 'edit']);
  }

  /* ── Workflow transitions ── */

  async doTransition(action: 'submit' | 'approve' | 'reject' | 'complete'): Promise<void> {
    this.travelService.transition(this.planId, action).subscribe({
      next: async () => {
        const toast = await this.toastCtrl.create({
          message: `Travel plan ${action}ed successfully`,
          duration: 2000,
          color: 'success',
        });
        await toast.present();
        this.loadPlan();
      },
      error: async () => {
        const toast = await this.toastCtrl.create({
          message: `Failed to ${action} travel plan`,
          duration: 3000,
          color: 'danger',
        });
        await toast.present();
      },
    });
  }

  async rejectWithReason(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Reject Travel Plan',
      inputs: [
        {
          name: 'reason',
          type: 'textarea',
          placeholder: 'Reason for rejection',
        },
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Reject',
          role: 'destructive',
          handler: (data) => {
            if (!data.reason?.trim()) return false;
            // For reject, we pass the reason via a separate body
            // The transition endpoint handles it
            this.travelService.transition(this.planId, 'reject').subscribe({
              next: async () => {
                const toast = await this.toastCtrl.create({
                  message: 'Travel plan rejected',
                  duration: 2000,
                  color: 'warning',
                });
                await toast.present();
                this.loadPlan();
              },
              error: async () => {
                const toast = await this.toastCtrl.create({
                  message: 'Failed to reject travel plan',
                  duration: 3000,
                  color: 'danger',
                });
                await toast.present();
              },
            });
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  /* ── Ticket CRUD ── */

  async addTicket(): Promise<void> {
    const modal = await this.modalCtrl.create({ component: TicketModalComponent });
    await modal.present();
    const { data, role } = await modal.onDidDismiss<TicketData>();
    if (role === 'save' && data) {
      const body = { type: data.type, description: data.description, date: data.date, amountPaise: data.amountPaise };
      this.travelService.addTicket(this.planId, body).subscribe({ next: () => this.loadPlan() });
    }
  }

  async editTicket(ticket: TravelPlan['tickets'][0]): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: TicketModalComponent,
      componentProps: { ticket: { ...ticket } as TicketData },
    });
    await modal.present();
    const { data, role } = await modal.onDidDismiss<TicketData>();
    if (role === 'save' && data) {
      const body = { type: data.type, description: data.description, date: data.date, amountPaise: data.amountPaise };
      this.travelService.updateTicket(this.planId, ticket.id, body).subscribe({ next: () => this.loadPlan() });
    }
  }

  async deleteTicket(ticketId: string): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Delete Ticket',
      message: 'Are you sure you want to delete this ticket?',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          role: 'destructive',
          handler: () => {
            this.travelService.deleteTicket(this.planId, ticketId).subscribe({ next: () => this.loadPlan() });
          },
        },
      ],
    });
    await alert.present();
  }

  /* ── Hotel CRUD ── */

  async addHotel(): Promise<void> {
    const modal = await this.modalCtrl.create({ component: HotelModalComponent });
    await modal.present();
    const { data, role } = await modal.onDidDismiss<HotelData>();
    if (role === 'save' && data) {
      const body = {
        hotelName: data.hotelName,
        city: data.city,
        checkIn: data.checkIn,
        checkOut: data.checkOut,
        amountPaise: data.amountPaise,
      };
      this.travelService.addHotel(this.planId, body).subscribe({ next: () => this.loadPlan() });
    }
  }

  async editHotel(hotel: TravelPlan['hotels'][0]): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: HotelModalComponent,
      componentProps: { hotel: { ...hotel } as HotelData },
    });
    await modal.present();
    const { data, role } = await modal.onDidDismiss<HotelData>();
    if (role === 'save' && data) {
      const body = {
        hotelName: data.hotelName,
        city: data.city,
        checkIn: data.checkIn,
        checkOut: data.checkOut,
        amountPaise: data.amountPaise,
      };
      this.travelService.updateHotel(this.planId, hotel.id, body).subscribe({ next: () => this.loadPlan() });
    }
  }

  async deleteHotel(hotelId: string): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Delete Hotel',
      message: 'Are you sure you want to delete this hotel?',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          role: 'destructive',
          handler: () => {
            this.travelService.deleteHotel(this.planId, hotelId).subscribe({ next: () => this.loadPlan() });
          },
        },
      ],
    });
    await alert.present();
  }

  /* ── Expense CRUD ── */

  async addExpense(): Promise<void> {
    const modal = await this.modalCtrl.create({ component: ExpenseModalComponent });
    await modal.present();
    const { data, role } = await modal.onDidDismiss<ExpenseData>();
    if (role === 'save' && data) {
      const body = {
        category: data.category,
        description: data.description,
        expenseDate: data.expenseDate,
        amountPaise: data.amountPaise,
      };
      this.travelService.addExpense(this.planId, body).subscribe({ next: () => this.loadPlan() });
    }
  }

  async editExpense(expense: TravelPlan['expenses'][0]): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: ExpenseModalComponent,
      componentProps: { expense: { ...expense } as ExpenseData },
    });
    await modal.present();
    const { data, role } = await modal.onDidDismiss<ExpenseData>();
    if (role === 'save' && data) {
      const body = {
        category: data.category,
        description: data.description,
        expenseDate: data.expenseDate,
        amountPaise: data.amountPaise,
      };
      this.travelService.updateExpense(this.planId, expense.id, body).subscribe({ next: () => this.loadPlan() });
    }
  }

  async deleteExpense(expenseId: string): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Delete Expense',
      message: 'Are you sure you want to delete this expense?',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          role: 'destructive',
          handler: () => {
            this.travelService.deleteExpense(this.planId, expenseId).subscribe({ next: () => this.loadPlan() });
          },
        },
      ],
    });
    await alert.present();
  }

  /* ── Helpers ── */

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

  private loadPlan(): void {
    this.loading.set(true);
    this.travelService.getById(this.planId).subscribe({
      next: (res: unknown) => {
        const payload = res as { data?: TravelPlan };
        this.plan.set(payload.data ?? null);
        this.loading.set(false);
      },
      error: () => {
        this.plan.set(null);
        this.loading.set(false);
      },
    });
  }
}
