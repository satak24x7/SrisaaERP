import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';

interface ProjectRow {
  id: string;
  projectCode: string | null;
  name: string;
  clientName: string;
  businessUnitName: string | null;
  projectManagerName: string | null;
  status: string;
  contractValuePaise: number;
  startDate: string;
  endDate: string;
  createdAt: string;
}

interface LookupItem { label: string; value: string; }

const STATUS_OPTIONS = [
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'On Hold', value: 'ON_HOLD' },
  { label: 'Closed', value: 'CLOSED' },
];

@Component({
  selector: 'app-project-list',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, SelectModule, TableModule, TagModule, ToastModule, ConfirmDialogModule],
  providers: [MessageService, ConfirmationService],
  template: `
    <p-toast /><p-confirmDialog />

    <div class="flex items-center justify-between mb-6">
      <h2 class="text-2xl font-semibold text-gray-800">Projects</h2>
      <p-button label="New Project" icon="pi pi-plus" (onClick)="router.navigate(['/projects/new'])" />
    </div>

    <!-- Filters -->
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <p-select appendTo="body" [(ngModel)]="filterBuId" [options]="buOptions()" optionLabel="label" optionValue="value" [showClear]="true" placeholder="All Business Units" class="w-full" (onChange)="loadProjects()" />
        <p-select appendTo="body" [(ngModel)]="filterStatus" [options]="statusOptions" optionLabel="label" optionValue="value" [showClear]="true" placeholder="All Statuses" class="w-full" (onChange)="loadProjects()" />
        <p-select appendTo="body" [(ngModel)]="filterPmId" [options]="pmOptions()" optionLabel="label" optionValue="value" [showClear]="true" placeholder="All Project Managers" class="w-full" (onChange)="loadProjects()" />
        <p-button label="Reset" icon="pi pi-refresh" severity="secondary" [outlined]="true" (onClick)="resetFilters()" />
      </div>
    </div>

    <!-- Table -->
    <div class="bg-white rounded-lg shadow-sm border border-gray-200">
      <p-table [value]="projects()" styleClass="p-datatable-sm" [paginator]="true" [rows]="20" [loading]="loading()" selectionMode="single" (onRowSelect)="onRowSelect($event)">
        <ng-template pTemplate="header">
          <tr>
            <th>Code</th>
            <th>Name</th>
            <th>Client</th>
            <th>BU</th>
            <th>PM</th>
            <th>Status</th>
            <th>Contract Value</th>
            <th>Start - End</th>
            <th style="width:100px">Actions</th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-p>
          <tr [pSelectableRow]="p" class="cursor-pointer">
            <td class="font-medium">{{ p.projectCode || '-' }}</td>
            <td>{{ p.name }}</td>
            <td>{{ p.clientName }}</td>
            <td>{{ p.businessUnitName || '-' }}</td>
            <td>{{ p.projectManagerName || '-' }}</td>
            <td><p-tag [value]="p.status" [severity]="statusSeverity(p.status)" /></td>
            <td>{{ formatRupees(p.contractValuePaise) }}</td>
            <td>{{ p.startDate | date:'mediumDate' }} - {{ p.endDate | date:'mediumDate' }}</td>
            <td>
              <div class="flex gap-1">
                <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small" (onClick)="editProject($event, p.id)" />
                <p-button icon="pi pi-trash" [text]="true" [rounded]="true" size="small" severity="danger" (onClick)="deleteProject($event, p.id)" />
              </div>
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr><td colspan="9" class="text-center text-gray-400 py-8">No projects found</td></tr>
        </ng-template>
      </p-table>
    </div>
  `,
})
export class ProjectListComponent implements OnInit {
  private readonly http = inject(HttpClient);
  readonly router = inject(Router);
  private readonly msg = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  projects = signal<ProjectRow[]>([]);
  loading = signal(true);
  buOptions = signal<LookupItem[]>([]);
  pmOptions = signal<LookupItem[]>([]);

  statusOptions = STATUS_OPTIONS;
  filterBuId = '';
  filterStatus = '';
  filterPmId = '';

  ngOnInit(): void {
    this.loadBuOptions();
    this.loadPmOptions();
    this.loadProjects();
  }

  private loadBuOptions(): void {
    this.http.get<{ data: { id: string; name: string }[] }>(`${environment.apiBaseUrl}/business-units`).subscribe({
      next: (r) => this.buOptions.set(r.data.map((bu) => ({ label: bu.name, value: bu.id }))),
      error: () => {},
    });
  }

  private loadPmOptions(): void {
    this.http.get<{ data: { id: string; displayName: string }[] }>(`${environment.apiBaseUrl}/users`).subscribe({
      next: (r) => this.pmOptions.set(r.data.map((u) => ({ label: u.displayName, value: u.id }))),
      error: () => {},
    });
  }

  loadProjects(): void {
    this.loading.set(true);
    const params: string[] = ['limit=200'];
    if (this.filterBuId) params.push(`buId=${this.filterBuId}`);
    if (this.filterStatus) params.push(`status=${this.filterStatus}`);
    if (this.filterPmId) params.push(`projectManagerId=${this.filterPmId}`);

    this.http.get<{ data: ProjectRow[]; meta: { next_cursor: string | null; limit: number } }>(`${environment.apiBaseUrl}/projects?${params.join('&')}`).subscribe({
      next: (r) => { this.projects.set(r.data); this.loading.set(false); },
      error: () => { this.loading.set(false); },
    });
  }

  resetFilters(): void {
    this.filterBuId = '';
    this.filterStatus = '';
    this.filterPmId = '';
    this.loadProjects();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onRowSelect(event: any): void {
    if (!event.data) return;
    this.router.navigate(['/projects', event.data.id]);
  }

  editProject(event: Event, id: string): void {
    event.stopPropagation();
    this.router.navigate(['/projects', id]);
  }

  deleteProject(event: Event, id: string): void {
    event.stopPropagation();
    this.confirm.confirm({
      message: 'Delete this project?',
      accept: () => {
        this.http.delete(`${environment.apiBaseUrl}/projects/${id}`).subscribe({
          next: () => {
            this.loadProjects();
            this.msg.add({ severity: 'success', summary: 'Deleted' });
          },
        });
      },
    });
  }

  statusSeverity(status: string): 'secondary' | 'success' | 'warn' | 'info' {
    switch (status) {
      case 'DRAFT': return 'secondary';
      case 'ACTIVE': return 'success';
      case 'ON_HOLD': return 'warn';
      case 'CLOSED': return 'info';
      default: return 'secondary';
    }
  }

  formatRupees(paise: number): string {
    return '₹' + (paise / 100).toLocaleString('en-IN');
  }
}
