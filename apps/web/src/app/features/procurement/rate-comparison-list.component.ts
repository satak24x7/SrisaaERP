import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';

interface RateComparison {
  id: string; comparisonNo: string; title: string;
  quotationCount: number; status: string;
  createdAt: string;
}

interface QuotationOption {
  id: string; quotationNo: string; vendorName: string; grandTotalPaise: number;
}

@Component({
  selector: 'app-rate-comparison-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, TableModule, TagModule, ButtonModule, DialogModule, InputTextModule, MultiSelectModule, ToastModule],
  providers: [MessageService],
  template: `
    <p-toast />
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-semibold text-gray-800">Rate Comparisons</h2>
        <p class="text-sm text-gray-500 mt-1">Compare vendor quotations side by side</p>
      </div>
      <p-button label="New Comparison" icon="pi pi-plus" (onClick)="showCreate = true; loadQuotations()" />
    </div>

    @if (loading()) {
      <div class="flex items-center gap-2 text-gray-500 py-12 justify-center"><i class="pi pi-spin pi-spinner text-2xl"></i> Loading...</div>
    } @else {
      <div class="bg-white rounded-lg shadow-sm border border-gray-200">
        <p-table [value]="comparisons()" styleClass="p-datatable-sm p-datatable-striped" [rowHover]="true">
          <ng-template pTemplate="header">
            <tr>
              <th class="font-semibold">Comparison No</th>
              <th class="font-semibold">Title</th>
              <th class="font-semibold text-right">Quotations</th>
              <th class="font-semibold">Status</th>
              <th class="font-semibold">Created</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-c>
            <tr class="cursor-pointer" (click)="router.navigate(['/procurement/rate-comparisons', c.id])">
              <td><span class="font-mono font-semibold text-sm">{{ c.comparisonNo }}</span></td>
              <td>{{ c.title }}</td>
              <td class="text-right">{{ c.quotationCount }}</td>
              <td><p-tag [value]="c.status" [severity]="c.status === 'FINALIZED' ? 'success' : c.status === 'DRAFT' ? 'secondary' : 'info'" /></td>
              <td>{{ c.createdAt | date:'dd-MMM-yyyy' }}</td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td colspan="5" class="text-center py-8 text-gray-500">No rate comparisons yet.</td></tr>
          </ng-template>
        </p-table>
      </div>
    }

    <!-- Create Dialog -->
    <p-dialog header="New Rate Comparison" [(visible)]="showCreate" [modal]="true" [style]="{ width: '500px' }">
      <form [formGroup]="createForm" class="flex flex-col gap-4 pt-2">
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Title *</label>
          <input pInputText formControlName="title" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Quotations (2-5) *</label>
          <p-multiSelect formControlName="quotationIds" [options]="quotationOptions()" optionLabel="label" optionValue="value"
            placeholder="Select quotations" [filter]="true" filterBy="label" [maxSelectedLabels]="5"
            appendTo="body" styleClass="w-full" />
        </div>
      </form>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" [text]="true" severity="secondary" (onClick)="showCreate = false" />
        <p-button label="Create" icon="pi pi-check" (onClick)="create()" [loading]="saving()"
          [disabled]="createForm.invalid || (createForm.get('quotationIds')?.value?.length || 0) < 2" />
      </ng-template>
    </p-dialog>
  `,
  styles: [`:host { display: block; padding: 1.5rem; }`],
})
export class RateComparisonListComponent implements OnInit {
  private http = inject(HttpClient);
  router = inject(Router);
  private fb = inject(FormBuilder);
  private msg = inject(MessageService);
  private readonly cdr = inject(ChangeDetectorRef);

  comparisons = signal<RateComparison[]>([]);
  quotationOptions = signal<{ label: string; value: string }[]>([]);
  loading = signal(false);
  saving = signal(false);
  showCreate = false;

  createForm = this.fb.group({
    title: ['', Validators.required],
    quotationIds: [[] as string[], Validators.required],
  });

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.http.get<{ data: RateComparison[] }>(`${environment.apiBaseUrl}/rate-comparisons?limit=200`).subscribe({
      next: (r) => { this.comparisons.set(r.data); this.loading.set(false); },
      error: () => { this.msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to load' }); this.loading.set(false); },
    });
  }

  loadQuotations() {
    this.http.get<{ data: QuotationOption[] }>(`${environment.apiBaseUrl}/quotations?status=ACTIVE&limit=200`).subscribe({
      next: (r) => {
        this.quotationOptions.set(r.data.map(q => ({
          label: `${q.quotationNo} — ${q.vendorName} (${this.formatRupees(q.grandTotalPaise)})`,
          value: q.id,
        })));
      },
    });
  }

  create() {
    if (this.createForm.invalid) return;
    const v = this.createForm.getRawValue();
    if (!v.quotationIds || v.quotationIds.length < 2 || v.quotationIds.length > 5) {
      this.msg.add({ severity: 'warn', summary: 'Validation', detail: 'Select 2 to 5 quotations' });
      return;
    }
    this.saving.set(true);
    this.http.post<{ data: RateComparison }>(`${environment.apiBaseUrl}/rate-comparisons`, {
      title: v.title,
      quotationIds: v.quotationIds,
    }).subscribe({
      next: (r) => {
        this.msg.add({ severity: 'success', summary: 'Created', detail: `Comparison ${r.data.comparisonNo} created` });
        this.saving.set(false);
        this.showCreate = false;
        this.createForm.reset({ title: '', quotationIds: [] });
        this.load();
        this.cdr.markForCheck();
      },
      error: () => { this.msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to create comparison' }); this.saving.set(false); this.cdr.markForCheck(); },
    });
  }

  formatRupees(paise: number) { return '\u20B9' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 }); }
}
