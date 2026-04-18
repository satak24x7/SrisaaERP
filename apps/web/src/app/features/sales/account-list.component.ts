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

interface Account {
  id: string; code: string; name: string; shortName: string | null; accountType: string;
  governmentId: string | null; governmentName: string | null;
  city: string | null; state: string | null; phone: string | null; email: string | null;
  website: string | null; address: string | null; pincode: string | null;
  gstin: string | null; notes: string | null; ownerUserId: string | null;
  businessUnitId: string | null; parentAccountId: string | null;
  createdAt: string;
}
interface GovOption { id: string; name: string; }

@Component({
  selector: 'app-account-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TableModule, TagModule, ButtonModule, DialogModule, InputTextModule, TextareaModule, SelectModule, ConfirmDialogModule, ToastModule],
  providers: [ConfirmationService, MessageService],
  template: `
    <p-toast /><p-confirmDialog />
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-semibold text-gray-800">Accounts</h2>
        <p class="text-sm text-gray-500 mt-1">Government departments, agencies and PSUs</p>
      </div>
      <p-button label="Create Account" icon="pi pi-plus" (onClick)="openCreate()" />
    </div>
    @if (loading()) {
      <div class="flex items-center gap-2 text-gray-500 py-12 justify-center"><i class="pi pi-spin pi-spinner text-2xl"></i> Loading...</div>
    } @else {
      <div class="bg-white rounded-lg shadow-sm border border-gray-200">
        <p-table [value]="accounts()" styleClass="p-datatable-sm">
          <ng-template pTemplate="header">
            <tr>
              <th class="font-semibold">Code</th>
              <th class="font-semibold">Name</th>
              <th class="font-semibold">Type</th>
              <th class="font-semibold">Government</th>
              <th class="font-semibold">City</th>
              <th class="font-semibold">State</th>
              <th class="font-semibold">Phone</th>
              <th class="font-semibold" style="width:150px">Actions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-a>
            <tr>
              <td><span class="text-sm font-mono font-semibold">{{ a.code }}</span></td>
              <td>
                <span class="font-medium">{{ a.name }}</span>
                @if (a.shortName) { <span class="text-xs text-gray-400 ml-1">({{ a.shortName }})</span> }
              </td>
              <td><p-tag [value]="formatType(a.accountType)" severity="info" [style]="{'font-size':'0.7rem'}" /></td>
              <td><span class="text-sm">{{ a.governmentName || '—' }}</span></td>
              <td><span class="text-sm">{{ a.city || '—' }}</span></td>
              <td><span class="text-sm">{{ a.state || '—' }}</span></td>
              <td><span class="text-sm">{{ a.phone || '—' }}</span></td>
              <td>
                <div class="flex gap-1">
                  <p-button icon="pi pi-pencil" [rounded]="true" [text]="true" severity="info" size="small" (onClick)="openEdit(a)" />
                  <p-button icon="pi pi-trash" [rounded]="true" [text]="true" severity="danger" size="small" (onClick)="confirmDelete(a)" />
                </div>
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td colspan="8" class="text-center py-8 text-gray-500">No accounts yet.</td></tr>
          </ng-template>
        </p-table>
      </div>
    }
    <p-dialog [header]="editItem ? 'Edit Account' : 'Create Account'" [(visible)]="formVisible" [modal]="true" [style]="{width:'600px'}">
      <form [formGroup]="form" class="flex flex-col gap-4 pt-2">
        <div class="grid grid-cols-4 gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Code *</label>
            <input pInputText formControlName="code" placeholder="MEITY" maxlength="5" class="w-full uppercase font-mono" />
          </div>
          <div class="flex flex-col gap-1 col-span-2">
            <label class="text-sm font-medium text-gray-700">Name *</label>
            <input pInputText formControlName="name" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Short Name</label>
            <input pInputText formControlName="shortName" placeholder="MeitY" class="w-full" />
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Account Type *</label>
          <p-select appendTo="body" formControlName="accountType" [options]="typeOptions()" optionLabel="label" optionValue="value" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Government</label>
          <p-select appendTo="body" formControlName="governmentId" [options]="govOptions()" optionLabel="name" optionValue="id" [filter]="true" filterBy="name" [showClear]="true" placeholder="Select government" class="w-full" />
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Phone</label>
            <input pInputText formControlName="phone" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Email</label>
            <input pInputText formControlName="email" type="email" class="w-full" />
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Website</label>
          <input pInputText formControlName="website" placeholder="https://..." class="w-full" />
        </div>
        <div class="grid grid-cols-3 gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">City</label>
            <input pInputText formControlName="city" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">State</label>
            <input pInputText formControlName="state" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Pincode</label>
            <input pInputText formControlName="pincode" class="w-full" />
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Address</label>
          <textarea pTextarea formControlName="address" rows="2" class="w-full"></textarea>
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
export class AccountListComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly confirm = inject(ConfirmationService);
  private readonly msg = inject(MessageService);

  accounts = signal<Account[]>([]);
  loading = signal(true);
  formVisible = false;
  editItem: Account | null = null;
  saving = false;
  serverError = '';
  typeOptions = signal<Array<{ label: string; value: string }>>([]);
  govOptions = signal<GovOption[]>([]);

  form = this.fb.group({
    code: ['', [Validators.required, Validators.maxLength(5), Validators.pattern(/^\S+$/)]],
    name: ['', [Validators.required, Validators.maxLength(255)]],
    shortName: [''],
    accountType: ['GOVERNMENT_DEPARTMENT', Validators.required],
    governmentId: [''],
    phone: [''], email: [''], website: [''],
    city: [''], state: [''], pincode: [''],
    address: [''], notes: [''],
  });

  ngOnInit(): void { this.load(); this.loadTypeOptions(); this.loadGovOptions(); }

  private loadTypeOptions(): void {
    this.http.get<{ data: Array<{ label: string; value: string; isActive: boolean }> }>(
      `${environment.apiBaseUrl}/lookup-lists/by-code/account_type/items`,
    ).subscribe({
      next: (r) => this.typeOptions.set(r.data.filter((i) => i.isActive)),
      error: () => {}, // list may not exist yet
    });
  }

  load(): void {
    this.loading.set(true);
    this.http.get<{ data: Account[] }>(`${environment.apiBaseUrl}/accounts?limit=200`).subscribe({
      next: (r) => { this.accounts.set(r.data); this.loading.set(false); },
      error: () => { this.loading.set(false); },
    });
  }

  private loadGovOptions(): void {
    this.http.get<{ data: GovOption[] }>(`${environment.apiBaseUrl}/governments?limit=200`).subscribe({
      next: (r) => this.govOptions.set(r.data),
    });
  }

  formatType(t: string): string {
    return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).replace(/Psu/, 'PSU');
  }

  openCreate(): void { this.editItem = null; this.form.reset({ accountType: 'GOVERNMENT_DEPARTMENT' }); this.serverError = ''; this.formVisible = true; }

  openEdit(a: Account): void {
    this.editItem = a;
    this.form.patchValue({ code: a.code, name: a.name, shortName: a.shortName ?? '', accountType: a.accountType, governmentId: a.governmentId ?? '', phone: a.phone ?? '', email: a.email ?? '', website: a.website ?? '', city: a.city ?? '', state: a.state ?? '', pincode: a.pincode ?? '', address: a.address ?? '', notes: a.notes ?? '' });
    this.serverError = ''; this.formVisible = true;
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    this.saving = true; this.serverError = '';
    const body: Record<string, unknown> = {};
    const v = this.form.value;
    for (const [k, val] of Object.entries(v)) { if (val) body[k] = val; }
    const url = `${environment.apiBaseUrl}/accounts`;
    const req$ = this.editItem ? this.http.patch(`${url}/${this.editItem.id}`, body) : this.http.post(url, body);
    req$.subscribe({
      next: () => { this.saving = false; this.formVisible = false; this.msg.add({ severity: 'success', summary: 'Success' }); this.load(); },
      error: (err: HttpErrorResponse) => { this.saving = false; this.serverError = err.error?.error?.message ?? 'Error'; },
    });
  }

  confirmDelete(a: Account): void {
    this.confirm.confirm({
      message: `Delete "${a.name}"?`, header: 'Delete Account', icon: 'pi pi-exclamation-triangle', acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.http.delete(`${environment.apiBaseUrl}/accounts/${a.id}`).subscribe({
          next: () => { this.msg.add({ severity: 'success', summary: 'Deleted' }); this.load(); },
          error: (err: HttpErrorResponse) => this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed' }),
        });
      },
    });
  }
}
