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
  IonSelect,
  IonSelectOption,
  IonButton,
  IonButtons,
  ModalController,
  IonDatetime,
  IonDatetimeButton,
  IonModal,
} from '@ionic/angular/standalone';

export interface TicketData {
  id?: string;
  type: string;
  description: string;
  date: string;
  amountPaise: number;
}

@Component({
  selector: 'app-ticket-modal',
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
    IonSelect,
    IonSelectOption,
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
        <ion-title>{{ editing ? 'Edit' : 'Add' }} Ticket</ion-title>
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
          <ion-select
            label="Type"
            labelPlacement="stacked"
            formControlName="type"
            placeholder="Select type"
          >
            <ion-select-option value="FLIGHT">Flight</ion-select-option>
            <ion-select-option value="TRAIN">Train</ion-select-option>
            <ion-select-option value="BUS">Bus</ion-select-option>
            <ion-select-option value="CAB">Cab</ion-select-option>
          </ion-select>
        </ion-item>

        <ion-item>
          <ion-input
            label="Description"
            labelPlacement="stacked"
            formControlName="description"
            placeholder="e.g. DEL-BOM AI302"
          ></ion-input>
        </ion-item>

        <ion-item>
          <ion-label>Date</ion-label>
          <ion-datetime-button datetime="ticketDate"></ion-datetime-button>
          <ion-modal [keepContentsMounted]="true">
            <ng-template>
              <ion-datetime
                id="ticketDate"
                presentation="date"
                formControlName="date"
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
export class TicketModalComponent {
  @Input() ticket?: TicketData;

  private readonly fb = inject(FormBuilder);
  private readonly modalCtrl = inject(ModalController);

  editing = false;

  form: FormGroup = this.fb.group({
    type: ['FLIGHT', Validators.required],
    description: ['', Validators.required],
    date: [new Date().toISOString().split('T')[0], Validators.required],
    amountRupees: [0, [Validators.required, Validators.min(0)]],
  });

  ngOnInit(): void {
    if (this.ticket) {
      this.editing = true;
      this.form.patchValue({
        type: this.ticket.type,
        description: this.ticket.description,
        date: this.ticket.date,
        amountRupees: this.ticket.amountPaise / 100,
      });
    }
  }

  dismiss(): void {
    this.modalCtrl.dismiss(null, 'cancel');
  }

  save(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const data: TicketData = {
      id: this.ticket?.id,
      type: v.type,
      description: v.description,
      date: typeof v.date === 'string' && v.date.includes('T') ? v.date.split('T')[0] : v.date,
      amountPaise: Math.round(v.amountRupees * 100),
    };
    this.modalCtrl.dismiss(data, 'save');
  }
}
