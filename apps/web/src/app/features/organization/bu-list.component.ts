import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { ConfirmationService, MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';
import { BuFormDialogComponent, type BusinessUnit } from './bu-form-dialog.component';

interface BuListResponse {
  data: BusinessUnit[];
  meta: { next_cursor: string | null; limit: number };
}

@Component({
  selector: 'app-bu-list',
  standalone: true,
  imports: [
    CommonModule,
    TableModule,
    TagModule,
    ButtonModule,
    ConfirmDialogModule,
    ToastModule,
    BuFormDialogComponent,
  ],
  providers: [ConfirmationService, MessageService],
  template: `
    <p-toast />
    <p-confirmDialog />

    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-semibold text-gray-800">Business Units</h2>
        <p class="text-sm text-gray-500 mt-1">Manage your organization's business units</p>
      </div>
      <p-button
        label="Create BU"
        icon="pi pi-plus"
        (onClick)="openCreate()"
      />
    </div>

    @if (loading()) {
      <div class="flex items-center gap-2 text-gray-500 py-12 justify-center">
        <i class="pi pi-spin pi-spinner text-2xl"></i>
        <span>Loading business units...</span>
      </div>
    } @else {
      <div class="bg-white rounded-lg shadow-sm border border-gray-200">
        <p-table
          [value]="businessUnits()"
          [rows]="50"
          [paginator]="false"
          styleClass="p-datatable-sm"
        >
          <ng-template pTemplate="header">
            <tr>
              <th class="font-semibold">Name</th>
              <th class="font-semibold">BU Head</th>
              <th class="font-semibold">Cost Centre</th>
              <th class="font-semibold">Status</th>
              <th class="font-semibold">Created</th>
              <th class="font-semibold" style="width: 150px">Actions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-bu>
            <tr>
              <td>
                <div>
                  <span class="font-medium">{{ bu.name }}</span>
                  @if (bu.description) {
                    <p class="text-xs text-gray-500 mt-0.5">{{ bu.description }}</p>
                  }
                </div>
              </td>
              <td>
                <span class="text-sm">{{ bu.buHeadName || '—' }}</span>
              </td>
              <td>
                <span class="text-sm text-gray-600">{{ bu.costCentre || '—' }}</span>
              </td>
              <td>
                <p-tag
                  [value]="bu.status"
                  [severity]="bu.status === 'ACTIVE' ? 'success' : 'warn'"
                />
              </td>
              <td>
                <span class="text-sm text-gray-500">{{ bu.createdAt | date:'mediumDate' }}</span>
              </td>
              <td>
                <div class="flex gap-1">
                  <p-button
                    icon="pi pi-pencil"
                    [rounded]="true"
                    [text]="true"
                    severity="info"
                    size="small"
                    (onClick)="openEdit(bu)"
                    pTooltip="Edit"
                  />
                  <p-button
                    icon="pi pi-trash"
                    [rounded]="true"
                    [text]="true"
                    severity="danger"
                    size="small"
                    (onClick)="confirmDelete(bu)"
                    pTooltip="Delete"
                  />
                </div>
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="6" class="text-center py-12 text-gray-500">
                <i class="pi pi-inbox text-4xl mb-3 block text-gray-300"></i>
                <p class="mb-3">No business units yet.</p>
                <p-button
                  label="Create your first BU"
                  icon="pi pi-plus"
                  [outlined]="true"
                  (onClick)="openCreate()"
                />
              </td>
            </tr>
          </ng-template>
        </p-table>
      </div>
    }

    <app-bu-form-dialog
      [(visible)]="formVisible"
      [editBu]="editTarget"
      (saved)="onSaved($event)"
    />
  `,
})
export class BuListComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly confirmService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);

  businessUnits = signal<BusinessUnit[]>([]);
  loading = signal(true);
  formVisible = false;
  editTarget: BusinessUnit | null = null;

  ngOnInit(): void {
    this.loadBUs();
  }

  loadBUs(): void {
    this.loading.set(true);
    this.http
      .get<BuListResponse>(`${environment.apiBaseUrl}/business-units`)
      .subscribe({
        next: (res) => {
          this.businessUnits.set(res.data);
          this.loading.set(false);
        },
        error: () => {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to load business units',
          });
          this.loading.set(false);
        },
      });
  }

  openCreate(): void {
    this.editTarget = null;
    this.formVisible = true;
  }

  openEdit(bu: BusinessUnit): void {
    this.editTarget = bu;
    this.formVisible = true;
  }

  onSaved(bu: BusinessUnit): void {
    this.messageService.add({
      severity: 'success',
      summary: 'Success',
      detail: this.editTarget
        ? `"${bu.name}" updated successfully`
        : `"${bu.name}" created successfully`,
    });
    this.loadBUs();
  }

  confirmDelete(bu: BusinessUnit): void {
    this.confirmService.confirm({
      message: `Are you sure you want to delete "${bu.name}"?`,
      header: 'Delete Business Unit',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.deleteBU(bu),
    });
  }

  private deleteBU(bu: BusinessUnit): void {
    this.http
      .delete(`${environment.apiBaseUrl}/business-units/${bu.id}`)
      .subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: 'Deleted',
            detail: `"${bu.name}" has been deleted`,
          });
          this.loadBUs();
        },
        error: (err: HttpErrorResponse) => {
          const apiErr = err.error?.error;
          if (apiErr?.code === 'BU_HAS_REFERENCES') {
            const d = apiErr.details;
            const refs: string[] = [];
            if (d?.projects) refs.push(`${d.projects} project(s)`);
            if (d?.opportunities) refs.push(`${d.opportunities} opportunity(ies)`);
            if (d?.expenseSheets) refs.push(`${d.expenseSheets} expense sheet(s)`);
            if (d?.materialRequests) refs.push(`${d.materialRequests} material request(s)`);
            this.messageService.add({
              severity: 'error',
              summary: 'Cannot Delete',
              detail: `This BU has ${refs.join(', ')}. Re-assign them first.`,
              life: 8000,
            });
          } else {
            this.messageService.add({
              severity: 'error',
              summary: 'Error',
              detail: apiErr?.message ?? 'Failed to delete business unit',
            });
          }
        },
      });
  }
}
