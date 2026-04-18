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
import { MultiSelectModule } from 'primeng/multiselect';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { ConfirmationService, MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';

interface AccountRef { id: string; name: string; }
interface Contact {
  id: string; firstName: string; lastName: string | null; designation: string | null;
  department: string | null; email: string | null; phone: string | null; mobile: string | null;
  influenceLevel: string | null; accounts: AccountRef[]; notes: string | null; createdAt: string;
}

@Component({
  selector: 'app-contact-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TableModule, TagModule, ButtonModule, DialogModule, InputTextModule, TextareaModule, SelectModule, MultiSelectModule, ConfirmDialogModule, ToastModule],
  providers: [ConfirmationService, MessageService],
  template: `
    <p-toast /><p-confirmDialog />
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-semibold text-gray-800">Contacts</h2>
        <p class="text-sm text-gray-500 mt-1">Officers and decision makers across government accounts</p>
      </div>
      <p-button label="Create Contact" icon="pi pi-plus" (onClick)="openCreate()" />
    </div>
    @if (loading()) {
      <div class="flex items-center gap-2 text-gray-500 py-12 justify-center"><i class="pi pi-spin pi-spinner text-2xl"></i> Loading...</div>
    } @else {
      <div class="bg-white rounded-lg shadow-sm border border-gray-200">
        <p-table [value]="contacts()" styleClass="p-datatable-sm">
          <ng-template pTemplate="header">
            <tr>
              <th class="font-semibold">Name</th>
              <th class="font-semibold">Accounts</th>
              <th class="font-semibold">Designation</th>
              <th class="font-semibold">Email</th>
              <th class="font-semibold">Mobile</th>
              <th class="font-semibold">Influence</th>
              <th class="font-semibold" style="width:150px">Actions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-c>
            <tr>
              <td><span class="font-medium">{{ c.firstName }} {{ c.lastName || '' }}</span></td>
              <td>
                <div class="flex flex-wrap gap-1">
                  @for (a of c.accounts; track a.id) {
                    <p-tag [value]="a.name" severity="info" [style]="{'font-size':'0.65rem'}" />
                  }
                  @if (c.accounts.length === 0) { <span class="text-sm text-gray-400">—</span> }
                </div>
              </td>
              <td><span class="text-sm">{{ c.designation || '—' }}</span></td>
              <td><span class="text-sm">{{ c.email || '—' }}</span></td>
              <td><span class="text-sm">{{ c.mobile || c.phone || '—' }}</span></td>
              <td>
                @if (c.influenceLevel) {
                  <p-tag [value]="c.influenceLevel" [severity]="influenceSeverity(c.influenceLevel)" [style]="{'font-size':'0.7rem'}" />
                } @else { <span class="text-sm text-gray-400">—</span> }
              </td>
              <td>
                <div class="flex gap-1">
                  <p-button icon="pi pi-pencil" [rounded]="true" [text]="true" severity="info" size="small" (onClick)="openEdit(c)" />
                  <p-button icon="pi pi-trash" [rounded]="true" [text]="true" severity="danger" size="small" (onClick)="confirmDelete(c)" />
                </div>
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td colspan="7" class="text-center py-8 text-gray-500">No contacts yet.</td></tr>
          </ng-template>
        </p-table>
      </div>
    }
    <p-dialog [header]="editItem ? 'Edit Contact' : 'Create Contact'" [(visible)]="formVisible" [modal]="true" [style]="{width:'550px'}">
      <form [formGroup]="form" class="flex flex-col gap-4 pt-2">
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">First Name *</label>
            <input pInputText formControlName="firstName" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Last Name</label>
            <input pInputText formControlName="lastName" class="w-full" />
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Accounts</label>
          <p-multiSelect appendTo="body" formControlName="accountIds" [options]="accountOptions()" optionLabel="name"
                         optionValue="id" placeholder="Select accounts" display="chip" class="w-full" />
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Designation</label>
            <input pInputText formControlName="designation" placeholder="e.g. Joint Secretary" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Department</label>
            <input pInputText formControlName="department" class="w-full" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Email</label>
            <input pInputText formControlName="email" type="email" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Mobile</label>
            <input pInputText formControlName="mobile" class="w-full" />
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Influence Level</label>
          <p-select appendTo="body" formControlName="influenceLevel" [options]="influenceOptions" optionLabel="label" optionValue="value" [showClear]="true" placeholder="Select" class="w-full" />
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
export class ContactListComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly confirm = inject(ConfirmationService);
  private readonly msg = inject(MessageService);

  contacts = signal<Contact[]>([]);
  accountOptions = signal<AccountRef[]>([]);
  loading = signal(true);
  formVisible = false;
  editItem: Contact | null = null;
  saving = false;
  serverError = '';
  influenceOptions = [
    { label: 'Low', value: 'LOW' }, { label: 'Medium', value: 'MEDIUM' },
    { label: 'High', value: 'HIGH' }, { label: 'Champion', value: 'CHAMPION' },
  ];

  form = this.fb.group({
    firstName: ['', [Validators.required, Validators.maxLength(128)]],
    lastName: [''], designation: [''], department: [''],
    email: [''], mobile: [''], influenceLevel: [''], notes: [''],
    accountIds: [[] as string[]],
  });

  ngOnInit(): void { this.load(); this.loadAccounts(); }

  load(): void {
    this.loading.set(true);
    this.http.get<{ data: Contact[] }>(`${environment.apiBaseUrl}/contacts?limit=200`).subscribe({
      next: (r) => { this.contacts.set(r.data); this.loading.set(false); },
      error: () => { this.loading.set(false); },
    });
  }

  private loadAccounts(): void {
    this.http.get<{ data: AccountRef[] }>(`${environment.apiBaseUrl}/accounts?limit=200`).subscribe({
      next: (r) => this.accountOptions.set(r.data),
    });
  }

  influenceSeverity(level: string): 'info' | 'success' | 'warn' | 'danger' {
    switch (level) { case 'CHAMPION': return 'success'; case 'HIGH': return 'info'; case 'MEDIUM': return 'warn'; default: return 'info'; }
  }

  openCreate(): void { this.editItem = null; this.form.reset({ accountIds: [] }); this.serverError = ''; this.formVisible = true; }

  openEdit(c: Contact): void {
    this.editItem = c;
    this.form.patchValue({
      firstName: c.firstName, lastName: c.lastName ?? '', designation: c.designation ?? '',
      department: c.department ?? '', email: c.email ?? '', mobile: c.mobile ?? '',
      influenceLevel: c.influenceLevel ?? '', notes: c.notes ?? '',
      accountIds: c.accounts.map((a) => a.id),
    });
    this.serverError = ''; this.formVisible = true;
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    this.saving = true; this.serverError = '';
    const body: Record<string, unknown> = {};
    const v = this.form.value;
    for (const [k, val] of Object.entries(v)) {
      if (k === 'accountIds') { body[k] = val; continue; }
      if (val) body[k] = val;
    }
    const url = `${environment.apiBaseUrl}/contacts`;
    const req$ = this.editItem ? this.http.patch(`${url}/${this.editItem.id}`, body) : this.http.post(url, body);
    req$.subscribe({
      next: () => { this.saving = false; this.formVisible = false; this.msg.add({ severity: 'success', summary: 'Success' }); this.load(); },
      error: (err: HttpErrorResponse) => { this.saving = false; this.serverError = err.error?.error?.message ?? 'Error'; },
    });
  }

  confirmDelete(c: Contact): void {
    this.confirm.confirm({
      message: `Delete "${c.firstName} ${c.lastName || ''}"?`, header: 'Delete Contact', icon: 'pi pi-exclamation-triangle', acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.http.delete(`${environment.apiBaseUrl}/contacts/${c.id}`).subscribe({
          next: () => { this.msg.add({ severity: 'success', summary: 'Deleted' }); this.load(); },
          error: (err: HttpErrorResponse) => this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed' }),
        });
      },
    });
  }
}
