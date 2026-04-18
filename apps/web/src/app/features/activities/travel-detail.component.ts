import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ReactiveFormsModule, FormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { InputNumberModule } from 'primeng/inputnumber';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TabsModule } from 'primeng/tabs';
import { TableModule } from 'primeng/table';
import { DatePickerModule } from 'primeng/datepicker';
import { TextareaModule } from 'primeng/textarea';
import { ConfirmationService, MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';

interface Ref { id: string; name: string; }
interface LookupItem { label: string; value: string; isActive?: boolean; }
interface Association { id: string; entityType: string; entityId: string; entityName: string | null; }
interface TicketRow { id: string; ticketType: string; fromLocation: string; toLocation: string; travelDate: string; returnDate: string | null; bookingRef: string | null; amountPaise: number; notes: string | null; }
interface HotelRow { id: string; hotelName: string; location: string; checkIn: string; checkOut: string; bookingRef: string | null; amountPaise: number; notes: string | null; }
interface ExpenseRow { id: string; category: string; expenseDate: string; description: string; amountPaise: number; receiptRef: string | null; }
interface TravelPlanSummary { ticketsTotal: number; hotelsTotal: number; expensesTotal: number; costOfTravel: number; advanceAmountPaise: number; reimbursementDue: number; reimbursementPaid: number; reimbursementBalance: number; perObjectShare: number; travellersCount: number; }
interface TravelPlan {
  id: string; title: string; purpose: string; status: string;
  startDate: string; endDate: string;
  leadTravellerId: string; leadTravellerName: string;
  businessUnitId: string | null; businessUnitName: string | null;
  advanceAmountPaise: number; advanceStatus: string; reimbursementStatus: string;
  reimbursementPaidPaise: number; reimbursementRef: string | null;
  notes: string | null; rejectionReason: string | null;
  travellers: Ref[]; associations: Association[];
  tickets: TicketRow[]; hotels: HotelRow[]; expenses: ExpenseRow[];
  summary: TravelPlanSummary;
  createdAt: string; updatedAt: string;
}

const ENTITY_TYPES = [
  { label: 'Opportunity', value: 'OPPORTUNITY' },
  { label: 'Lead', value: 'LEAD' },
  { label: 'Account', value: 'ACCOUNT' },
  { label: 'Contact', value: 'CONTACT' },
  { label: 'Influencer', value: 'INFLUENCER' },
  { label: 'Project', value: 'PROJECT' },
];

const TICKET_TYPES = [
  { label: 'Flight', value: 'FLIGHT' },
  { label: 'Train', value: 'TRAIN' },
  { label: 'Bus', value: 'BUS' },
  { label: 'Cab', value: 'CAB' },
  { label: 'Other', value: 'OTHER' },
];

const EXPENSE_CATEGORIES = [
  { label: 'Ticket', value: 'TICKET' },
  { label: 'Hotel', value: 'HOTEL' },
  { label: 'Food', value: 'FOOD' },
  { label: 'Local Transport', value: 'LOCAL_TRANSPORT' },
  { label: 'Communication', value: 'COMMUNICATION' },
  { label: 'Other', value: 'OTHER' },
];

const TICKET_TYPE_LABELS: Record<string, string> = Object.fromEntries(TICKET_TYPES.map((t) => [t.value, t.label]));
const EXPENSE_CAT_LABELS: Record<string, string> = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.value, c.label]));

@Component({
  selector: 'app-travel-detail',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, ButtonModule, InputTextModule, SelectModule, MultiSelectModule, InputNumberModule, TagModule, DialogModule, ToastModule, ConfirmDialogModule, TabsModule, TableModule, DatePickerModule, TextareaModule],
  providers: [MessageService, ConfirmationService],
  template: `
    <p-toast /><p-confirmDialog />

    @if (loading()) {
      <div class="flex items-center gap-2 text-gray-500 py-12 justify-center"><i class="pi pi-spin pi-spinner text-2xl"></i> Loading...</div>
    } @else {
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-3">
          <p-button icon="pi pi-arrow-left" [text]="true" [rounded]="true" (onClick)="goBack()" />
          <h2 class="text-2xl font-semibold text-gray-800">{{ isCreateMode ? 'New Travel Plan' : plan()?.title }}</h2>
          @if (!isCreateMode && plan()) {
            <p-tag [value]="plan()!.status" [severity]="statusSeverity(plan()!.status)" />
          }
        </div>
        <div class="flex gap-2">
          @if (!isCreateMode && plan()) {
            <!-- Requester actions -->
            @if (plan()!.status === 'DRAFT') {
              <p-button label="Submit for Approval" icon="pi pi-send" severity="info" (onClick)="transitionPlan('submit')" />
            }
            @if (plan()!.status === 'REJECTED') {
              <p-button label="Revise & Resubmit" icon="pi pi-refresh" severity="warn" (onClick)="transitionPlan('revise')" />
            }
            @if (plan()!.status === 'IN_PROGRESS') {
              <p-button label="Submit Expenses" icon="pi pi-wallet" severity="info" (onClick)="transitionPlan('submit-expenses')" />
            }
            <!-- Approver actions -->
            @if (plan()!.status === 'SUBMITTED') {
              <p-button label="Approve" icon="pi pi-check" severity="success" (onClick)="transitionPlan('approve')" />
              <p-button label="Reject" icon="pi pi-times" severity="danger" (onClick)="rejectDialogVisible=true" />
            }
            @if (plan()!.status === 'EXPENSE_SUBMITTED') {
              <p-button label="Approve Reimbursement" icon="pi pi-check-circle" severity="success" (onClick)="transitionPlan('complete')" />
            }
            <!-- Admin actions -->
            @if (plan()!.status === 'APPROVED') {
              <p-button label="Start Booking" icon="pi pi-ticket" severity="info" (onClick)="transitionPlan('start-booking')" />
            }
            @if (plan()!.status === 'BOOKING') {
              <p-button label="Travel Started" icon="pi pi-car" severity="success" (onClick)="transitionPlan('start-travel')" />
            }
          }
        </div>
      </div>

      <!-- Status flow indicator -->
      @if (!isCreateMode && plan()) {
        <div class="flex items-center gap-1 mb-4 text-xs text-gray-400 overflow-x-auto">
          @for (s of statusFlow; track s) {
            <span class="px-2 py-1 rounded whitespace-nowrap" [class]="plan()!.status === s ? 'bg-blue-100 text-blue-700 font-semibold' : 'bg-gray-100'">{{ s }}</span>
            @if (!$last) { <i class="pi pi-angle-right"></i> }
          }
        </div>
      }

      @if (!isCreateMode && plan()?.status === 'REJECTED' && plan()?.rejectionReason) {
        <div class="p-3 mb-4 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          <strong>Rejection Reason:</strong> {{ plan()!.rejectionReason }}
        </div>
      }

      <!-- Top Form -->
      <form [formGroup]="form" (ngSubmit)="onSave()">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <!-- Left column -->
          <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 class="text-lg font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <i class="pi pi-map text-blue-600"></i> Travel Details
            </h3>
            <div class="flex flex-col gap-4">
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Title *</label>
                <input pInputText formControlName="title" class="w-full" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Purpose *</label>
                <p-select appendTo="body" formControlName="purpose" [options]="purposeOptions()" optionLabel="label" optionValue="value" placeholder="Select purpose" class="w-full" />
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Start Date *</label>
                  <p-datepicker appendTo="body" formControlName="startDate" dateFormat="yy-mm-dd" class="w-full" />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">End Date *</label>
                  <p-datepicker appendTo="body" formControlName="endDate" dateFormat="yy-mm-dd" class="w-full" />
                </div>
              </div>
            </div>
          </div>

          <!-- Right column -->
          <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 class="text-lg font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <i class="pi pi-users text-green-600"></i> Assignment & Budget
            </h3>
            <div class="flex flex-col gap-4">
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Lead Traveller *</label>
                <p-select appendTo="body" formControlName="leadTravellerId" [options]="userOptions()" optionLabel="name" optionValue="id" [filter]="true" placeholder="Select lead traveller" class="w-full" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Business Unit</label>
                <p-select appendTo="body" formControlName="businessUnitId" [options]="buOptions()" optionLabel="name" optionValue="id" [filter]="true" [showClear]="true" placeholder="Select BU" class="w-full" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Advance Amount (₹)</label>
                <p-inputNumber formControlName="advanceAmountRupees" mode="currency" currency="INR" locale="en-IN" class="w-full" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Notes</label>
                <textarea pTextarea formControlName="notes" [rows]="2" class="w-full"></textarea>
              </div>
            </div>
          </div>
        </div>

        <!-- Travellers -->
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <label class="text-sm font-semibold text-gray-700 block mb-2">Travellers</label>
          <p-multiSelect appendTo="body" formControlName="travellerIds" [options]="userOptions()" optionLabel="name" optionValue="id" display="chip" placeholder="Select travellers" class="w-full" />
        </div>

        <!-- Linked Objects -->
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <label class="text-sm font-semibold text-gray-700 block mb-2">Linked Objects</label>
          <div class="flex flex-col gap-2">
            @for (assoc of formAssociations; track $index) {
              <div class="flex gap-2 items-center">
                <p-select appendTo="body" [(ngModel)]="assoc.entityType" [ngModelOptions]="{standalone: true}" [options]="entityTypes" optionLabel="label" optionValue="value" placeholder="Type" class="w-40" (onChange)="onEntityTypeChange(assoc)" />
                <p-select appendTo="body" [(ngModel)]="assoc.entityId" [ngModelOptions]="{standalone: true}" [options]="getEntityOptions(assoc.entityType)" optionLabel="name" optionValue="id" [filter]="true" placeholder="Search..." class="flex-1" />
                <p-button icon="pi pi-times" [text]="true" [rounded]="true" severity="danger" size="small" (onClick)="removeAssociation($index)" />
              </div>
            }
            <p-button label="Add Link" icon="pi pi-plus" [text]="true" size="small" (onClick)="addAssociation()" />
          </div>
        </div>

        @if (serverError) {
          <div class="p-3 mb-4 bg-red-50 border border-red-200 rounded text-sm text-red-700">{{ serverError }}</div>
        }

        <div class="flex justify-end gap-2 mb-6">
          <p-button label="Cancel" severity="secondary" [outlined]="true" (onClick)="goBack()" />
          <p-button [label]="isCreateMode ? 'Create Travel Plan' : 'Save Changes'" type="submit" icon="pi pi-save" [loading]="saving" [disabled]="(!isCreateMode && form.pristine && !associationsChanged) || form.invalid || saving" />
        </div>
      </form>

      <!-- Tabs: only in edit mode -->
      @if (!isCreateMode && plan()) {
        <p-tabs [value]="0">
          <p-tablist>
            <p-tab [value]="0">Tickets</p-tab>
            <p-tab [value]="1">Hotels</p-tab>
            <p-tab [value]="2">Expenses</p-tab>
            <p-tab [value]="3">Summary</p-tab>
          </p-tablist>
          <p-tabpanels>
            <!-- Tab 1: Tickets -->
            <p-tabpanel [value]="0">
              <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mt-4">
                <div class="flex items-center justify-between mb-4">
                  <h3 class="text-lg font-semibold text-gray-700">Tickets</h3>
                  <p-button label="Add Ticket" icon="pi pi-plus" size="small" (onClick)="openTicketDialog()" />
                </div>
                <p-table [value]="plan()!.tickets" styleClass="p-datatable-sm">
                  <ng-template pTemplate="header">
                    <tr>
                      <th>Type</th><th>From</th><th>To</th><th>Date</th><th>Return</th><th>Booking Ref</th><th class="text-right">Amount (₹)</th><th style="width:100px">Actions</th>
                    </tr>
                  </ng-template>
                  <ng-template pTemplate="body" let-t>
                    <tr>
                      <td><p-tag [value]="ticketTypeLabel(t.ticketType)" [severity]="'info'" /></td>
                      <td>{{ t.fromLocation }}</td>
                      <td>{{ t.toLocation }}</td>
                      <td>{{ t.travelDate | date:'mediumDate' }}</td>
                      <td>{{ t.returnDate ? (t.returnDate | date:'mediumDate') : '-' }}</td>
                      <td>{{ t.bookingRef || '-' }}</td>
                      <td class="text-right font-medium">{{ formatRupees(t.amountPaise) }}</td>
                      <td>
                        <div class="flex gap-1">
                          <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small" (onClick)="openTicketDialog(t)" />
                          <p-button icon="pi pi-trash" [text]="true" [rounded]="true" size="small" severity="danger" (onClick)="deleteTicket(t.id)" />
                        </div>
                      </td>
                    </tr>
                  </ng-template>
                  <ng-template pTemplate="emptymessage">
                    <tr><td colspan="8" class="text-center text-gray-400 py-4">No tickets yet</td></tr>
                  </ng-template>
                </p-table>
              </div>
            </p-tabpanel>

            <!-- Tab 2: Hotels -->
            <p-tabpanel [value]="1">
              <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mt-4">
                <div class="flex items-center justify-between mb-4">
                  <h3 class="text-lg font-semibold text-gray-700">Hotels</h3>
                  <p-button label="Add Hotel" icon="pi pi-plus" size="small" (onClick)="openHotelDialog()" />
                </div>
                <p-table [value]="plan()!.hotels" styleClass="p-datatable-sm">
                  <ng-template pTemplate="header">
                    <tr>
                      <th>Hotel Name</th><th>Location</th><th>Check-in</th><th>Check-out</th><th>Booking Ref</th><th class="text-right">Amount (₹)</th><th style="width:100px">Actions</th>
                    </tr>
                  </ng-template>
                  <ng-template pTemplate="body" let-h>
                    <tr>
                      <td class="font-medium">{{ h.hotelName }}</td>
                      <td>{{ h.location }}</td>
                      <td>{{ h.checkIn | date:'mediumDate' }}</td>
                      <td>{{ h.checkOut | date:'mediumDate' }}</td>
                      <td>{{ h.bookingRef || '-' }}</td>
                      <td class="text-right font-medium">{{ formatRupees(h.amountPaise) }}</td>
                      <td>
                        <div class="flex gap-1">
                          <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small" (onClick)="openHotelDialog(h)" />
                          <p-button icon="pi pi-trash" [text]="true" [rounded]="true" size="small" severity="danger" (onClick)="deleteHotel(h.id)" />
                        </div>
                      </td>
                    </tr>
                  </ng-template>
                  <ng-template pTemplate="emptymessage">
                    <tr><td colspan="7" class="text-center text-gray-400 py-4">No hotels yet</td></tr>
                  </ng-template>
                </p-table>
              </div>
            </p-tabpanel>

            <!-- Tab 3: Expenses -->
            <p-tabpanel [value]="2">
              <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mt-4">
                <div class="flex items-center justify-between mb-4">
                  <h3 class="text-lg font-semibold text-gray-700">Expenses</h3>
                  <p-button label="Add Expense" icon="pi pi-plus" size="small" (onClick)="openExpenseDialog()" />
                </div>
                <p-table [value]="plan()!.expenses" styleClass="p-datatable-sm">
                  <ng-template pTemplate="header">
                    <tr>
                      <th>Category</th><th>Date</th><th>Description</th><th class="text-right">Amount (₹)</th><th>Receipt Ref</th><th style="width:100px">Actions</th>
                    </tr>
                  </ng-template>
                  <ng-template pTemplate="body" let-e>
                    <tr>
                      <td><p-tag [value]="expenseCatLabel(e.category)" [severity]="'info'" /></td>
                      <td>{{ e.expenseDate | date:'mediumDate' }}</td>
                      <td>{{ e.description }}</td>
                      <td class="text-right font-medium">{{ formatRupees(e.amountPaise) }}</td>
                      <td>{{ e.receiptRef || '-' }}</td>
                      <td>
                        <div class="flex gap-1">
                          <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small" (onClick)="openExpenseDialog(e)" />
                          <p-button icon="pi pi-trash" [text]="true" [rounded]="true" size="small" severity="danger" (onClick)="deleteExpense(e.id)" />
                        </div>
                      </td>
                    </tr>
                  </ng-template>
                  <ng-template pTemplate="emptymessage">
                    <tr><td colspan="6" class="text-center text-gray-400 py-4">No expenses yet</td></tr>
                  </ng-template>
                </p-table>
              </div>
            </p-tabpanel>

            <!-- Tab 4: Summary -->
            <p-tabpanel [value]="3">
              <div class="mt-4">
                @if (plan()!.summary) {
                  <!-- Cost of Travel (Company + Traveller) -->
                  <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
                    <h3 class="text-lg font-semibold text-gray-700 mb-4 flex items-center gap-2">
                      <i class="pi pi-wallet text-blue-600"></i> Cost of Travel
                    </h3>
                    <p class="text-xs text-gray-400 mb-3">Tickets & Hotels are company-paid. Expenses are traveller-paid (reimbursable).</p>
                    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <div class="bg-blue-50 rounded-lg p-4 border border-blue-200">
                        <div class="text-xs text-blue-600 font-medium">Tickets (Company)</div>
                        <div class="text-xl font-bold text-blue-800">{{ formatRupees(plan()!.summary.ticketsTotal) }}</div>
                      </div>
                      <div class="bg-purple-50 rounded-lg p-4 border border-purple-200">
                        <div class="text-xs text-purple-600 font-medium">Hotels (Company)</div>
                        <div class="text-xl font-bold text-purple-800">{{ formatRupees(plan()!.summary.hotelsTotal) }}</div>
                      </div>
                      <div class="bg-amber-50 rounded-lg p-4 border border-amber-200">
                        <div class="text-xs text-amber-600 font-medium">Expenses (Traveller)</div>
                        <div class="text-xl font-bold text-amber-800">{{ formatRupees(plan()!.summary.expensesTotal) }}</div>
                      </div>
                      <div class="bg-green-50 rounded-lg p-4 border border-green-200">
                        <div class="text-xs text-green-600 font-medium">Total Cost of Travel</div>
                        <div class="text-xl font-bold text-green-800">{{ formatRupees(plan()!.summary.costOfTravel) }}</div>
                      </div>
                    </div>
                  </div>

                  <!-- Reimbursement Tracking (Expenses only) -->
                  <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
                    <h3 class="text-lg font-semibold text-gray-700 mb-4 flex items-center gap-2">
                      <i class="pi pi-money-bill text-green-600"></i> Reimbursement Tracking
                    </h3>
                    <p class="text-xs text-gray-400 mb-3">Only traveller-paid expenses are considered for reimbursement.</p>
                    <div class="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                      <div class="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <div class="text-xs text-gray-500 font-medium">Traveller Expenses</div>
                        <div class="text-lg font-semibold">{{ formatRupees(plan()!.summary.expensesTotal) }}</div>
                      </div>
                      <div class="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <div class="text-xs text-gray-500 font-medium">Advance Given</div>
                        <div class="text-lg font-semibold">{{ formatRupees(plan()!.summary.advanceAmountPaise) }}</div>
                        <p-tag [value]="plan()!.advanceStatus" [severity]="advanceSeverity(plan()!.advanceStatus)" [style]="{'font-size':'0.65rem'}" class="mt-1" />
                      </div>
                      <div class="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <div class="text-xs text-gray-500 font-medium">Reimbursement Due</div>
                        <div class="text-lg font-semibold" [class]="plan()!.summary.reimbursementDue > 0 ? 'text-red-600' : 'text-green-600'">{{ formatRupees(plan()!.summary.reimbursementDue) }}</div>
                        <p class="text-xs text-gray-400">Expenses − Advance</p>
                      </div>
                    </div>
                    <div class="grid grid-cols-2 lg:grid-cols-3 gap-4">
                      <div class="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <div class="text-xs text-gray-500 font-medium">Reimbursement Paid</div>
                        <div class="text-lg font-semibold text-green-700">{{ formatRupees(plan()!.reimbursementPaidPaise) }}</div>
                      </div>
                      <div class="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <div class="text-xs text-gray-500 font-medium">Balance Remaining</div>
                        <div class="text-lg font-semibold" [class]="plan()!.summary.reimbursementBalance > 0 ? 'text-red-600' : 'text-green-600'">{{ formatRupees(plan()!.summary.reimbursementBalance) }}</div>
                      </div>
                      <div class="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <div class="text-xs text-gray-500 font-medium">Status / Reference</div>
                        <p-tag [value]="plan()!.reimbursementStatus" [severity]="reimbursementSeverity(plan()!.reimbursementStatus)" />
                        @if (plan()!.reimbursementRef) {
                          <p class="text-xs text-gray-500 mt-1">Ref: {{ plan()!.reimbursementRef }}</p>
                        }
                      </div>
                    </div>
                  </div>

                  <!-- Per-Object Cost Share -->
                  @if (plan()!.associations.length > 0) {
                    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                      <h3 class="text-lg font-semibold text-gray-700 mb-2 flex items-center gap-2">
                        <i class="pi pi-share-alt text-indigo-600"></i> Per-Object Cost Share
                      </h3>
                      <p class="text-sm text-gray-500 mb-4">Total Cost of Travel ({{ formatRupees(plan()!.summary.costOfTravel) }}) divided equally among {{ plan()!.associations.length }} linked object(s)</p>
                      <p-table [value]="plan()!.associations" styleClass="p-datatable-sm">
                        <ng-template pTemplate="header">
                          <tr>
                            <th>Type</th><th>Name</th><th class="text-right">Share (₹)</th>
                          </tr>
                        </ng-template>
                        <ng-template pTemplate="body" let-a>
                          <tr>
                            <td><p-tag [value]="a.entityType" severity="info" /></td>
                            <td>{{ a.entityName || a.entityId }}</td>
                            <td class="text-right font-medium">{{ formatRupees(plan()!.summary.perObjectShare) }}</td>
                          </tr>
                        </ng-template>
                      </p-table>
                    </div>
                  }
                }
              </div>
            </p-tabpanel>
          </p-tabpanels>
        </p-tabs>
      }

      <!-- Ticket Dialog -->
      <p-dialog [header]="ticketEditId ? 'Edit Ticket' : 'Add Ticket'" [(visible)]="ticketDialogVisible" [modal]="true" [style]="{width:'550px'}">
        <form [formGroup]="ticketForm" class="flex flex-col gap-4 pt-2">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Type *</label>
            <p-select appendTo="body" formControlName="ticketType" [options]="ticketTypes" optionLabel="label" optionValue="value" class="w-full" />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">From *</label>
              <input pInputText formControlName="fromLocation" class="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">To *</label>
              <input pInputText formControlName="toLocation" class="w-full" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Travel Date *</label>
              <p-datepicker appendTo="body" formControlName="travelDate" dateFormat="yy-mm-dd" class="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Return Date</label>
              <p-datepicker appendTo="body" formControlName="returnDate" dateFormat="yy-mm-dd" class="w-full" />
            </div>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Booking Ref</label>
            <input pInputText formControlName="bookingRef" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Amount (₹) *</label>
            <p-inputNumber formControlName="amountRupees" mode="currency" currency="INR" locale="en-IN" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Notes</label>
            <textarea pTextarea formControlName="notes" [rows]="2" class="w-full"></textarea>
          </div>
        </form>
        <ng-template pTemplate="footer">
          <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="ticketDialogVisible=false" />
          <p-button [label]="ticketEditId ? 'Update' : 'Add'" icon="pi pi-check" [disabled]="ticketForm.invalid" (onClick)="saveTicket()" />
        </ng-template>
      </p-dialog>

      <!-- Hotel Dialog -->
      <p-dialog [header]="hotelEditId ? 'Edit Hotel' : 'Add Hotel'" [(visible)]="hotelDialogVisible" [modal]="true" [style]="{width:'550px'}">
        <form [formGroup]="hotelForm" class="flex flex-col gap-4 pt-2">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Hotel Name *</label>
            <input pInputText formControlName="hotelName" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Location *</label>
            <input pInputText formControlName="location" class="w-full" />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Check-in *</label>
              <p-datepicker appendTo="body" formControlName="checkIn" dateFormat="yy-mm-dd" class="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Check-out *</label>
              <p-datepicker appendTo="body" formControlName="checkOut" dateFormat="yy-mm-dd" class="w-full" />
            </div>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Booking Ref</label>
            <input pInputText formControlName="bookingRef" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Amount (₹) *</label>
            <p-inputNumber formControlName="amountRupees" mode="currency" currency="INR" locale="en-IN" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Notes</label>
            <textarea pTextarea formControlName="notes" [rows]="2" class="w-full"></textarea>
          </div>
        </form>
        <ng-template pTemplate="footer">
          <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="hotelDialogVisible=false" />
          <p-button [label]="hotelEditId ? 'Update' : 'Add'" icon="pi pi-check" [disabled]="hotelForm.invalid" (onClick)="saveHotel()" />
        </ng-template>
      </p-dialog>

      <!-- Expense Dialog -->
      <p-dialog [header]="expenseEditId ? 'Edit Expense' : 'Add Expense'" [(visible)]="expenseDialogVisible" [modal]="true" [style]="{width:'500px'}">
        <form [formGroup]="expenseForm" class="flex flex-col gap-4 pt-2">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Category *</label>
            <p-select appendTo="body" formControlName="category" [options]="expenseCategories" optionLabel="label" optionValue="value" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Date *</label>
            <p-datepicker appendTo="body" formControlName="expenseDate" dateFormat="yy-mm-dd" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Description *</label>
            <textarea pTextarea formControlName="description" [rows]="2" class="w-full"></textarea>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Amount (₹) *</label>
            <p-inputNumber formControlName="amountRupees" mode="currency" currency="INR" locale="en-IN" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Receipt Ref</label>
            <input pInputText formControlName="receiptRef" class="w-full" />
          </div>
        </form>
        <ng-template pTemplate="footer">
          <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="expenseDialogVisible=false" />
          <p-button [label]="expenseEditId ? 'Update' : 'Add'" icon="pi pi-check" [disabled]="expenseForm.invalid" (onClick)="saveExpense()" />
        </ng-template>
      </p-dialog>

      <!-- Reject Dialog -->
      <p-dialog header="Reject Travel Plan" [(visible)]="rejectDialogVisible" [modal]="true" [style]="{width:'400px'}">
        <div class="flex flex-col gap-3 pt-2">
          <label class="text-sm font-medium text-gray-700">Reason for rejection *</label>
          <textarea pTextarea [(ngModel)]="rejectReason" [rows]="3" class="w-full"></textarea>
        </div>
        <ng-template pTemplate="footer">
          <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="rejectDialogVisible=false" />
          <p-button label="Reject" icon="pi pi-times" severity="danger" [disabled]="!rejectReason.trim()" (onClick)="confirmReject()" />
        </ng-template>
      </p-dialog>
    }
  `,
})
export class TravelDetailComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly msg = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  plan = signal<TravelPlan | null>(null);
  loading = signal(true);
  saving = false;
  serverError = '';
  isCreateMode = false;
  associationsChanged = false;

  // Options
  userOptions = signal<Ref[]>([]);
  buOptions = signal<Ref[]>([]);
  purposeOptions = signal<LookupItem[]>([]);
  opportunityOptions = signal<Ref[]>([]);
  leadOptions = signal<Ref[]>([]);
  accountOptions = signal<Ref[]>([]);
  contactOptions = signal<Ref[]>([]);
  influencerOptions = signal<Ref[]>([]);

  entityTypes = ENTITY_TYPES;
  ticketTypes = TICKET_TYPES;
  expenseCategories = EXPENSE_CATEGORIES;

  // Associations
  formAssociations: Array<{ entityType: string; entityId: string }> = [];

  // Dialogs
  ticketDialogVisible = false;
  ticketEditId: string | null = null;
  hotelDialogVisible = false;
  hotelEditId: string | null = null;
  expenseDialogVisible = false;
  expenseEditId: string | null = null;
  rejectDialogVisible = false;
  rejectReason = '';

  form = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(255)]],
    purpose: ['', Validators.required],
    startDate: [null as Date | null, Validators.required],
    endDate: [null as Date | null, Validators.required],
    leadTravellerId: ['', Validators.required],
    businessUnitId: [''],
    advanceAmountRupees: [null as number | null],
    notes: [''],
    travellerIds: [[] as string[]],
  });

  ticketForm = this.fb.group({
    ticketType: ['FLIGHT', Validators.required],
    fromLocation: ['', [Validators.required, Validators.maxLength(255)]],
    toLocation: ['', [Validators.required, Validators.maxLength(255)]],
    travelDate: [null as Date | null, Validators.required],
    returnDate: [null as Date | null],
    bookingRef: [''],
    amountRupees: [null as number | null, [Validators.required, Validators.min(0)]],
    notes: [''],
  });

  hotelForm = this.fb.group({
    hotelName: ['', [Validators.required, Validators.maxLength(255)]],
    location: ['', [Validators.required, Validators.maxLength(255)]],
    checkIn: [null as Date | null, Validators.required],
    checkOut: [null as Date | null, Validators.required],
    bookingRef: [''],
    amountRupees: [null as number | null, [Validators.required, Validators.min(0)]],
    notes: [''],
  });

  expenseForm = this.fb.group({
    category: ['', Validators.required],
    expenseDate: [null as Date | null, Validators.required],
    description: ['', [Validators.required, Validators.maxLength(500)]],
    amountRupees: [null as number | null, [Validators.required, Validators.min(0)]],
    receiptRef: [''],
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.isCreateMode = !id || id === 'new';
    if (this.isCreateMode) {
      this.loading.set(false);
    } else {
      this.loadPlan(id!);
    }
    this.loadOptions();
  }

  private loadPlan(id: string): void {
    this.loading.set(true);
    this.http.get<{ data: TravelPlan }>(`${environment.apiBaseUrl}/travel-plans/${id}`).subscribe({
      next: (r) => {
        this.plan.set(r.data);
        this.form.patchValue({
          title: r.data.title,
          purpose: r.data.purpose,
          startDate: new Date(r.data.startDate + 'T00:00:00'),
          endDate: new Date(r.data.endDate + 'T00:00:00'),
          leadTravellerId: r.data.leadTravellerId,
          businessUnitId: r.data.businessUnitId ?? '',
          advanceAmountRupees: r.data.advanceAmountPaise ? r.data.advanceAmountPaise / 100 : null,
          notes: r.data.notes ?? '',
          travellerIds: r.data.travellers.map((t) => t.id),
        });
        this.formAssociations = r.data.associations.map((a) => ({ entityType: a.entityType, entityId: a.entityId }));
        this.form.markAsPristine();
        this.associationsChanged = false;
        this.loading.set(false);
      },
      error: () => { this.plan.set(null); this.loading.set(false); },
    });
  }

  private loadOptions(): void {
    this.http.get<{ data: Array<{ id: string; fullName: string }> }>(`${environment.apiBaseUrl}/users?limit=200`).subscribe({
      next: (r) => this.userOptions.set(r.data.map((u) => ({ id: u.id, name: u.fullName }))),
    });
    this.http.get<{ data: Ref[] }>(`${environment.apiBaseUrl}/business-units?limit=200`).subscribe({
      next: (r) => this.buOptions.set(r.data),
    });
    this.http.get<{ data: LookupItem[] }>(`${environment.apiBaseUrl}/lookup-lists/by-code/activity_category/items`).subscribe({
      next: (r) => this.purposeOptions.set(r.data.filter((i) => i.isActive !== false)),
      error: () => {},
    });
    this.http.get<{ data: Array<{ id: string; title: string }> }>(`${environment.apiBaseUrl}/opportunities?limit=200`).subscribe({
      next: (r) => this.opportunityOptions.set(r.data.map((o) => ({ id: o.id, name: o.title }))),
    });
    this.http.get<{ data: Array<{ id: string; title: string }> }>(`${environment.apiBaseUrl}/leads?limit=200`).subscribe({
      next: (r) => this.leadOptions.set(r.data.map((l) => ({ id: l.id, name: l.title }))),
    });
    this.http.get<{ data: Ref[] }>(`${environment.apiBaseUrl}/accounts?limit=200`).subscribe({
      next: (r) => this.accountOptions.set(r.data),
    });
    this.http.get<{ data: Array<{ id: string; firstName: string; lastName: string | null }> }>(`${environment.apiBaseUrl}/contacts?limit=200`).subscribe({
      next: (r) => this.contactOptions.set(r.data.map((c) => ({ id: c.id, name: `${c.firstName}${c.lastName ? ' ' + c.lastName : ''}` }))),
    });
    this.http.get<{ data: Ref[] }>(`${environment.apiBaseUrl}/influencers?limit=200`).subscribe({
      next: (r) => this.influencerOptions.set(r.data),
    });
  }

  // ---- Save (Create / Update) ----

  onSave(): void {
    if (this.form.invalid) return;
    this.saving = true;
    this.serverError = '';

    const v = this.form.value;
    const body: Record<string, unknown> = {
      title: v.title,
      purpose: v.purpose,
      startDate: v.startDate instanceof Date ? this.toLocalDateStr(v.startDate) : v.startDate,
      endDate: v.endDate instanceof Date ? this.toLocalDateStr(v.endDate) : v.endDate,
      leadTravellerId: v.leadTravellerId,
      businessUnitId: v.businessUnitId || null,
      advanceAmountPaise: v.advanceAmountRupees != null ? Math.round(v.advanceAmountRupees * 100) : 0,
      notes: v.notes || null,
      travellerIds: v.travellerIds,
      associations: this.formAssociations.filter((a) => a.entityType && a.entityId),
    };

    if (this.isCreateMode) {
      this.http.post<{ data: TravelPlan }>(`${environment.apiBaseUrl}/travel-plans`, body).subscribe({
        next: (r) => {
          this.saving = false;
          this.msg.add({ severity: 'success', summary: 'Created', detail: 'Travel plan created' });
          this.router.navigate(['/work-area/travels', r.data.id]);
        },
        error: (err: HttpErrorResponse) => {
          this.saving = false;
          this.serverError = err.error?.error?.message ?? 'An error occurred';
        },
      });
    } else {
      this.http.patch<{ data: TravelPlan }>(`${environment.apiBaseUrl}/travel-plans/${this.plan()!.id}`, body).subscribe({
        next: () => {
          this.saving = false;
          this.msg.add({ severity: 'success', summary: 'Saved', detail: 'Travel plan updated' });
          this.loadPlan(this.plan()!.id);
        },
        error: (err: HttpErrorResponse) => {
          this.saving = false;
          this.serverError = err.error?.error?.message ?? 'An error occurred';
        },
      });
    }
  }

  // ---- Status Actions ----

  statusFlow = ['DRAFT', 'SUBMITTED', 'APPROVED', 'BOOKING', 'IN_PROGRESS', 'EXPENSE_SUBMITTED', 'COMPLETED'];

  transitionPlan(action: string): void {
    this.http.post(`${environment.apiBaseUrl}/travel-plans/${this.plan()!.id}/${action}`, {}).subscribe({
      next: () => {
        this.msg.add({ severity: 'success', summary: 'Updated', detail: `Travel plan: ${action}` });
        this.loadPlan(this.plan()!.id);
      },
      error: (err: HttpErrorResponse) => {
        this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? `Failed to ${action}` });
      },
    });
  }

  confirmReject(): void {
    this.http.post(`${environment.apiBaseUrl}/travel-plans/${this.plan()!.id}/reject`, { reason: this.rejectReason.trim() }).subscribe({
      next: () => {
        this.rejectDialogVisible = false;
        this.rejectReason = '';
        this.msg.add({ severity: 'success', summary: 'Rejected', detail: 'Travel plan rejected' });
        this.loadPlan(this.plan()!.id);
      },
      error: (err: HttpErrorResponse) => { this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed to reject' }); },
    });
  }

  // ---- Tickets ----

  openTicketDialog(ticket?: TicketRow): void {
    if (ticket) {
      this.ticketEditId = ticket.id;
      this.ticketForm.patchValue({
        ticketType: ticket.ticketType,
        fromLocation: ticket.fromLocation,
        toLocation: ticket.toLocation,
        travelDate: new Date(ticket.travelDate),
        returnDate: ticket.returnDate ? new Date(ticket.returnDate) : null,
        bookingRef: ticket.bookingRef ?? '',
        amountRupees: ticket.amountPaise / 100,
        notes: ticket.notes ?? '',
      });
    } else {
      this.ticketEditId = null;
      this.ticketForm.reset({ ticketType: 'FLIGHT' });
    }
    this.ticketDialogVisible = true;
  }

  saveTicket(): void {
    if (this.ticketForm.invalid || !this.plan()) return;
    const v = this.ticketForm.value;
    const body: Record<string, unknown> = {
      ticketType: v.ticketType,
      fromLocation: v.fromLocation,
      toLocation: v.toLocation,
      travelDate: v.travelDate instanceof Date ? v.travelDate.toISOString().slice(0, 10) : v.travelDate,
      returnDate: v.returnDate instanceof Date ? v.returnDate.toISOString().slice(0, 10) : v.returnDate || null,
      bookingRef: v.bookingRef || null,
      amountPaise: v.amountRupees != null ? Math.round(v.amountRupees * 100) : 0,
      notes: v.notes || null,
    };

    const baseUrl = `${environment.apiBaseUrl}/travel-plans/${this.plan()!.id}/tickets`;
    const req$ = this.ticketEditId
      ? this.http.patch(`${baseUrl}/${this.ticketEditId}`, body)
      : this.http.post(baseUrl, body);

    req$.subscribe({
      next: () => {
        this.ticketDialogVisible = false;
        this.msg.add({ severity: 'success', summary: 'Saved', detail: `Ticket ${this.ticketEditId ? 'updated' : 'added'}` });
        this.loadPlan(this.plan()!.id);
      },
      error: (err: HttpErrorResponse) => {
        this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed to save ticket' });
      },
    });
  }

  deleteTicket(ticketId: string): void {
    this.confirm.confirm({
      message: 'Delete this ticket?',
      accept: () => {
        this.http.delete(`${environment.apiBaseUrl}/travel-plans/${this.plan()!.id}/tickets/${ticketId}`).subscribe({
          next: () => { this.msg.add({ severity: 'success', summary: 'Deleted', detail: 'Ticket removed' }); this.loadPlan(this.plan()!.id); },
          error: (err: HttpErrorResponse) => { this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed to delete' }); },
        });
      },
    });
  }

  // ---- Hotels ----

  openHotelDialog(hotel?: HotelRow): void {
    if (hotel) {
      this.hotelEditId = hotel.id;
      this.hotelForm.patchValue({
        hotelName: hotel.hotelName,
        location: hotel.location,
        checkIn: new Date(hotel.checkIn),
        checkOut: new Date(hotel.checkOut),
        bookingRef: hotel.bookingRef ?? '',
        amountRupees: hotel.amountPaise / 100,
        notes: hotel.notes ?? '',
      });
    } else {
      this.hotelEditId = null;
      this.hotelForm.reset();
    }
    this.hotelDialogVisible = true;
  }

  saveHotel(): void {
    if (this.hotelForm.invalid || !this.plan()) return;
    const v = this.hotelForm.value;
    const body: Record<string, unknown> = {
      hotelName: v.hotelName,
      location: v.location,
      checkIn: v.checkIn instanceof Date ? v.checkIn.toISOString().slice(0, 10) : v.checkIn,
      checkOut: v.checkOut instanceof Date ? v.checkOut.toISOString().slice(0, 10) : v.checkOut,
      bookingRef: v.bookingRef || null,
      amountPaise: v.amountRupees != null ? Math.round(v.amountRupees * 100) : 0,
      notes: v.notes || null,
    };

    const baseUrl = `${environment.apiBaseUrl}/travel-plans/${this.plan()!.id}/hotels`;
    const req$ = this.hotelEditId
      ? this.http.patch(`${baseUrl}/${this.hotelEditId}`, body)
      : this.http.post(baseUrl, body);

    req$.subscribe({
      next: () => {
        this.hotelDialogVisible = false;
        this.msg.add({ severity: 'success', summary: 'Saved', detail: `Hotel ${this.hotelEditId ? 'updated' : 'added'}` });
        this.loadPlan(this.plan()!.id);
      },
      error: (err: HttpErrorResponse) => {
        this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed to save hotel' });
      },
    });
  }

  deleteHotel(hotelId: string): void {
    this.confirm.confirm({
      message: 'Delete this hotel?',
      accept: () => {
        this.http.delete(`${environment.apiBaseUrl}/travel-plans/${this.plan()!.id}/hotels/${hotelId}`).subscribe({
          next: () => { this.msg.add({ severity: 'success', summary: 'Deleted', detail: 'Hotel removed' }); this.loadPlan(this.plan()!.id); },
          error: (err: HttpErrorResponse) => { this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed to delete' }); },
        });
      },
    });
  }

  // ---- Expenses ----

  openExpenseDialog(expense?: ExpenseRow): void {
    if (expense) {
      this.expenseEditId = expense.id;
      this.expenseForm.patchValue({
        category: expense.category,
        expenseDate: new Date(expense.expenseDate),
        description: expense.description,
        amountRupees: expense.amountPaise / 100,
        receiptRef: expense.receiptRef ?? '',
      });
    } else {
      this.expenseEditId = null;
      this.expenseForm.reset();
    }
    this.expenseDialogVisible = true;
  }

  saveExpense(): void {
    if (this.expenseForm.invalid || !this.plan()) return;
    const v = this.expenseForm.value;
    const body: Record<string, unknown> = {
      category: v.category,
      expenseDate: v.expenseDate instanceof Date ? v.expenseDate.toISOString().slice(0, 10) : v.expenseDate,
      description: v.description,
      amountPaise: v.amountRupees != null ? Math.round(v.amountRupees * 100) : 0,
      receiptRef: v.receiptRef || null,
    };

    const baseUrl = `${environment.apiBaseUrl}/travel-plans/${this.plan()!.id}/expenses`;
    const req$ = this.expenseEditId
      ? this.http.patch(`${baseUrl}/${this.expenseEditId}`, body)
      : this.http.post(baseUrl, body);

    req$.subscribe({
      next: () => {
        this.expenseDialogVisible = false;
        this.msg.add({ severity: 'success', summary: 'Saved', detail: `Expense ${this.expenseEditId ? 'updated' : 'added'}` });
        this.loadPlan(this.plan()!.id);
      },
      error: (err: HttpErrorResponse) => {
        this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed to save expense' });
      },
    });
  }

  deleteExpense(expenseId: string): void {
    this.confirm.confirm({
      message: 'Delete this expense?',
      accept: () => {
        this.http.delete(`${environment.apiBaseUrl}/travel-plans/${this.plan()!.id}/expenses/${expenseId}`).subscribe({
          next: () => { this.msg.add({ severity: 'success', summary: 'Deleted', detail: 'Expense removed' }); this.loadPlan(this.plan()!.id); },
          error: (err: HttpErrorResponse) => { this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed to delete' }); },
        });
      },
    });
  }

  // ---- Associations ----

  addAssociation(): void {
    this.formAssociations = [...this.formAssociations, { entityType: '', entityId: '' }];
    this.associationsChanged = true;
  }

  removeAssociation(index: number): void {
    this.formAssociations = this.formAssociations.filter((_, i) => i !== index);
    this.associationsChanged = true;
  }

  onEntityTypeChange(assoc: { entityType: string; entityId: string }): void {
    assoc.entityId = '';
    this.associationsChanged = true;
  }

  getEntityOptions(entityType: string): Ref[] {
    switch (entityType) {
      case 'OPPORTUNITY': return this.opportunityOptions();
      case 'LEAD': return this.leadOptions();
      case 'ACCOUNT': return this.accountOptions();
      case 'CONTACT': return this.contactOptions();
      case 'INFLUENCER': return this.influencerOptions();
      default: return [];
    }
  }

  // ---- Helpers ----

  goBack(): void {
    this.router.navigate(['/work-area/travels']);
  }

  formatRupees(paise: number): string {
    return '\u20B9' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  /** Format Date as YYYY-MM-DD in local timezone (avoids UTC shift) */
  toLocalDateStr(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  ticketTypeLabel(type: string): string {
    return TICKET_TYPE_LABELS[type] ?? type;
  }

  expenseCatLabel(cat: string): string {
    return EXPENSE_CAT_LABELS[cat] ?? cat;
  }

  statusSeverity(status: string): 'secondary' | 'info' | 'success' | 'danger' | 'warn' {
    switch (status) {
      case 'DRAFT': return 'secondary';
      case 'SUBMITTED': return 'info';
      case 'APPROVED': return 'success';
      case 'REJECTED': return 'danger';
      case 'BOOKING': return 'warn';
      case 'IN_PROGRESS': return 'info';
      case 'EXPENSE_SUBMITTED': return 'warn';
      case 'COMPLETED': return 'success';
      default: return 'secondary';
    }
  }

  advanceSeverity(status: string): 'secondary' | 'info' | 'success' {
    switch (status) {
      case 'NOT_REQUESTED': return 'secondary';
      case 'REQUESTED': return 'info';
      case 'APPROVED': return 'success';
      case 'DISBURSED': return 'success';
      default: return 'secondary';
    }
  }

  reimbursementSeverity(status: string): 'warn' | 'info' | 'success' {
    switch (status) {
      case 'PENDING': return 'warn';
      case 'SUBMITTED': return 'info';
      case 'APPROVED': return 'success';
      case 'PAID': return 'success';
      default: return 'info';
    }
  }
}
