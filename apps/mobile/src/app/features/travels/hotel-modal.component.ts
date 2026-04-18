import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonItem,
  IonLabel,
  IonInput,
  IonButton,
  IonButtons,
  ModalController,
  IonDatetime,
  IonDatetimeButton,
  IonModal,
} from '@ionic/angular/standalone';

export interface HotelData {
  id?: string;
  hotelName: string;
  city: string;
  checkIn: string;
  checkOut: string;
  amountPaise: number;
}

@Component({
  selector: 'app-hotel-modal',
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
    IonButton,
    IonButtons,
    IonDatetime,
    IonDatetimeButton,
    IonModal,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button (click)="dismiss()">Cancel</ion-button>
        </ion-buttons>
        <ion-title>{{ editing ? 'Edit' : 'Add' }} Hotel</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="save()" [strong]="true" [disabled]="form.invalid">
            Save
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <form [formGroup]="form">
        <ion-item>
          <ion-input
            label="Hotel Name"
            labelPlacement="stacked"
            formControlName="hotelName"
            placeholder="e.g. Taj Mahal Palace"
          ></ion-input>
        </ion-item>

        <ion-item>
          <ion-input
            label="City"
            labelPlacement="stacked"
            formControlName="city"
            placeholder="e.g. Mumbai"
          ></ion-input>
        </ion-item>

        <ion-item>
          <ion-label>Check-In</ion-label>
          <ion-datetime-button datetime="checkInDate"></ion-datetime-button>
          <ion-modal [keepContentsMounted]="true">
            <ng-template>
              <ion-datetime
                id="checkInDate"
                presentation="date"
                formControlName="checkIn"
              ></ion-datetime>
            </ng-template>
          </ion-modal>
        </ion-item>

        <ion-item>
          <ion-label>Check-Out</ion-label>
          <ion-datetime-button datetime="checkOutDate"></ion-datetime-button>
          <ion-modal [keepContentsMounted]="true">
            <ng-template>
              <ion-datetime
                id="checkOutDate"
                presentation="date"
                formControlName="checkOut"
              ></ion-datetime>
            </ng-template>
          </ion-modal>
        </ion-item>

        <ion-item>
          <ion-input
            label="Amount (&#8377;)"
            labelPlacement="stacked"
            type="number"
            formControlName="amountRupees"
            placeholder="0"
          ></ion-input>
        </ion-item>
      </form>
    </ion-content>
  `,
})
export class HotelModalComponent {
  @Input() hotel?: HotelData;

  private readonly fb = inject(FormBuilder);
  private readonly modalCtrl = inject(ModalController);

  editing = false;

  form: FormGroup = this.fb.group({
    hotelName: ['', Validators.required],
    city: ['', Validators.required],
    checkIn: [new Date().toISOString().split('T')[0], Validators.required],
    checkOut: [new Date().toISOString().split('T')[0], Validators.required],
    amountRupees: [0, [Validators.required, Validators.min(0)]],
  });

  ngOnInit(): void {
    if (this.hotel) {
      this.editing = true;
      this.form.patchValue({
        hotelName: this.hotel.hotelName,
        city: this.hotel.city,
        checkIn: this.hotel.checkIn,
        checkOut: this.hotel.checkOut,
        amountRupees: this.hotel.amountPaise / 100,
      });
    }
  }

  private stripTime(val: string): string {
    return typeof val === 'string' && val.includes('T') ? val.split('T')[0] : val;
  }

  dismiss(): void {
    this.modalCtrl.dismiss(null, 'cancel');
  }

  save(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const data: HotelData = {
      id: this.hotel?.id,
      hotelName: v.hotelName,
      city: v.city,
      checkIn: this.stripTime(v.checkIn),
      checkOut: this.stripTime(v.checkOut),
      amountPaise: Math.round(v.amountRupees * 100),
    };
    this.modalCtrl.dismiss(data, 'save');
  }
}
