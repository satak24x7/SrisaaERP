import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { TableModule } from 'primeng/table';
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
}

@Component({
  selector: 'app-project-dashboard',
  standalone: true,
  imports: [CommonModule, ButtonModule, TagModule, TableModule],
  template: `
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-2xl font-semibold text-gray-800">Project Dashboard</h2>
      <p-button label="New Project" icon="pi pi-plus" (onClick)="router.navigate(['/projects/new'])" />
    </div>

    <!-- Summary Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-5 cursor-pointer hover:shadow-md transition-shadow" (click)="filterByStatus('')">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
            <i class="pi pi-folder text-blue-600"></i>
          </div>
          <div>
            <div class="text-2xl font-bold text-gray-800">{{ totalProjects() }}</div>
            <div class="text-xs text-gray-500">Total Projects</div>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-5 cursor-pointer hover:shadow-md transition-shadow" (click)="filterByStatus('ACTIVE')">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
            <i class="pi pi-play text-green-600"></i>
          </div>
          <div>
            <div class="text-2xl font-bold text-green-700">{{ activeCount() }}</div>
            <div class="text-xs text-gray-500">Active</div>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-5 cursor-pointer hover:shadow-md transition-shadow" (click)="filterByStatus('DRAFT')">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
            <i class="pi pi-file text-gray-600"></i>
          </div>
          <div>
            <div class="text-2xl font-bold text-gray-700">{{ draftCount() }}</div>
            <div class="text-xs text-gray-500">Draft</div>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-5 cursor-pointer hover:shadow-md transition-shadow" (click)="filterByStatus('ON_HOLD')">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
            <i class="pi pi-pause text-yellow-600"></i>
          </div>
          <div>
            <div class="text-2xl font-bold text-yellow-700">{{ onHoldCount() }}</div>
            <div class="text-xs text-gray-500">On Hold</div>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-5 cursor-pointer hover:shadow-md transition-shadow" (click)="filterByStatus('CLOSED')">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
            <i class="pi pi-check-circle text-indigo-600"></i>
          </div>
          <div>
            <div class="text-2xl font-bold text-indigo-700">{{ closedCount() }}</div>
            <div class="text-xs text-gray-500">Closed</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Contract Value Summary -->
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-5 mb-6">
      <div class="flex items-center justify-between">
        <div>
          <div class="text-sm text-gray-500 mb-1">Total Contract Value (Active Projects)</div>
          <div class="text-3xl font-bold text-blue-700">{{ formatRupees(activeContractValue()) }}</div>
        </div>
        <div class="text-right">
          <div class="text-sm text-gray-500 mb-1">All Projects Contract Value</div>
          <div class="text-2xl font-semibold text-gray-600">{{ formatRupees(totalContractValue()) }}</div>
        </div>
      </div>
    </div>

    <!-- Recent Projects Table -->
    <div class="bg-white rounded-lg shadow-sm border border-gray-200">
      <div class="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <h3 class="text-lg font-semibold text-gray-700">
          @if (statusFilter) {
            {{ statusFilter }} Projects
          } @else {
            All Projects
          }
        </h3>
        @if (statusFilter) {
          <p-button label="Show All" icon="pi pi-times" severity="secondary" [text]="true" size="small" (onClick)="filterByStatus('')" />
        }
      </div>
      <p-table
        [value]="filteredProjects()"
        styleClass="p-datatable-sm"
        [paginator]="true"
        [rows]="10"
        [loading]="loading()"
        selectionMode="single"
        (onRowSelect)="onRowSelect($event)"
      >
        <ng-template pTemplate="header">
          <tr>
            <th>Code</th>
            <th>Name</th>
            <th>Client</th>
            <th>BU</th>
            <th>PM</th>
            <th>Status</th>
            <th class="text-right">Contract Value</th>
            <th>Start - End</th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-p>
          <tr [pSelectableRow]="p" class="cursor-pointer">
            <td class="font-medium">{{ p.projectCode || '-' }}</td>
            <td class="font-medium text-blue-700">{{ p.name }}</td>
            <td>{{ p.clientName }}</td>
            <td>{{ p.businessUnitName || '-' }}</td>
            <td>{{ p.projectManagerName || '-' }}</td>
            <td><p-tag [value]="p.status" [severity]="statusSeverity(p.status)" /></td>
            <td class="text-right">{{ formatRupees(p.contractValuePaise) }}</td>
            <td class="text-sm">{{ p.startDate | date:'mediumDate' }} — {{ p.endDate | date:'mediumDate' }}</td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr><td colspan="8" class="text-center text-gray-400 py-8">No projects found</td></tr>
        </ng-template>
      </p-table>
    </div>
  `,
})
export class ProjectDashboardComponent implements OnInit {
  private readonly http = inject(HttpClient);
  readonly router = inject(Router);

  allProjects = signal<ProjectRow[]>([]);
  loading = signal(true);
  statusFilter = '';

  // Computed counts
  totalProjects = signal(0);
  activeCount = signal(0);
  draftCount = signal(0);
  onHoldCount = signal(0);
  closedCount = signal(0);
  totalContractValue = signal(0);
  activeContractValue = signal(0);
  filteredProjects = signal<ProjectRow[]>([]);

  ngOnInit(): void {
    this.loadProjects();
  }

  private loadProjects(): void {
    this.loading.set(true);
    this.http
      .get<{ data: ProjectRow[]; meta: unknown }>(`${environment.apiBaseUrl}/projects?limit=200`)
      .subscribe({
        next: (r) => {
          this.allProjects.set(r.data);
          this.computeStats(r.data);
          this.applyFilter(r.data);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  private computeStats(projects: ProjectRow[]): void {
    this.totalProjects.set(projects.length);
    this.activeCount.set(projects.filter((p) => p.status === 'ACTIVE').length);
    this.draftCount.set(projects.filter((p) => p.status === 'DRAFT').length);
    this.onHoldCount.set(projects.filter((p) => p.status === 'ON_HOLD').length);
    this.closedCount.set(projects.filter((p) => p.status === 'CLOSED').length);
    this.totalContractValue.set(projects.reduce((s, p) => s + (p.contractValuePaise || 0), 0));
    this.activeContractValue.set(
      projects.filter((p) => p.status === 'ACTIVE').reduce((s, p) => s + (p.contractValuePaise || 0), 0),
    );
  }

  private applyFilter(projects: ProjectRow[]): void {
    if (this.statusFilter) {
      this.filteredProjects.set(projects.filter((p) => p.status === this.statusFilter));
    } else {
      this.filteredProjects.set(projects);
    }
  }

  filterByStatus(status: string): void {
    this.statusFilter = status;
    this.applyFilter(this.allProjects());
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onRowSelect(event: any): void {
    if (!event.data) return;
    this.router.navigate(['/projects', event.data.id]);
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
    return '\u20B9' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
}
