import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { PasswordModule } from 'primeng/password';
import { InputSwitchModule } from 'primeng/inputswitch';
import { ConfirmationService, MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';

interface RoleRef { id: string; name: string; displayName: string; }

interface User {
  id: string;
  externalId: string;
  email: string;
  fullName: string;
  phone: string | null;
  status: string;
  roles: RoleRef[];
  createdAt: string;
}

interface RoleOption { id: string; displayName: string; }

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, FormsModule, TableModule, TagModule, ButtonModule,
    DialogModule, InputTextModule, SelectModule, MultiSelectModule, ConfirmDialogModule, ToastModule,
    PasswordModule, InputSwitchModule,
  ],
  providers: [ConfirmationService, MessageService],
  template: `
    <p-toast />
    <p-confirmDialog />

    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-semibold text-gray-800">Users</h2>
        <p class="text-sm text-gray-500 mt-1">Manage platform users</p>
      </div>
      <p-button label="Create User" icon="pi pi-plus" (onClick)="openCreate()" />
    </div>

    @if (loading()) {
      <div class="flex items-center gap-2 text-gray-500 py-12 justify-center">
        <i class="pi pi-spin pi-spinner text-2xl"></i> Loading...
      </div>
    } @else {
      <div class="bg-white rounded-lg shadow-sm border border-gray-200">
        <p-table [value]="users()" styleClass="p-datatable-sm">
          <ng-template pTemplate="header">
            <tr>
              <th class="font-semibold">Name</th>
              <th class="font-semibold">Email</th>
              <th class="font-semibold">Roles</th>
              <th class="font-semibold">Phone</th>
              <th class="font-semibold">Status</th>
              <th class="font-semibold">Created</th>
              <th class="font-semibold" style="width: 150px">Actions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-user>
            <tr>
              <td><span class="font-medium">{{ user.fullName }}</span></td>
              <td><span class="text-sm">{{ user.email }}</span></td>
              <td>
                <div class="flex flex-wrap gap-1">
                  @for (r of user.roles; track r.id) {
                    <p-tag [value]="r.displayName" severity="info" [style]="{'font-size':'0.7rem'}" />
                  }
                  @if (user.roles.length === 0) {
                    <span class="text-xs text-gray-400">None</span>
                  }
                </div>
              </td>
              <td><span class="text-sm text-gray-600">{{ user.phone || '—' }}</span></td>
              <td>
                <p-tag [value]="user.status"
                  [severity]="user.status === 'ACTIVE' ? 'success' : user.status === 'SUSPENDED' ? 'danger' : 'warn'" />
              </td>
              <td><span class="text-sm text-gray-500">{{ user.createdAt | date:'mediumDate' }}</span></td>
              <td>
                <div class="flex gap-1">
                  <p-button icon="pi pi-pencil" [rounded]="true" [text]="true" severity="info" size="small" pTooltip="Edit" (onClick)="openEdit(user)" />
                  <p-button icon="pi pi-key" [rounded]="true" [text]="true" severity="warn" size="small" pTooltip="Reset Password" (onClick)="openResetPassword(user)" />
                  <p-button icon="pi pi-trash" [rounded]="true" [text]="true" severity="danger" size="small" pTooltip="Delete" (onClick)="confirmDelete(user)" />
                </div>
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td colspan="7" class="text-center py-8 text-gray-500">No users yet.</td></tr>
          </ng-template>
        </p-table>
      </div>
    }

    <p-dialog [header]="editUser ? 'Edit User' : 'Create User'" [(visible)]="formVisible" [modal]="true" [style]="{width:'500px'}">
      <form [formGroup]="form" (ngSubmit)="onSubmit()" class="flex flex-col gap-4 pt-2">
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Full Name *</label>
          <input pInputText formControlName="fullName" placeholder="e.g. Rajesh Kumar" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Email *</label>
          <input pInputText formControlName="email" type="email" placeholder="user&#64;company.com" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">External ID (Keycloak sub) *</label>
          <input pInputText formControlName="externalId" placeholder="Keycloak subject ID" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Roles</label>
          <p-multiSelect appendTo="body" formControlName="roleIds" [options]="roleOptions()" optionLabel="displayName"
                         optionValue="id" placeholder="Select roles" display="chip" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Phone</label>
          <input pInputText formControlName="phone" placeholder="+91..." class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Status</label>
          <p-select appendTo="body" formControlName="status" [options]="statusOptions" optionLabel="label" optionValue="value" class="w-full" />
        </div>
        @if (serverError) {
          <div class="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{{ serverError }}</div>
        }
        <div class="flex justify-end gap-2 pt-2">
          <p-button label="Cancel" severity="secondary" [outlined]="true" (onClick)="formVisible=false" />
          <p-button [label]="editUser ? 'Save' : 'Create'" type="submit" [loading]="saving" [disabled]="form.invalid||saving" />
        </div>
      </form>
    </p-dialog>

    <!-- Reset Password Dialog -->
    <p-dialog header="Reset Password" [(visible)]="resetPwVisible" [modal]="true" [style]="{width:'420px'}">
      @if (resetPwUser) {
        <div class="flex flex-col gap-4 pt-2">
          <div class="text-sm text-gray-600">
            Reset password for <strong>{{ resetPwUser.fullName }}</strong> ({{ resetPwUser.email }})
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">New Password *</label>
            <p-password appendTo="body" [(ngModel)]="resetPwValue" [toggleMask]="true" [feedback]="true" styleClass="w-full" />
          </div>
          <div class="flex items-center gap-2">
            <p-inputSwitch [(ngModel)]="resetPwTemporary" />
            <label class="text-sm text-gray-700">Require change on next login</label>
          </div>
          @if (resetPwError) {
            <div class="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{{ resetPwError }}</div>
          }
        </div>
      }
      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="resetPwVisible=false" />
        <p-button label="Reset Password" icon="pi pi-key" severity="warn" [loading]="resetPwSaving" [disabled]="!resetPwValue || resetPwValue.length < 4" (onClick)="doResetPassword()" />
      </ng-template>
    </p-dialog>
  `,
})
export class UsersComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly confirm = inject(ConfirmationService);
  private readonly msg = inject(MessageService);

  users = signal<User[]>([]);
  roleOptions = signal<RoleOption[]>([]);
  loading = signal(true);
  formVisible = false;
  editUser: User | null = null;
  saving = false;
  serverError = '';
  statusOptions = [
    { label: 'Active', value: 'ACTIVE' },
    { label: 'Inactive', value: 'INACTIVE' },
    { label: 'Suspended', value: 'SUSPENDED' },
  ];

  form = this.fb.group({
    fullName: ['', [Validators.required, Validators.maxLength(255)]],
    email: ['', [Validators.required, Validators.email]],
    externalId: ['', [Validators.required]],
    phone: [''],
    status: ['ACTIVE'],
    roleIds: [[] as string[]],
  });

  ngOnInit(): void {
    this.loadRoles();
    this.load();
  }

  private loadRoles(): void {
    this.http.get<{ data: RoleOption[] }>(`${environment.apiBaseUrl}/roles?limit=200`).subscribe({
      next: (r) => this.roleOptions.set(r.data),
    });
  }

  load(): void {
    this.loading.set(true);
    this.http.get<{ data: User[] }>(`${environment.apiBaseUrl}/users`).subscribe({
      next: (r) => { this.users.set(r.data); this.loading.set(false); },
      error: () => { this.msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to load users' }); this.loading.set(false); },
    });
  }

  openCreate(): void {
    this.editUser = null;
    this.form.reset({ status: 'ACTIVE', roleIds: [] });
    this.serverError = '';
    this.formVisible = true;
  }

  openEdit(u: User): void {
    this.editUser = u;
    this.form.patchValue({
      fullName: u.fullName,
      email: u.email,
      externalId: u.externalId,
      phone: u.phone ?? '',
      status: u.status,
      roleIds: u.roles.map((r) => r.id),
    });
    this.serverError = '';
    this.formVisible = true;
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    this.saving = true; this.serverError = '';
    const body: Record<string, unknown> = { ...this.form.value };
    if (!body['phone']) delete body['phone'];
    const url = `${environment.apiBaseUrl}/users`;
    const req$ = this.editUser
      ? this.http.patch<{ data: User }>(`${url}/${this.editUser.id}`, body)
      : this.http.post<{ data: User }>(url, body);
    req$.subscribe({
      next: (res) => {
        this.saving = false; this.formVisible = false;
        this.msg.add({ severity: 'success', summary: 'Success', detail: `"${res.data.fullName}" ${this.editUser ? 'updated' : 'created'}` });
        this.load();
      },
      error: (err: HttpErrorResponse) => { this.saving = false; this.serverError = err.error?.error?.message ?? 'An error occurred'; },
    });
  }

  // ---- Reset Password ----
  resetPwVisible = false;
  resetPwUser: User | null = null;
  resetPwValue = '';
  resetPwTemporary = false;
  resetPwSaving = false;
  resetPwError = '';

  openResetPassword(u: User): void {
    this.resetPwUser = u;
    this.resetPwValue = '';
    this.resetPwTemporary = false;
    this.resetPwError = '';
    this.resetPwVisible = true;
  }

  doResetPassword(): void {
    if (!this.resetPwUser || !this.resetPwValue) return;
    this.resetPwSaving = true;
    this.resetPwError = '';
    this.http.post<{ data: { success: boolean; message: string } }>(
      `${environment.apiBaseUrl}/users/${this.resetPwUser.id}/reset-password`,
      { newPassword: this.resetPwValue, temporary: this.resetPwTemporary },
    ).subscribe({
      next: (r) => {
        this.resetPwSaving = false;
        this.resetPwVisible = false;
        this.msg.add({ severity: 'success', summary: 'Password Reset', detail: r.data.message });
      },
      error: (err: HttpErrorResponse) => {
        this.resetPwSaving = false;
        this.resetPwError = err.error?.error?.message ?? 'Failed to reset password';
      },
    });
  }

  confirmDelete(u: User): void {
    this.confirm.confirm({
      message: `Delete user "${u.fullName}"?`,
      header: 'Delete User',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.http.delete(`${environment.apiBaseUrl}/users/${u.id}`).subscribe({
          next: () => { this.msg.add({ severity: 'success', summary: 'Deleted', detail: `"${u.fullName}" deleted` }); this.load(); },
          error: (err: HttpErrorResponse) => this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed' }),
        });
      },
    });
  }
}
