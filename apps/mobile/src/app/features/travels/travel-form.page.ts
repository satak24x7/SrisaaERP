import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonItem,
  IonLabel,
  IonInput,
  IonTextarea,
  IonSelect,
  IonSelectOption,
  IonButton,
  IonButtons,
  IonIcon,
  IonSpinner,
  IonDatetime,
  IonDatetimeButton,
  IonModal,
  Platform,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBackOutline } from 'ionicons/icons';

addIcons({ arrowBackOutline });
import { TravelPlanService } from '../../core/services/travel-plan.service';
import { LookupService } from '../../core/services/lookup.service';

@Component({
  selector: 'app-travel-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonItem,
    IonLabel,
    IonInput,
    IonTextarea,
    IonSelect,
    IonSelectOption,
    IonButton,
    IonButtons,
    IonIcon,
    IonSpinner,
    IonDatetime,
    IonDatetimeButton,
    IonModal,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button (click)="goBack()">
            <ion-icon slot="icon-only" name="arrow-back-outline"></ion-icon>
          </ion-button>
        </ion-buttons>
        <ion-title>{{ editId ? 'Edit' : 'New' }} Travel Plan</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      @if (loadingData()) {
        <div class="ion-text-center ion-padding">
          <ion-spinner name="crescent"></ion-spinner>
        </div>
      } @else {
        <form [formGroup]="form">
          <ion-item>
            <ion-input
              label="Title"
              labelPlacement="stacked"
              formControlName="title"
              placeholder="e.g. Mumbai client visit"
            ></ion-input>
          </ion-item>

          <ion-item>
            <ion-textarea
              label="Purpose"
              labelPlacement="stacked"
              formControlName="purpose"
              placeholder="Purpose of travel"
              [autoGrow]="true"
              rows="2"
            ></ion-textarea>
          </ion-item>

          <ion-item>
            <ion-label>Start Date</ion-label>
            <ion-datetime-button datetime="startDate"></ion-datetime-button>
            <ion-modal [keepContentsMounted]="true">
              <ng-template>
                <ion-datetime
                  id="startDate"
                  presentation="date"
                  formControlName="startDate"
                ></ion-datetime>
              </ng-template>
            </ion-modal>
          </ion-item>

          <ion-item>
            <ion-label>End Date</ion-label>
            <ion-datetime-button datetime="endDate"></ion-datetime-button>
            <ion-modal [keepContentsMounted]="true">
              <ng-template>
                <ion-datetime
                  id="endDate"
                  presentation="date"
                  formControlName="endDate"
                ></ion-datetime>
              </ng-template>
            </ion-modal>
          </ion-item>

          <ion-item>
            <ion-select
              label="Business Unit"
              labelPlacement="stacked"
              formControlName="businessUnitId"
              placeholder="Select BU"
            >
              @for (bu of businessUnits(); track $index) {
                <ion-select-option [value]="bu.id">{{ bu.name }}</ion-select-option>
              }
            </ion-select>
          </ion-item>

          <ion-item>
            <ion-input
              label="Advance Amount (&#8377;)"
              labelPlacement="stacked"
              type="number"
              formControlName="advanceAmountRupees"
              placeholder="0"
            ></ion-input>
          </ion-item>

          <ion-item>
            <ion-textarea
              label="Notes"
              labelPlacement="stacked"
              formControlName="notes"
              placeholder="Additional notes"
              [autoGrow]="true"
              rows="3"
            ></ion-textarea>
          </ion-item>

          <div class="ion-padding-top">
            <ion-button
              expand="block"
              (click)="save()"
              [disabled]="form.invalid || saving()"
            >
              @if (saving()) {
                <ion-spinner name="crescent" style="margin-right: 8px"></ion-spinner>
              }
              {{ editId ? 'Update' : 'Create' }} Travel Plan
            </ion-button>
          </div>
        </form>
      }
    </ion-content>
  `,
})
export class TravelFormPage implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly travelService = inject(TravelPlanService);
  private readonly lookupService = inject(LookupService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly platform = inject(Platform);
  private readonly toastCtrl = inject(ToastController);

  private returnUrl = '/tabs/travels';
  private backButtonSub?: Subscription;
  editId: string | null = null;
  readonly loadingData = signal(false);
  readonly saving = signal(false);
  readonly businessUnits = signal<Array<{ id: string; name: string }>>([]);

  form: FormGroup = this.fb.group({
    title: ['', Validators.required],
    purpose: [''],
    startDate: [new Date().toISOString().split('T')[0], Validators.required],
    endDate: [new Date().toISOString().split('T')[0], Validators.required],
    businessUnitId: ['', Validators.required],
    advanceAmountRupees: [0, [Validators.required, Validators.min(0)]],
    notes: [''],
  });

  ngOnInit(): void {
    this.returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/tabs/travels';
    this.backButtonSub = this.platform.backButton.subscribeWithPriority(10, () => {
      this.goBack();
    });
    this.editId = this.route.snapshot.paramMap.get('id');

    // Load BU options
    this.lookupService.loadAll().subscribe({
      next: () => {
        const bus = this.lookupService.businessUnits() as Array<{ id: string; name: string }>;
        this.businessUnits.set(bus);
      },
    });

    if (this.editId) {
      this.loadingData.set(true);
      this.travelService.getById(this.editId).subscribe({
        next: (res: unknown) => {
          const plan = (res as { data?: Record<string, unknown> }).data;
          if (plan) {
            this.form.patchValue({
              title: plan['title'],
              purpose: plan['purpose'] ?? '',
              startDate: plan['startDate'],
              endDate: plan['endDate'],
              businessUnitId: plan['businessUnitId'],
              advanceAmountRupees: ((plan['advanceAmountPaise'] as number) ?? 0) / 100,
              notes: plan['notes'] ?? '',
            });
          }
          this.loadingData.set(false);
        },
        error: () => {
          this.loadingData.set(false);
        },
      });
    }
  }

  ngOnDestroy(): void {
    this.backButtonSub?.unsubscribe();
  }

  goBack(): void {
    if (this.editId) {
      this.router.navigate(['/tabs/travels', this.editId], {
        queryParams: { returnUrl: this.returnUrl },
      });
    } else {
      this.router.navigate([this.returnUrl]);
    }
  }

  async save(): Promise<void> {
    if (this.form.invalid) return;
    this.saving.set(true);

    const v = this.form.getRawValue();
    const body = {
      title: v.title,
      purpose: v.purpose || null,
      startDate: this.stripTime(v.startDate),
      endDate: this.stripTime(v.endDate),
      businessUnitId: v.businessUnitId,
      advanceAmountPaise: Math.round(v.advanceAmountRupees * 100),
      notes: v.notes || null,
    };

    const obs = this.editId
      ? this.travelService.update(this.editId, body)
      : this.travelService.create(body);

    obs.subscribe({
      next: async (res: unknown) => {
        this.saving.set(false);
        const toast = await this.toastCtrl.create({
          message: this.editId ? 'Travel plan updated' : 'Travel plan created',
          duration: 2000,
          color: 'success',
        });
        await toast.present();

        if (this.editId) {
          this.router.navigate(['/tabs/travels', this.editId], {
            queryParams: { returnUrl: this.returnUrl },
          });
        } else {
          const created = (res as { data?: { id?: string } }).data;
          if (created?.id) {
            this.router.navigate(['/tabs/travels', created.id], {
              queryParams: { returnUrl: this.returnUrl },
            });
          } else {
            this.router.navigate([this.returnUrl]);
          }
        }
      },
      error: async () => {
        this.saving.set(false);
        const toast = await this.toastCtrl.create({
          message: 'Failed to save travel plan',
          duration: 3000,
          color: 'danger',
        });
        await toast.present();
      },
    });
  }

  private stripTime(val: string): string {
    return typeof val === 'string' && val.includes('T') ? val.split('T')[0] : val;
  }
}
