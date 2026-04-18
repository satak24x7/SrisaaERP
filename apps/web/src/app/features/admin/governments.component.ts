import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { ConfirmationService, MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';

interface Government {
  id: string; code: string; name: string; governmentType: string; country: string;
  capital: string | null; notes: string | null; createdAt: string;
}

@Component({
  selector: 'app-governments',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TableModule, TagModule, ButtonModule, DialogModule, InputTextModule, TextareaModule, SelectModule, ConfirmDialogModule, ToastModule],
  providers: [ConfirmationService, MessageService],
  template: `
    <p-toast /><p-confirmDialog />
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-semibold text-gray-800">Governments</h2>
        <p class="text-sm text-gray-500 mt-1">National and state governments we operate with</p>
      </div>
      <p-button label="Add Government" icon="pi pi-plus" (onClick)="openCreate()" />
    </div>
    @if (loading()) {
      <div class="flex items-center gap-2 text-gray-500 py-12 justify-center"><i class="pi pi-spin pi-spinner text-2xl"></i> Loading...</div>
    } @else {
      <div class="bg-white rounded-lg shadow-sm border border-gray-200">
        <p-table [value]="items()" styleClass="p-datatable-sm">
          <ng-template pTemplate="header">
            <tr>
              <th class="font-semibold">Code</th>
              <th class="font-semibold">Name</th>
              <th class="font-semibold">Type</th>
              <th class="font-semibold">Country</th>
              <th class="font-semibold">Capital</th>
              <th class="font-semibold" style="width:150px">Actions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-g>
            <tr>
              <td><span class="text-sm font-mono font-semibold">{{ g.code }}</span></td>
              <td><span class="font-medium">{{ g.name }}</span></td>
              <td><p-tag [value]="g.governmentType === 'NATIONAL' ? 'National' : 'State'" [severity]="g.governmentType === 'NATIONAL' ? 'info' : 'success'" [style]="{'font-size':'0.7rem'}" /></td>
              <td><span class="text-sm">{{ g.country }}</span></td>
              <td><span class="text-sm">{{ g.capital || '—' }}</span></td>
              <td>
                <div class="flex gap-1">
                  <p-button icon="pi pi-pencil" [rounded]="true" [text]="true" severity="info" size="small" (onClick)="openEdit(g)" />
                  <p-button icon="pi pi-trash" [rounded]="true" [text]="true" severity="danger" size="small" (onClick)="confirmDelete(g)" />
                </div>
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td colspan="6" class="text-center py-8 text-gray-500">No governments added yet.</td></tr>
          </ng-template>
        </p-table>
      </div>
    }
    <p-dialog [header]="editItem ? 'Edit Government' : 'Add Government'" [(visible)]="formVisible" [modal]="true" [style]="{width:'500px'}">
      <form [formGroup]="form" class="flex flex-col gap-4 pt-2">
        <div class="grid grid-cols-4 gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Code *</label>
            <input pInputText formControlName="code" placeholder="GOVIN" maxlength="5" class="w-full uppercase font-mono" />
          </div>
          <div class="flex flex-col gap-1 col-span-3">
            <label class="text-sm font-medium text-gray-700">Name *</label>
            <input pInputText formControlName="name" placeholder="e.g. Government of Maharashtra" class="w-full" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Type *</label>
            <p-select appendTo="body" formControlName="governmentType" [options]="typeOptions" optionLabel="label" optionValue="value" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Country *</label>
            <input pInputText formControlName="country" placeholder="India" class="w-full" />
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Capital</label>
          <input pInputText formControlName="capital" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Notes</label>
          <textarea pTextarea formControlName="notes" rows="2" class="w-full"></textarea>
        </div>
        @if (serverError) { <div class="p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">{{ serverError }}</div> }
      </form>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="formVisible=false" />
        <p-button [label]="editItem ? 'Save' : 'Create'" [loading]="saving" [disabled]="form.invalid||saving" (onClick)="onSubmit()" />
      </ng-template>
    </p-dialog>
  `,
})
export class GovernmentsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly confirm = inject(ConfirmationService);
  private readonly msg = inject(MessageService);

  items = signal<Government[]>([]);
  loading = signal(true);
  formVisible = false;
  editItem: Government | null = null;
  saving = false;
  serverError = '';
  typeOptions = [{ label: 'National', value: 'NATIONAL' }, { label: 'State', value: 'STATE' }];

  form = this.fb.group({
    code: ['', [Validators.required, Validators.maxLength(5), Validators.pattern(/^\S+$/)]],
    name: ['', [Validators.required, Validators.maxLength(255)]],
    governmentType: ['STATE', Validators.required],
    country: ['India', [Validators.required, Validators.maxLength(128)]],
    capital: [''], notes: [''],
  });

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.http.get<{ data: Government[] }>(`${environment.apiBaseUrl}/governments?limit=200`).subscribe({
      next: (r) => { this.items.set(r.data); this.loading.set(false); },
      error: () => { this.loading.set(false); },
    });
  }

  openCreate(): void { this.editItem = null; this.form.reset({ governmentType: 'STATE', country: 'India' }); this.serverError = ''; this.formVisible = true; }

  openEdit(g: Government): void {
    this.editItem = g;
    this.form.patchValue({ code: g.code, name: g.name, governmentType: g.governmentType, country: g.country, capital: g.capital ?? '', notes: g.notes ?? '' });
    this.serverError = ''; this.formVisible = true;
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    this.saving = true; this.serverError = '';
    const body: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(this.form.value)) { if (v) body[k] = v; }
    const url = `${environment.apiBaseUrl}/governments`;
    const req$ = this.editItem ? this.http.patch(`${url}/${this.editItem.id}`, body) : this.http.post(url, body);
    req$.subscribe({
      next: () => { this.saving = false; this.formVisible = false; this.msg.add({ severity: 'success', summary: 'Success' }); this.load(); },
      error: (err: HttpErrorResponse) => { this.saving = false; this.serverError = err.error?.error?.message ?? 'Error'; },
    });
  }

  confirmDelete(g: Government): void {
    this.confirm.confirm({
      message: `Delete "${g.name}"?`, header: 'Delete Government', icon: 'pi pi-exclamation-triangle', acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.http.delete(`${environment.apiBaseUrl}/governments/${g.id}`).subscribe({
          next: () => { this.msg.add({ severity: 'success', summary: 'Deleted' }); this.load(); },
          error: (err: HttpErrorResponse) => this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed' }),
        });
      },
    });
  }
}
