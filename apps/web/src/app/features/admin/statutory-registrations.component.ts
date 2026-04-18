import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { ConfirmationService, MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';

interface Registration {
  id: string;
  name: string;
  registrationId: string;
  portalUrl: string | null;
  login?: string | null;
  password?: string | null;
  mobile?: string | null;
  email?: string | null;
  createdAt: string;
}

@Component({
  selector: 'app-statutory-registrations',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, FormsModule, TableModule, ButtonModule,
    DialogModule, InputTextModule, ConfirmDialogModule, ToastModule,
  ],
  providers: [ConfirmationService, MessageService],
  template: `
    <p-toast />
    <p-confirmDialog />

    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-semibold text-gray-800">Statutory Registrations</h2>
        <p class="text-sm text-gray-500 mt-1">PAN, GST, TAN, EPF, ESIC and other registrations</p>
      </div>
      <div class="flex gap-2 items-center">
        @if (!unlocked()) {
          <p-button label="Unlock" icon="pi pi-lock" severity="warn" [outlined]="true" (onClick)="showUnlockDialog()" />
        } @else {
          <span class="text-xs text-green-600 flex items-center gap-1 mr-2"><i class="pi pi-unlock"></i> Unlocked</span>
          <p-button label="Add Registration" icon="pi pi-plus" (onClick)="openCreate()" />
        }
      </div>
    </div>

    @if (loading()) {
      <div class="flex items-center gap-2 text-gray-500 py-12 justify-center">
        <i class="pi pi-spin pi-spinner text-2xl"></i> Loading...
      </div>
    } @else {
      <div class="bg-white rounded-lg shadow-sm border border-gray-200">
        <p-table [value]="registrations()" styleClass="p-datatable-sm">
          <ng-template pTemplate="header">
            <tr>
              <th class="font-semibold">Name</th>
              <th class="font-semibold">Registration ID</th>
              <th class="font-semibold">Portal</th>
              @if (unlocked()) {
                <th class="font-semibold">Login</th>
                <th class="font-semibold">Password</th>
                <th class="font-semibold">Mobile</th>
                <th class="font-semibold">Email</th>
                <th class="font-semibold" style="width:150px">Actions</th>
              }
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-reg>
            <tr>
              <td><span class="font-medium">{{ reg.name }}</span></td>
              <td><span class="text-sm font-mono">{{ reg.registrationId }}</span></td>
              <td>
                @if (reg.portalUrl) {
                  <a [href]="reg.portalUrl" target="_blank" class="text-sm text-blue-600 hover:underline">
                    <i class="pi pi-external-link mr-1"></i>Open
                  </a>
                } @else {
                  <span class="text-sm text-gray-400">—</span>
                }
              </td>
              @if (unlocked()) {
                <td><span class="text-sm">{{ reg.login || '—' }}</span></td>
                <td><span class="text-sm">{{ reg.password || '—' }}</span></td>
                <td><span class="text-sm">{{ reg.mobile || '—' }}</span></td>
                <td><span class="text-sm">{{ reg.email || '—' }}</span></td>
                <td>
                  <div class="flex gap-1">
                    <p-button icon="pi pi-pencil" [rounded]="true" [text]="true" severity="info" size="small" (onClick)="openEdit(reg)" />
                    <p-button icon="pi pi-trash" [rounded]="true" [text]="true" severity="danger" size="small" (onClick)="confirmDelete(reg)" />
                  </div>
                </td>
              }
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td [attr.colspan]="unlocked() ? 8 : 3" class="text-center py-8 text-gray-500">No registrations yet.</td></tr>
          </ng-template>
        </p-table>
      </div>
    }

    <!-- Unlock Password Dialog -->
    <p-dialog header="Enter Password" [(visible)]="unlockDialogVisible" [modal]="true" [style]="{width:'380px'}">
      <div class="flex flex-col gap-3 pt-2">
        <p class="text-sm text-gray-600">Enter the configuration password to manage registrations.</p>
        <input pInputText [(ngModel)]="unlockPasswordInput" type="password" placeholder="Password" class="w-full"
               (keyup.enter)="attemptUnlock()" />
        @if (unlockError) {
          <div class="p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">{{ unlockError }}</div>
        }
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="unlockDialogVisible=false" />
        <p-button label="Unlock" icon="pi pi-unlock" (onClick)="attemptUnlock()" [disabled]="!unlockPasswordInput" />
      </ng-template>
    </p-dialog>

    <!-- Add/Edit Dialog -->
    @if (unlocked()) {
      <p-dialog [header]="editReg ? 'Edit Registration' : 'Add Registration'"
                [(visible)]="formVisible" [modal]="true" [style]="{width:'550px'}">
        <form [formGroup]="form" class="flex flex-col gap-4 pt-2">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Name *</label>
            <input pInputText formControlName="name" placeholder="e.g. GST Registration" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Registration ID *</label>
            <input pInputText formControlName="registrationId" placeholder="e.g. 22ABCDE1234F1Z5" class="w-full font-mono" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Portal URL</label>
            <input pInputText formControlName="portalUrl" placeholder="https://..." class="w-full" />
          </div>
          <div class="border-t border-gray-200 pt-3 mt-1">
            <p class="text-xs text-gray-500 mb-3 flex items-center gap-1">
              <i class="pi pi-lock text-amber-500"></i> Sensitive fields
            </p>
            <div class="grid grid-cols-2 gap-4">
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Login</label>
                <input pInputText formControlName="login" class="w-full" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Password</label>
                <input pInputText formControlName="password" class="w-full" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Associated Mobile</label>
                <input pInputText formControlName="mobile" placeholder="+91..." class="w-full" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Associated Email</label>
                <input pInputText formControlName="email" type="email" class="w-full" />
              </div>
            </div>
          </div>
          @if (serverError) {
            <div class="p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">{{ serverError }}</div>
          }
        </form>
        <ng-template pTemplate="footer">
          <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="formVisible=false" />
          <p-button [label]="editReg ? 'Save' : 'Create'" type="submit" [loading]="saving"
                    [disabled]="form.invalid||saving" (onClick)="onSubmit()" />
        </ng-template>
      </p-dialog>
    }
  `,
})
export class StatutoryRegistrationsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly confirm = inject(ConfirmationService);
  private readonly msg = inject(MessageService);

  registrations = signal<Registration[]>([]);
  loading = signal(true);
  formVisible = false;
  editReg: Registration | null = null;
  saving = false;
  serverError = '';

  // Unlock
  unlocked = signal(false);
  configuredPassword = '';
  unlockDialogVisible = false;
  unlockPasswordInput = '';
  unlockError = '';

  form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(128)]],
    registrationId: ['', [Validators.required, Validators.maxLength(128)]],
    portalUrl: [''],
    login: [''],
    password: [''],
    mobile: [''],
    email: [''],
  });

  ngOnInit(): void {
    this.loadConfig();
    this.loadPublic();
  }

  private loadConfig(): void {
    this.http.get<{ data: Record<string, string> }>(`${environment.apiBaseUrl}/config`).subscribe({
      next: (r) => { this.configuredPassword = r.data['statutoryRevealPassword'] ?? ''; },
    });
  }

  /** Load public fields only — always shown */
  private loadPublic(): void {
    this.loading.set(true);
    this.http.get<{ data: Registration[] }>(`${environment.apiBaseUrl}/statutory-registrations`).subscribe({
      next: (r) => { this.registrations.set(r.data); this.loading.set(false); },
      error: () => { this.loading.set(false); },
    });
  }

  /** Load with full sensitive fields after unlock */
  private loadFull(): void {
    this.loading.set(true);
    this.http.get<{ data: Registration[] }>(`${environment.apiBaseUrl}/statutory-registrations`).subscribe({
      next: (r) => {
        if (r.data.length === 0) {
          this.registrations.set([]);
          this.loading.set(false);
          return;
        }
        const fetches = r.data.map((reg) =>
          this.http.get<{ data: Registration }>(`${environment.apiBaseUrl}/statutory-registrations/${reg.id}?reveal=true`).toPromise(),
        );
        Promise.all(fetches).then((results) => {
          this.registrations.set(results.map((res) => res!.data));
          this.loading.set(false);
        }).catch(() => { this.loading.set(false); });
      },
      error: () => { this.loading.set(false); },
    });
  }

  showUnlockDialog(): void {
    if (!this.configuredPassword) {
      this.msg.add({ severity: 'warn', summary: 'No Password Set', detail: 'Set a reveal password in Configuration first.' });
      return;
    }
    this.unlockPasswordInput = '';
    this.unlockError = '';
    this.unlockDialogVisible = true;
  }

  attemptUnlock(): void {
    if (this.unlockPasswordInput !== this.configuredPassword) {
      this.unlockError = 'Incorrect password';
      return;
    }
    this.unlockError = '';
    this.unlockDialogVisible = false;
    this.unlocked.set(true);
    this.loadFull();
  }

  openCreate(): void {
    this.editReg = null;
    this.form.reset();
    this.serverError = '';
    this.formVisible = true;
  }

  openEdit(reg: Registration): void {
    this.editReg = reg;
    this.form.patchValue({
      name: reg.name,
      registrationId: reg.registrationId,
      portalUrl: reg.portalUrl ?? '',
      login: reg.login ?? '',
      password: reg.password ?? '',
      mobile: reg.mobile ?? '',
      email: reg.email ?? '',
    });
    this.serverError = '';
    this.formVisible = true;
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    this.saving = true; this.serverError = '';
    const body: Record<string, unknown> = {};
    const v = this.form.value;
    if (v.name) body['name'] = v.name;
    if (v.registrationId) body['registrationId'] = v.registrationId;
    if (v.portalUrl) body['portalUrl'] = v.portalUrl;
    if (v.login) body['login'] = v.login;
    if (v.password) body['password'] = v.password;
    if (v.mobile) body['mobile'] = v.mobile;
    if (v.email) body['email'] = v.email;

    const url = `${environment.apiBaseUrl}/statutory-registrations`;
    const req$ = this.editReg
      ? this.http.patch(`${url}/${this.editReg.id}`, body)
      : this.http.post(url, body);

    req$.subscribe({
      next: () => {
        this.saving = false; this.formVisible = false;
        this.msg.add({ severity: 'success', summary: 'Success', detail: this.editReg ? 'Updated' : 'Created' });
        this.loadFull();
      },
      error: (err: HttpErrorResponse) => {
        this.saving = false;
        this.serverError = err.error?.error?.message ?? 'An error occurred';
      },
    });
  }

  confirmDelete(reg: Registration): void {
    this.confirm.confirm({
      message: `Delete "${reg.name}"?`,
      header: 'Delete Registration',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.http.delete(`${environment.apiBaseUrl}/statutory-registrations/${reg.id}`).subscribe({
          next: () => { this.msg.add({ severity: 'success', summary: 'Deleted' }); this.loadFull(); },
          error: (err: HttpErrorResponse) => this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed' }),
        });
      },
    });
  }
}
