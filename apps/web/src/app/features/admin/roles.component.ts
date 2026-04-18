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
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { ConfirmationService, MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';

interface Role {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  permissions: string[] | null;
  isSystem: boolean;
  createdAt: string;
}

@Component({
  selector: 'app-roles',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, TableModule, TagModule, ButtonModule,
    DialogModule, InputTextModule, TextareaModule, ConfirmDialogModule, ToastModule,
  ],
  providers: [ConfirmationService, MessageService],
  template: `
    <p-toast />
    <p-confirmDialog />

    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-semibold text-gray-800">Roles</h2>
        <p class="text-sm text-gray-500 mt-1">Manage roles for BU member assignments</p>
      </div>
      <p-button label="Create Role" icon="pi pi-plus" (onClick)="openCreate()" />
    </div>

    @if (loading()) {
      <div class="flex items-center gap-2 text-gray-500 py-12 justify-center">
        <i class="pi pi-spin pi-spinner text-2xl"></i> Loading...
      </div>
    } @else {
      <div class="bg-white rounded-lg shadow-sm border border-gray-200">
        <p-table [value]="roles()" styleClass="p-datatable-sm">
          <ng-template pTemplate="header">
            <tr>
              <th class="font-semibold">Name</th>
              <th class="font-semibold">Display Name</th>
              <th class="font-semibold">Type</th>
              <th class="font-semibold">Created</th>
              <th class="font-semibold" style="width: 150px">Actions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-role>
            <tr>
              <td><span class="font-mono text-sm">{{ role.name }}</span></td>
              <td>
                <span class="font-medium">{{ role.displayName }}</span>
                @if (role.description) {
                  <p class="text-xs text-gray-500 mt-0.5">{{ role.description }}</p>
                }
              </td>
              <td>
                <p-tag [value]="role.isSystem ? 'System' : 'Custom'" [severity]="role.isSystem ? 'info' : 'success'" />
              </td>
              <td><span class="text-sm text-gray-500">{{ role.createdAt | date:'mediumDate' }}</span></td>
              <td>
                <div class="flex gap-1">
                  <p-button icon="pi pi-pencil" [rounded]="true" [text]="true" severity="info" size="small"
                    (onClick)="openEdit(role)" [disabled]="role.isSystem" />
                  <p-button icon="pi pi-trash" [rounded]="true" [text]="true" severity="danger" size="small"
                    (onClick)="confirmDelete(role)" [disabled]="role.isSystem" />
                </div>
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td colspan="5" class="text-center py-8 text-gray-500">No roles defined yet.</td></tr>
          </ng-template>
        </p-table>
      </div>
    }

    <p-dialog [header]="editRole ? 'Edit Role' : 'Create Role'" [(visible)]="formVisible" [modal]="true" [style]="{width:'450px'}">
      <form [formGroup]="form" (ngSubmit)="onSubmit()" class="flex flex-col gap-4 pt-2">
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Name (slug) *</label>
          <input pInputText formControlName="name" placeholder="e.g. project_manager" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Display Name *</label>
          <input pInputText formControlName="displayName" placeholder="e.g. Project Manager" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Description</label>
          <textarea pTextarea formControlName="description" rows="2" class="w-full"></textarea>
        </div>
        @if (serverError) {
          <div class="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{{ serverError }}</div>
        }
        <div class="flex justify-end gap-2 pt-2">
          <p-button label="Cancel" severity="secondary" [outlined]="true" (onClick)="formVisible=false" />
          <p-button [label]="editRole ? 'Save' : 'Create'" type="submit" [loading]="saving" [disabled]="form.invalid||saving" />
        </div>
      </form>
    </p-dialog>
  `,
})
export class RolesComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly confirm = inject(ConfirmationService);
  private readonly msg = inject(MessageService);

  roles = signal<Role[]>([]);
  loading = signal(true);
  formVisible = false;
  editRole: Role | null = null;
  saving = false;
  serverError = '';

  form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(64)]],
    displayName: ['', [Validators.required, Validators.maxLength(128)]],
    description: [''],
  });

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.http.get<{ data: Role[] }>(`${environment.apiBaseUrl}/roles`).subscribe({
      next: (r) => { this.roles.set(r.data); this.loading.set(false); },
      error: () => { this.msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to load roles' }); this.loading.set(false); },
    });
  }

  openCreate(): void { this.editRole = null; this.form.reset(); this.serverError = ''; this.formVisible = true; }

  openEdit(r: Role): void {
    this.editRole = r;
    this.form.patchValue({ name: r.name, displayName: r.displayName, description: r.description ?? '' });
    this.serverError = '';
    this.formVisible = true;
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    this.saving = true; this.serverError = '';
    const body: Record<string, unknown> = { ...this.form.value };
    if (!body['description']) delete body['description'];
    const url = `${environment.apiBaseUrl}/roles`;
    const req$ = this.editRole
      ? this.http.patch<{ data: Role }>(`${url}/${this.editRole.id}`, body)
      : this.http.post<{ data: Role }>(url, body);
    req$.subscribe({
      next: (res) => {
        this.saving = false; this.formVisible = false;
        this.msg.add({ severity: 'success', summary: 'Success', detail: `"${res.data.displayName}" ${this.editRole ? 'updated' : 'created'}` });
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.saving = false;
        this.serverError = err.error?.error?.message ?? 'An error occurred';
      },
    });
  }

  confirmDelete(r: Role): void {
    this.confirm.confirm({
      message: `Delete role "${r.displayName}"?`,
      header: 'Delete Role',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.http.delete(`${environment.apiBaseUrl}/roles/${r.id}`).subscribe({
          next: () => { this.msg.add({ severity: 'success', summary: 'Deleted', detail: `"${r.displayName}" deleted` }); this.load(); },
          error: (err: HttpErrorResponse) => this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed' }),
        });
      },
    });
  }
}
