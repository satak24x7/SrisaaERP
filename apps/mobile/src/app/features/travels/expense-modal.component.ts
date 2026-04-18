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

export interface ExpenseData {
  id?: string;
  category: string;
  description: string;
  expenseDate: string;
  amountPaise: number;
}

const EXPENSE_CATEGORIES = [
  { value: 'TICKET', label: 'Ticket' },
  { value: 'HOTEL', label: 'Hotel' },
  { value: 'FOOD', label: 'Food' },
  { value: 'LOCAL_TRANSPORT', label: 'Local Transport' },
  { value: 'COMMUNICATION', label: 'Communication' },
  { value: 'OTHER', label: 'Other' },
] as const;

@Component({
  selector: 'app-expense-modal',
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
        <ion-title>{{ editing ? 'Edit' : 'Add' }} Expense</ion-title>
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
            label="Category"
            labelPlacement="stacked"
            formControlName="category"
            placeholder="Select category"
          >
            @for (cat of categories; track cat.value) {
              <ion-select-option [value]="cat.value">{{ cat.label }}</ion-select-option>
            }
          </ion-select>
        </ion-item>

        <ion-item>
          <ion-input
            label="Description"
            labelPlacement="stacked"
            formControlName="description"
            placeholder="e.g. Lunch at client site"
          ></ion-input>
        </ion-item>

        <ion-item>
          <ion-label>Expense Date</ion-label>
          <ion-datetime-button datetime="expenseDate"></ion-datetime-button>
          <ion-modal [keepContentsMounted]="true">
            <ng-template>
              <ion-datetime
                id="expenseDate"
                presentation="date"
                formControlName="expenseDate"
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
export class ExpenseModalComponent {
  @Input() expense?: ExpenseData;

  private readonly fb = inject(FormBuilder);
  private readonly modalCtrl = inject(ModalController);

  readonly categories = EXPENSE_CATEGORIES;
  editing = false;

  form: FormGroup = this.fb.group({
    category: ['FOOD', Validators.required],
    description: ['', Validators.required],
    expenseDate: [new Date().toISOString().split('T')[0], Validators.required],
    amountRupees: [0, [Validators.required, Validators.min(0)]],
  });

  ngOnInit(): void {
    if (this.expense) {
      this.editing = true;
      this.form.patchValue({
        category: this.expense.category,
        description: this.expense.description,
        expenseDate: this.expense.expenseDate,
        amountRupees: this.expense.amountPaise / 100,
      });
    }
  }

  dismiss(): void {
    this.modalCtrl.dismiss(null, 'cancel');
  }

  save(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const data: ExpenseData = {
      id: this.expense?.id,
      category: v.category,
      description: v.description,
      expenseDate:
        typeof v.expenseDate === 'string' && v.expenseDate.includes('T')
          ? v.expenseDate.split('T')[0]
          : v.expenseDate,
      amountPaise: Math.round(v.amountRupees * 100),
    };
    this.modalCtrl.dismiss(data, 'save');
  }
}
