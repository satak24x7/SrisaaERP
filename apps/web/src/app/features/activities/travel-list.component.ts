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

interface TravelPlanRow {
  id: string;
  title: string;
  purpose: string;
  status: string;
  startDate: string;
  endDate: string;
  leadTravellerName: string;
  travellersCount: number;
  totalPaise: number;
  createdAt: string;
}

interface LookupItem { label: string; value: string; isActive?: boolean; }

const STATUS_OPTIONS = [
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Submitted', value: 'SUBMITTED' },
  { label: 'Approved', value: 'APPROVED' },
  { label: 'Rejected', value: 'REJECTED' },
  { label: 'Booking', value: 'BOOKING' },
  { label: 'In Progress', value: 'IN_PROGRESS' },
  { label: 'Expenses Submitted', value: 'EXPENSE_SUBMITTED' },
  { label: 'Completed', value: 'COMPLETED' },
];

@Component({
  selector: 'app-travel-list',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, SelectModule, TableModule, TagModule, ToastModule, ConfirmDialogModule],
  providers: [MessageService, ConfirmationService],
  template: `
    <p-toast /><p-confirmDialog />

    <div class="flex items-center justify-between mb-6">
      <h2 class="text-2xl font-semibold text-gray-800">Travel Plans</h2>
      <div class="flex items-center gap-3">
        <div class="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
          <button class="px-3 py-1.5 transition-colors" [class]="showMine ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'" (click)="showMine=true; loadTravelPlans()">My Items</button>
          <button class="px-3 py-1.5 transition-colors" [class]="!showMine ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'" (click)="showMine=false; loadTravelPlans()">All Items</button>
        </div>
        <p-button label="New Travel Plan" icon="pi pi-plus" (onClick)="router.navigate(['/work-area/travels/new'])" />
      </div>
    </div>

    <!-- Filters -->
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <p-select appendTo="body" [(ngModel)]="filterStatus" [options]="statusOptions" optionLabel="label" optionValue="value" [showClear]="true" placeholder="All Statuses" class="w-full" (onChange)="loadTravelPlans()" />
        <p-select appendTo="body" [(ngModel)]="filterPurpose" [options]="purposeOptions()" optionLabel="label" optionValue="value" [showClear]="true" placeholder="All Purposes" class="w-full" (onChange)="loadTravelPlans()" />
        <p-button label="Reset" icon="pi pi-refresh" severity="secondary" [outlined]="true" (onClick)="resetFilters()" />
      </div>
    </div>

    <!-- Table -->
    <div class="bg-white rounded-lg shadow-sm border border-gray-200">
      <p-table [value]="travelPlans()" styleClass="p-datatable-sm" [paginator]="true" [rows]="20" [loading]="loading()" selectionMode="single" (onRowSelect)="onRowSelect($event)">
        <ng-template pTemplate="header">
          <tr>
            <th>Title</th>
            <th>Purpose</th>
            <th>Dates</th>
            <th>Lead Traveller</th>
            <th># Travellers</th>
            <th>Status</th>
            <th>Total</th>
            <th style="width:100px">Actions</th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-tp>
          <tr [pSelectableRow]="tp" class="cursor-pointer">
            <td class="font-medium">{{ tp.title }}</td>
            <td>{{ tp.purpose }}</td>
            <td>{{ tp.startDate | date:'mediumDate' }} - {{ tp.endDate | date:'mediumDate' }}</td>
            <td>{{ tp.leadTravellerName || '-' }}</td>
            <td>{{ tp.travellersCount }}</td>
            <td><p-tag [value]="tp.status" [severity]="statusSeverity(tp.status)" /></td>
            <td>{{ formatRupees(tp.totalPaise) }}</td>
            <td>
              <div class="flex gap-1">
                <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small" (onClick)="editTravelPlan($event, tp.id)" />
                <p-button icon="pi pi-trash" [text]="true" [rounded]="true" size="small" severity="danger" (onClick)="deleteTravelPlan($event, tp.id)" />
              </div>
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr><td colspan="8" class="text-center text-gray-400 py-8">No travel plans found</td></tr>
        </ng-template>
      </p-table>
    </div>
  `,
})
export class TravelListComponent implements OnInit {
  private readonly http = inject(HttpClient);
  readonly router = inject(Router);
  private readonly msg = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  travelPlans = signal<TravelPlanRow[]>([]);
  loading = signal(true);
  purposeOptions = signal<LookupItem[]>([]);

  showMine = true;
  statusOptions = STATUS_OPTIONS;
  filterStatus = '';
  filterPurpose = '';

  ngOnInit(): void {
    this.loadPurposeOptions();
    this.loadTravelPlans();
  }

  private loadPurposeOptions(): void {
    this.http.get<{ data: LookupItem[] }>(`${environment.apiBaseUrl}/lookup-lists/by-code/activity_category/items`).subscribe({
      next: (r) => this.purposeOptions.set(r.data.filter((i) => i.isActive !== false)),
      error: () => {},
    });
  }

  loadTravelPlans(): void {
    this.loading.set(true);
    const params: string[] = ['limit=200'];
    if (this.showMine) params.push('mine=true');
    if (this.filterStatus) params.push(`status=${this.filterStatus}`);
    if (this.filterPurpose) params.push(`purpose=${this.filterPurpose}`);

    this.http.get<{ data: TravelPlanRow[]; meta: { next_cursor: string | null; limit: number } }>(`${environment.apiBaseUrl}/travel-plans?${params.join('&')}`).subscribe({
      next: (r) => { this.travelPlans.set(r.data); this.loading.set(false); },
      error: () => { this.loading.set(false); },
    });
  }

  resetFilters(): void {
    this.filterStatus = '';
    this.filterPurpose = '';
    this.loadTravelPlans();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onRowSelect(event: any): void {
    if (!event.data) return;
    this.router.navigate(['/work-area/travels', event.data.id]);
  }

  editTravelPlan(event: Event, id: string): void {
    event.stopPropagation();
    this.router.navigate(['/work-area/travels', id]);
  }

  deleteTravelPlan(event: Event, id: string): void {
    event.stopPropagation();
    this.confirm.confirm({
      message: 'Delete this travel plan?',
      accept: () => {
        this.http.delete(`${environment.apiBaseUrl}/travel-plans/${id}`).subscribe({
          next: () => {
            this.loadTravelPlans();
            this.msg.add({ severity: 'success', summary: 'Deleted' });
          },
        });
      },
    });
  }

  statusSeverity(status: string): 'secondary' | 'info' | 'success' | 'danger' {
    switch (status) {
      case 'DRAFT': return 'secondary';
      case 'SUBMITTED': return 'info';
      case 'APPROVED': return 'success';
      case 'REJECTED': return 'danger';
      case 'COMPLETED': return 'success';
      default: return 'secondary';
    }
  }

  formatRupees(paise: number): string {
    return '₹' + (paise / 100).toLocaleString('en-IN');
  }
}
