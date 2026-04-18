import { Component, EventEmitter, Input, OnChanges, OnInit, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { ButtonModule } from 'primeng/button';
import { environment } from '../../../environments/environment';

export interface BusinessUnit {
  id: string;
  name: string;
  description: string | null;
  costCentre: string | null;
  buHeadUserId: string;
  buHeadName: string | null;
  approvalThresholds: unknown;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface BuHeadOption {
  id: string;
  fullName: string;
}

@Component({
  selector: 'app-bu-form-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    DialogModule,
    InputTextModule,
    TextareaModule,
    SelectModule,
    ButtonModule,
  ],
  template: `
    <p-dialog
      [header]="editBu ? 'Edit Business Unit' : 'Create Business Unit'"
      [visible]="visible"
      (visibleChange)="onVisibleChange($event)"
      [modal]="true"
      [style]="{ width: '500px' }"
      [closable]="true"
    >
      <form [formGroup]="form" (ngSubmit)="onSubmit()" class="flex flex-col gap-4 pt-2">
        <div class="flex flex-col gap-1">
          <label for="name" class="text-sm font-medium text-gray-700">Name *</label>
          <input
            pInputText
            id="name"
            formControlName="name"
            placeholder="e.g. Infrastructure BU"
            class="w-full"
          />
          @if (form.get('name')?.touched && form.get('name')?.errors?.['required']) {
            <small class="text-red-500">Name is required</small>
          }
        </div>

        <div class="flex flex-col gap-1">
          <label for="description" class="text-sm font-medium text-gray-700">Description</label>
          <textarea
            pTextarea
            id="description"
            formControlName="description"
            rows="3"
            placeholder="Optional description"
            class="w-full"
          ></textarea>
        </div>

        <div class="flex flex-col gap-1">
          <label for="costCentre" class="text-sm font-medium text-gray-700">Cost Centre</label>
          <input
            pInputText
            id="costCentre"
            formControlName="costCentre"
            placeholder="e.g. CC-INFRA"
            class="w-full"
          />
        </div>

        <div class="flex flex-col gap-1">
          <label for="buHeadUserId" class="text-sm font-medium text-gray-700">BU Head *</label>
          <p-select appendTo="body"
            id="buHeadUserId"
            formControlName="buHeadUserId"
            [options]="buHeadUsers()"
            optionLabel="fullName"
            optionValue="id"
            placeholder="Select BU Head"
            [filter]="true"
            filterBy="fullName"
            class="w-full"
          />
          @if (form.get('buHeadUserId')?.touched && form.get('buHeadUserId')?.errors?.['required']) {
            <small class="text-red-500">BU Head is required</small>
          }
          @if (buHeadUsers().length === 0 && !loadingHeads()) {
            <small class="text-amber-600">No users with "bu_head" role found. Assign the role first in Users.</small>
          }
        </div>

        <div class="flex flex-col gap-1">
          <label for="status" class="text-sm font-medium text-gray-700">Status</label>
          <p-select appendTo="body"
            id="status"
            formControlName="status"
            [options]="statusOptions"
            optionLabel="label"
            optionValue="value"
            class="w-full"
          />
        </div>

        @if (serverError) {
          <div class="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {{ serverError }}
          </div>
        }

        <div class="flex justify-end gap-2 pt-2">
          <p-button
            label="Cancel"
            severity="secondary"
            [outlined]="true"
            (onClick)="onVisibleChange(false)"
          />
          <p-button
            [label]="editBu ? 'Save Changes' : 'Create'"
            type="submit"
            [loading]="saving"
            [disabled]="form.invalid || saving"
          />
        </div>
      </form>
    </p-dialog>
  `,
})
export class BuFormDialogComponent implements OnInit, OnChanges {
  @Input() visible = false;
  @Input() editBu: BusinessUnit | null = null;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() saved = new EventEmitter<BusinessUnit>();

  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);

  saving = false;
  serverError = '';
  buHeadUsers = signal<BuHeadOption[]>([]);
  loadingHeads = signal(true);

  statusOptions = [
    { label: 'Active', value: 'ACTIVE' },
    { label: 'Inactive', value: 'INACTIVE' },
  ];

  form: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(128)]],
    description: [''],
    costCentre: [''],
    buHeadUserId: ['', [Validators.required]],
    status: ['ACTIVE'],
  });

  ngOnInit(): void {
    this.loadBuHeadUsers();
  }

  ngOnChanges(): void {
    if (this.editBu) {
      this.form.patchValue({
        name: this.editBu.name,
        description: this.editBu.description ?? '',
        costCentre: this.editBu.costCentre ?? '',
        buHeadUserId: this.editBu.buHeadUserId,
        status: this.editBu.status,
      });
    } else {
      this.form.reset({ name: '', description: '', costCentre: '', buHeadUserId: '', status: 'ACTIVE' });
    }
    this.serverError = '';
  }

  private loadBuHeadUsers(): void {
    this.loadingHeads.set(true);

    // Step 1: Get configured BU Head role name from config
    this.http.get<{ data: Record<string, string> }>(
      `${environment.apiBaseUrl}/config`,
    ).subscribe({
      next: (configRes) => {
        const configuredName = configRes.data['buHeadRoleName'] ?? '';

        // Step 2: Fetch all roles, find the BU Head role by configured name (case-insensitive, strip separators)
        this.http.get<{ data: Array<{ id: string; name: string }> }>(
          `${environment.apiBaseUrl}/roles?limit=200`,
        ).subscribe({
          next: (rolesRes) => {
            const normalize = (s: string) => s.toLowerCase().replace(/[_\s-]/g, '');
            const target = normalize(configuredName || 'buhead');
            const buHeadRole = rolesRes.data.find((r) => normalize(r.name) === target);

            if (!buHeadRole) {
              this.buHeadUsers.set([]);
              this.loadingHeads.set(false);
              return;
            }

            // Step 3: Fetch all users, filter by those who have the BU Head role ID
            this.http.get<{ data: Array<{ id: string; fullName: string; roles: Array<{ id: string }> }> }>(
              `${environment.apiBaseUrl}/users?limit=200`,
            ).subscribe({
              next: (usersRes) => {
                const heads = usersRes.data
                  .filter((u) => u.roles.some((role) => role.id === buHeadRole.id))
                  .map((u) => ({ id: u.id, fullName: u.fullName }));
                this.buHeadUsers.set(heads);
                this.loadingHeads.set(false);
              },
              error: () => { this.loadingHeads.set(false); },
            });
          },
          error: () => { this.loadingHeads.set(false); },
        });
      },
      error: () => { this.loadingHeads.set(false); },
    });
  }

  onVisibleChange(val: boolean): void {
    this.visible = val;
    this.visibleChange.emit(val);
    if (val) this.loadBuHeadUsers(); // refresh on open
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    this.saving = true;
    this.serverError = '';

    const body = this.form.value;
    if (!body.description) delete body.description;
    if (!body.costCentre) delete body.costCentre;

    const url = `${environment.apiBaseUrl}/business-units`;

    const req$ = this.editBu
      ? this.http.patch<{ data: BusinessUnit }>(`${url}/${this.editBu.id}`, body)
      : this.http.post<{ data: BusinessUnit }>(url, body);

    req$.subscribe({
      next: (res) => {
        this.saving = false;
        this.saved.emit(res.data);
        this.onVisibleChange(false);
      },
      error: (err: HttpErrorResponse) => {
        this.saving = false;
        const apiErr = err.error?.error;
        this.serverError = apiErr?.message ?? err.message ?? 'An error occurred';
      },
    });
  }
}
