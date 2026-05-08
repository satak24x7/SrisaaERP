import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ReactiveFormsModule, FormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TableModule } from 'primeng/table';
import { DatePickerModule } from 'primeng/datepicker';
import { TextareaModule } from 'primeng/textarea';
import { CheckboxModule } from 'primeng/checkbox';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';

interface Ref { id: string; name: string; }
interface ExpenseCategory { id: string; name: string; sacCode: string | null; defaultGstRateBps: number; reimbursable: boolean; gstInputCreditEligible: boolean; }
interface LineRow {
  id: string; category: string; vendorName: string | null; expenseDate: string; description: string;
  amountPaise: number; gstPaise: number; paymentMode: string;
  vendorGstin: string | null; invoiceNumber: string | null; invoiceDate: string | null;
  hsnSacCode: string | null; gstRateBps: number; supplyType: string;
  cgstPaise: number; sgstPaise: number; igstPaise: number;
  reverseCharge: boolean; itcEligible: boolean;
  attachmentName: string | null; attachmentPath: string | null;
}
interface Association { id: string; entityType: string; entityId: string; entityName: string; }
interface ExpenseSheet {
  id: string; title: string; sheetType: string; status: string;
  claimantId: string; claimantName: string;
  businessUnitId: string | null; businessUnitName: string | null;
  opportunityId: string | null; projectId: string | null; initiativeId: string | null; costCentre: string | null;
  rejectionReason: string | null;
  periodFrom: string; periodTo: string; notes: string | null;
  totalPaise: number; linesTotal: number; gstTotal: number; grandTotal: number; lineCount: number;
  cgstTotal: number; sgstTotal: number; igstTotal: number; itcEligibleTotal: number;
  advanceAmountPaise: number; advanceStatus: string; advancePaidPaise: number;
  advancePaidDate: string | null; advanceRef: string | null; advancePending: number;
  reimbursementStatus: string; reimbursementDue: number; reimbursementPaidPaise: number;
  reimbursementPaidDate: string | null; reimbursementRef: string | null; reimbursementBalance: number;
  paymentPaise: number; paymentDate: string | null; paymentRef: string | null;
  lines: LineRow[];
  associations: Association[];
  createdAt: string; updatedAt: string;
}

const ENTITY_TYPES = [
  { label: 'Project', value: 'PROJECT' }, { label: 'Opportunity', value: 'OPPORTUNITY' },
  { label: 'Initiative', value: 'INITIATIVE' }, { label: 'Account', value: 'ACCOUNT' },
  { label: 'Lead', value: 'LEAD' }, { label: 'Contact', value: 'CONTACT' },
];

const SHEET_TYPES = [
  { label: 'Pre-Project', value: 'PRE_PROJECT' }, { label: 'During Project', value: 'DURING_PROJECT' },
  { label: 'Admin / General', value: 'ADMIN_GENERAL' }, { label: 'Reimbursement', value: 'REIMBURSEMENT' },
];
const PAYMENT_MODES = [
  { label: 'NEFT', value: 'NEFT' }, { label: 'Cheque', value: 'CHEQUE' },
  { label: 'Cash', value: 'CASH' }, { label: 'UPI', value: 'UPI' },
  { label: 'Card', value: 'CARD' }, { label: 'Other', value: 'OTHER' },
];
const GST_RATES = [
  { label: '0%', value: 0 }, { label: '5%', value: 500 },
  { label: '12%', value: 1200 }, { label: '18%', value: 1800 }, { label: '28%', value: 2800 },
];
const SUPPLY_TYPES = [
  { label: 'Intra-State (CGST+SGST)', value: 'INTRA' },
  { label: 'Inter-State (IGST)', value: 'INTER' },
  { label: 'Exempt', value: 'EXEMPT' },
];
const ADVANCE_STATUSES = [
  { label: 'Not Requested', value: 'NOT_REQUESTED' }, { label: 'Requested', value: 'REQUESTED' },
];

@Component({
  selector: 'app-expense-sheet-detail',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, ButtonModule, InputTextModule, SelectModule, InputNumberModule, TagModule, DialogModule, ToastModule, ConfirmDialogModule, TableModule, DatePickerModule, TextareaModule, CheckboxModule, TooltipModule],
  providers: [MessageService, ConfirmationService],
  template: `
    <p-toast /><p-confirmDialog />

    @if (loading()) {
      <div class="flex items-center justify-center h-64"><i class="pi pi-spin pi-spinner text-4xl text-blue-500"></i></div>
    } @else {
      <div class="p-6">
        <!-- Header -->
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            <p-button icon="pi pi-arrow-left" [text]="true" [rounded]="true" (onClick)="goBack()" />
            <h2 class="text-2xl font-bold text-gray-800">{{ isCreateMode ? 'New Expense Sheet' : sheet()?.title }}</h2>
            @if (!isCreateMode && sheet()) {
              <p-tag [value]="sheet()!.status.replace('_', ' ')" [severity]="statusSeverity(sheet()!.status)" />
            }
          </div>
          @if (!isCreateMode && sheet()) {
            <div class="flex gap-2">
              @if (sheet()!.status === 'DRAFT') {
                <p-button label="Submit for Approval" icon="pi pi-send" severity="info" (onClick)="transition('submit')" />
              }
              @if (sheet()!.status === 'SUBMITTED') {
                <p-button label="Approve" icon="pi pi-check" severity="success" (onClick)="transition('approve')" />
                <p-button label="Reject" icon="pi pi-times" severity="danger" (onClick)="openRejectDialog()" />
              }
              @if (sheet()!.status === 'REJECTED') {
                <p-button label="Revise" icon="pi pi-refresh" severity="warn" (onClick)="transition('revise')" />
              }
              @if (sheet()!.status === 'APPROVED') {
                <p-button label="Start Work" icon="pi pi-play" severity="info" (onClick)="transition('start')" />
              }
              @if (sheet()!.status === 'IN_PROGRESS') {
                <p-button label="Submit Expenses" icon="pi pi-send" severity="info" (onClick)="transition('submit-expenses')" />
              }
              @if (sheet()!.status === 'EXPENSE_SUBMITTED') {
                <p-button label="Complete" icon="pi pi-check-circle" severity="success" (onClick)="transition('complete')" />
                <p-button label="Return for Revision" icon="pi pi-undo" severity="warn" (onClick)="transition('return-expenses')" />
              }
            </div>
          }
        </div>

        <!-- Status Flow -->
        @if (!isCreateMode && sheet()) {
          <div class="flex items-center gap-1 mb-4 text-xs flex-wrap">
            @for (step of statusFlow; track step) {
              <span class="px-2 py-1 rounded-full" [class]="sheet()!.status === step.value ? 'bg-blue-600 text-white font-bold' : (isStepDone(step.value) ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400')">{{ step.label }}</span>
              @if (!$last) { <i class="pi pi-angle-right text-gray-300"></i> }
            }
          </div>
        }

        <!-- Rejection Reason -->
        @if (!isCreateMode && sheet()?.rejectionReason) {
          <div class="p-3 mb-4 bg-red-50 border border-red-300 rounded-lg flex items-start gap-2">
            <i class="pi pi-exclamation-triangle text-red-500 mt-0.5"></i>
            <div>
              <div class="text-sm font-semibold text-red-700">Rejection Reason</div>
              <div class="text-sm text-red-600">{{ sheet()!.rejectionReason }}</div>
            </div>
          </div>
        }

        <!-- Form -->
        <form [formGroup]="form" (ngSubmit)="onSave()">
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 class="text-lg font-semibold text-gray-700 mb-4"><i class="pi pi-file-edit text-blue-600"></i> Sheet Details</h3>
              <div class="flex flex-col gap-4">
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Title *</label>
                  <input pInputText formControlName="title" class="w-full" />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Type *</label>
                  <p-select appendTo="body" formControlName="sheetType" [options]="sheetTypes" optionLabel="label" optionValue="value" class="w-full" />
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-gray-700">Period From *</label>
                    <p-datepicker appendTo="body" formControlName="periodFrom" dateFormat="yy-mm-dd" class="w-full" />
                  </div>
                  <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-gray-700">Period To *</label>
                    <p-datepicker appendTo="body" formControlName="periodTo" dateFormat="yy-mm-dd" class="w-full" />
                  </div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-gray-700">Advance Requested (₹)</label>
                    <p-inputNumber formControlName="advanceAmountRupees" mode="currency" currency="INR" locale="en-IN" class="w-full" />
                  </div>
                  <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-gray-700">Advance Status</label>
                    <p-select appendTo="body" formControlName="advanceStatus" [options]="advanceStatuses" optionLabel="label" optionValue="value" class="w-full" />
                  </div>
                </div>

                <!-- Advance/Reimbursement status (read-only, after approval) -->
                @if (!isCreateMode && sheet() && sheet()!.status !== 'DRAFT') {
                  <div class="rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm">
                    <div class="grid grid-cols-2 gap-2">
                      <div>
                        <span class="text-gray-500">Advance Paid:</span>
                        <span class="font-medium ml-1">{{ formatRupees(sheet()!.advancePaidPaise) }}</span>
                        @if (sheet()!.advancePaidDate) { <span class="text-gray-400 ml-1">({{ sheet()!.advancePaidDate }})</span> }
                      </div>
                      <div>
                        <span class="text-gray-500">Pending:</span>
                        <span class="font-medium ml-1" [class]="sheet()!.advancePending > 0 ? 'text-red-600' : 'text-green-600'">{{ formatRupees(sheet()!.advancePending) }}</span>
                      </div>
                      <div>
                        <span class="text-gray-500">Reimbursement Due:</span>
                        <span class="font-medium ml-1">{{ formatRupees(sheet()!.reimbursementDue) }}</span>
                      </div>
                      <div>
                        <span class="text-gray-500">Reimbursement Paid:</span>
                        <span class="font-medium ml-1">{{ formatRupees(sheet()!.reimbursementPaidPaise) }}</span>
                        <span class="font-medium ml-1" [class]="sheet()!.reimbursementBalance > 0 ? 'text-red-600' : 'text-green-600'">(Balance: {{ formatRupees(sheet()!.reimbursementBalance) }})</span>
                      </div>
                    </div>
                  </div>
                }
              </div>
            </div>
            <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 class="text-lg font-semibold text-gray-700 mb-4"><i class="pi pi-users text-green-600"></i> Assignment</h3>
              <div class="flex flex-col gap-4">
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Claimant *</label>
                  <p-select appendTo="body" formControlName="claimantUserId" [options]="userOptions()" optionLabel="name" optionValue="id" [filter]="true" class="w-full" />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Business Unit</label>
                  <p-select appendTo="body" formControlName="businessUnitId" [options]="buOptions()" optionLabel="name" optionValue="id" [filter]="true" [showClear]="true" class="w-full" />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Notes</label>
                  <textarea pTextarea formControlName="notes" [rows]="2" class="w-full"></textarea>
                </div>

                <!-- Linked Objects -->
                <div class="flex flex-col gap-2">
                  <label class="text-sm font-medium text-gray-700"><i class="pi pi-link mr-1"></i> Linked Objects</label>
                  @for (assoc of formAssociations; track assoc; let i = $index) {
                    <div class="flex items-center gap-2">
                      <p-select appendTo="body" [(ngModel)]="assoc.entityType" [ngModelOptions]="{standalone: true}" [options]="entityTypes" optionLabel="label" optionValue="value" placeholder="Type" class="w-36" (onChange)="loadEntityOptions(assoc.entityType); form.markAsDirty()" />
                      <p-select appendTo="body" [(ngModel)]="assoc.entityId" [ngModelOptions]="{standalone: true}" [options]="getEntityOptions(assoc.entityType)" optionLabel="name" optionValue="id" [filter]="true" placeholder="Select..." class="flex-1" (onChange)="form.markAsDirty()" />
                      <p-button icon="pi pi-trash" [text]="true" [rounded]="true" size="small" severity="danger" (onClick)="removeAssociation(i)" />
                    </div>
                  }
                  <p-button label="Add Link" icon="pi pi-plus" [text]="true" size="small" (onClick)="addAssociation()" />
                </div>
              </div>
            </div>
          </div>

          @if (serverError) {
            <div class="p-3 mb-4 bg-red-50 border border-red-200 rounded text-sm text-red-700">{{ serverError }}</div>
          }
          <div class="flex justify-end gap-2 mb-6">
            <p-button label="Cancel" severity="secondary" [outlined]="true" (onClick)="goBack()" />
            <p-button [label]="isCreateMode ? 'Create Expense Sheet' : 'Save Changes'" type="submit" icon="pi pi-save" [loading]="saving" [disabled]="(!isCreateMode && form.pristine) || form.invalid || saving" />
          </div>
        </form>

        <!-- Lines (only in edit mode) -->
        @if (!isCreateMode && sheet()) {
          <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-semibold text-gray-700"><i class="pi pi-list text-indigo-600"></i> Expense Lines</h3>
              @if (isLineEditable()) {
                <p-button label="Add Line" icon="pi pi-plus" size="small" (onClick)="openLineDialog()" />
              }
            </div>
            <p-table [value]="sheet()!.lines" styleClass="p-datatable-sm" [scrollable]="true">
              <ng-template pTemplate="header">
                <tr>
                  <th>Date</th><th>Category</th><th>Vendor</th><th>GSTIN</th><th>Invoice</th><th>Description</th>
                  <th class="text-right">Amount (₹)</th><th class="text-right">CGST</th><th class="text-right">SGST</th><th class="text-right">IGST</th>
                  <th class="text-center">ITC</th><th>Proof</th><th style="width:80px">Actions</th>
                </tr>
              </ng-template>
              <ng-template pTemplate="body" let-l>
                <tr>
                  <td>{{ l.expenseDate | date:'dd/MM/yy' }}</td>
                  <td><p-tag [value]="l.category" severity="info" /></td>
                  <td class="text-sm">{{ l.vendorName || '-' }}</td>
                  <td class="text-xs font-mono">{{ l.vendorGstin || '-' }}</td>
                  <td class="text-sm">{{ l.invoiceNumber || '-' }}</td>
                  <td class="text-sm">{{ l.description }}</td>
                  <td class="text-right font-medium">{{ formatRupees(l.amountPaise) }}</td>
                  <td class="text-right text-sm">{{ formatRupees(l.cgstPaise) }}</td>
                  <td class="text-right text-sm">{{ formatRupees(l.sgstPaise) }}</td>
                  <td class="text-right text-sm">{{ formatRupees(l.igstPaise) }}</td>
                  <td class="text-center">
                    @if (l.itcEligible) { <i class="pi pi-check-circle text-green-600"></i> }
                    @else { <i class="pi pi-minus-circle text-gray-300"></i> }
                  </td>
                  <td>
                    @if (l.attachmentName) {
                      <a class="hover:underline cursor-pointer text-sm flex items-center gap-1" (click)="downloadAttachment(l)">
                        <i class="pi pi-paperclip"></i>
                      </a>
                    } @else { <span class="text-gray-400">-</span> }
                  </td>
                  <td>
                    <div class="flex gap-1">
                      @if (isLineEditable()) {
                        <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small" (onClick)="openLineDialog(l)" />
                        <p-button icon="pi pi-trash" [text]="true" [rounded]="true" size="small" severity="danger" (onClick)="deleteLine(l.id)" />
                      }
                    </div>
                  </td>
                </tr>
              </ng-template>
              <ng-template pTemplate="emptymessage">
                <tr><td colspan="13" class="text-center text-gray-400 py-4">No expense lines yet</td></tr>
              </ng-template>
            </p-table>

            <!-- Summary -->
            @if (sheet()!.lines.length > 0) {
              <div class="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3 mt-4">
                <div class="bg-blue-50 rounded-lg p-3 border border-blue-200">
                  <div class="text-xs text-blue-600 font-medium">Taxable Value</div>
                  <div class="text-lg font-bold text-blue-800">{{ formatRupees(sheet()!.linesTotal) }}</div>
                </div>
                <div class="bg-orange-50 rounded-lg p-3 border border-orange-200">
                  <div class="text-xs text-orange-600 font-medium">CGST</div>
                  <div class="text-lg font-bold text-orange-800">{{ formatRupees(sheet()!.cgstTotal) }}</div>
                </div>
                <div class="bg-amber-50 rounded-lg p-3 border border-amber-200">
                  <div class="text-xs text-amber-600 font-medium">SGST</div>
                  <div class="text-lg font-bold text-amber-800">{{ formatRupees(sheet()!.sgstTotal) }}</div>
                </div>
                <div class="bg-pink-50 rounded-lg p-3 border border-pink-200">
                  <div class="text-xs text-pink-600 font-medium">IGST</div>
                  <div class="text-lg font-bold text-pink-800">{{ formatRupees(sheet()!.igstTotal) }}</div>
                </div>
                <div class="bg-purple-50 rounded-lg p-3 border border-purple-200">
                  <div class="text-xs text-purple-600 font-medium">Total GST</div>
                  <div class="text-lg font-bold text-purple-800">{{ formatRupees(sheet()!.gstTotal) }}</div>
                </div>
                <div class="bg-green-50 rounded-lg p-3 border border-green-200">
                  <div class="text-xs text-green-600 font-medium">Grand Total</div>
                  <div class="text-lg font-bold text-green-800">{{ formatRupees(sheet()!.grandTotal) }}</div>
                </div>
                <div class="bg-teal-50 rounded-lg p-3 border border-teal-200">
                  <div class="text-xs text-teal-600 font-medium">ITC Eligible</div>
                  <div class="text-lg font-bold text-teal-800">{{ formatRupees(sheet()!.itcEligibleTotal) }}</div>
                </div>
              </div>
            }
          </div>

          <!-- Bills (AI Import) -->
          <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-semibold text-gray-700"><i class="pi pi-file-import text-purple-600"></i> Bills — AI Import</h3>
              <div class="flex gap-2">
                @if (isLineEditable()) {
                  <label class="p-button p-button-outlined p-button-sm cursor-pointer">
                    <i class="pi pi-upload mr-1"></i> Upload Bills
                    <input type="file" multiple accept="image/*,.pdf" (change)="onBillFilesSelect($event)" class="hidden" />
                  </label>
                }
                @if (pendingBillCount() > 0 && isLineEditable()) {
                  <p-button [label]="'Process ' + pendingBillCount() + ' Bill(s) with AI'" icon="pi pi-sparkles" severity="help" size="small" [loading]="billProcessing" (onClick)="processBills()" />
                }
              </div>
            </div>

            @if (billUploading) {
              <div class="flex items-center gap-2 text-sm text-gray-500 mb-3"><i class="pi pi-spin pi-spinner"></i> Uploading bills...</div>
            }

            @if (bills().length > 0) {
              <p-table [value]="bills()" styleClass="p-datatable-sm">
                <ng-template pTemplate="header">
                  <tr><th>File</th><th>Size</th><th>Status</th><th>Extracted Data</th><th style="width:100px">Actions</th></tr>
                </ng-template>
                <ng-template pTemplate="body" let-b>
                  <tr>
                    <td class="text-sm font-medium"><i class="pi pi-file mr-1"></i> {{ b.fileName }}</td>
                    <td class="text-sm text-gray-500">{{ formatFileSize(b.fileSize) }}</td>
                    <td>
                      <p-tag [value]="b.importStatus" [severity]="billStatusSev(b.importStatus)" />
                      @if (b.importStatus === 'FAILED' && b.errorMessage) {
                        <div class="text-xs text-red-500 mt-1">{{ b.errorMessage }}</div>
                      }
                    </td>
                    <td class="text-xs">
                      @if (b.importStatus === 'IMPORTED' && b.aiExtractedData) {
                        <div class="flex flex-wrap gap-1">
                          @if (b.aiExtractedData.vendorName) { <span class="bg-blue-50 px-1.5 py-0.5 rounded">{{ b.aiExtractedData.vendorName }}</span> }
                          @if (b.aiExtractedData.invoiceNumber) { <span class="bg-gray-100 px-1.5 py-0.5 rounded">#{{ b.aiExtractedData.invoiceNumber }}</span> }
                          <span class="bg-green-50 px-1.5 py-0.5 rounded font-medium">{{ formatRupees(b.aiExtractedData.amountPaise) }}</span>
                        </div>
                      } @else if (b.importStatus === 'PROCESSING') {
                        <span class="text-gray-400"><i class="pi pi-spin pi-spinner mr-1"></i> Processing...</span>
                      } @else if (b.importStatus === 'PENDING') {
                        <span class="text-gray-400">Waiting for AI processing</span>
                      }
                    </td>
                    <td>
                      <div class="flex gap-1">
                        @if (b.importStatus === 'FAILED') {
                          <p-button icon="pi pi-refresh" [text]="true" [rounded]="true" size="small" pTooltip="Retry" (onClick)="retryBill(b.id)" />
                        }
                        <p-button icon="pi pi-trash" [text]="true" [rounded]="true" size="small" severity="danger" pTooltip="Remove" (onClick)="deleteBill(b.id)" />
                      </div>
                    </td>
                  </tr>
                </ng-template>
              </p-table>
            } @else {
              <div class="text-center text-gray-400 py-4 text-sm">No bills uploaded. Upload bill images or PDFs and process them with AI to auto-create expense lines.</div>
            }
          </div>
        }
      </div>
    }

    <!-- Reject Dialog -->
    <p-dialog header="Reject Expense Sheet" [(visible)]="rejectDialogVisible" [modal]="true" [style]="{width:'450px'}">
      <div class="flex flex-col gap-4 pt-2">
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Reason for rejection</label>
          <textarea pTextarea [(ngModel)]="rejectReason" [rows]="3" class="w-full" placeholder="Explain why this expense sheet is being rejected..."></textarea>
        </div>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="rejectDialogVisible=false" />
        <p-button label="Reject" icon="pi pi-times" severity="danger" (onClick)="submitReject()" />
      </ng-template>
    </p-dialog>

    <!-- Line Dialog -->
    <p-dialog [header]="lineEditId ? 'Edit Expense Line' : 'Add Expense Line'" [(visible)]="lineDialogVisible" [modal]="true" [style]="{width:'750px'}">
      <form [formGroup]="lineForm" class="flex flex-col gap-4 pt-2">
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Date *</label>
            <p-datepicker appendTo="body" formControlName="expenseDate" dateFormat="yy-mm-dd" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Category *</label>
            <p-select appendTo="body" formControlName="category" [options]="categoryOptions()" optionLabel="name" optionValue="name" [filter]="true" [editable]="true" placeholder="Select or type" class="w-full" (onChange)="onCategoryChange($event)" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Vendor Name</label>
            <input pInputText formControlName="vendorName" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Vendor GSTIN</label>
            <input pInputText formControlName="vendorGstin" class="w-full font-mono" placeholder="e.g. 36AABCU9603R1ZN" maxlength="15" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Invoice Number</label>
            <input pInputText formControlName="invoiceNumber" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Invoice Date</label>
            <p-datepicker appendTo="body" formControlName="invoiceDate" dateFormat="yy-mm-dd" class="w-full" />
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Description *</label>
          <textarea pTextarea formControlName="description" [rows]="2" class="w-full"></textarea>
        </div>
        <div class="grid grid-cols-3 gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Amount (₹) *</label>
            <p-inputNumber formControlName="amountRupees" mode="currency" currency="INR" locale="en-IN" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">GST Rate</label>
            <p-select appendTo="body" formControlName="gstRateBps" [options]="gstRates" optionLabel="label" optionValue="value" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Supply Type</label>
            <p-select appendTo="body" formControlName="supplyType" [options]="supplyTypes" optionLabel="label" optionValue="value" class="w-full" />
          </div>
        </div>

        <!-- GST auto-computed display -->
        @if (computedGst().total > 0) {
          <div class="rounded-lg bg-blue-50 border border-blue-200 p-3">
            <div class="text-xs text-blue-600 font-medium mb-1">Computed GST Breakdown</div>
            <div class="flex gap-6 text-sm font-medium">
              @if (computedGst().cgst > 0) { <span>CGST: {{ formatRupees(computedGst().cgst) }}</span> }
              @if (computedGst().sgst > 0) { <span>SGST: {{ formatRupees(computedGst().sgst) }}</span> }
              @if (computedGst().igst > 0) { <span>IGST: {{ formatRupees(computedGst().igst) }}</span> }
              <span class="text-blue-800 font-bold">Total GST: {{ formatRupees(computedGst().total) }}</span>
            </div>
          </div>
        }

        <div class="grid grid-cols-3 gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">HSN/SAC Code</label>
            <input pInputText formControlName="hsnSacCode" class="w-full font-mono" maxlength="8" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Payment Mode</label>
            <p-select appendTo="body" formControlName="paymentMode" [options]="paymentModes" optionLabel="label" optionValue="value" class="w-full" />
          </div>
          <div class="flex flex-col gap-1 pt-6">
            <div class="flex items-center gap-4">
              <label class="flex items-center gap-2 text-sm">
                <p-checkbox formControlName="reverseCharge" [binary]="true" />
                RCM
              </label>
              <label class="flex items-center gap-2 text-sm">
                <p-checkbox formControlName="itcEligible" [binary]="true" />
                ITC Eligible
              </label>
            </div>
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Bill / Receipt Attachment</label>
          <input type="file" (change)="onFileSelect($event)" accept="image/*,.pdf" class="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
          @if (existingFileName && !selectedFile) {
            <div class="flex items-center gap-2 mt-1 text-sm text-gray-600">
              <i class="pi pi-paperclip"></i>
              <span>{{ existingFileName }}</span>
              <p-button icon="pi pi-times" [text]="true" [rounded]="true" size="small" severity="danger" (onClick)="removeAttachment = true; existingFileName = ''" />
            </div>
          }
        </div>
      </form>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="lineDialogVisible=false" />
        <p-button [label]="lineEditId ? 'Update' : 'Add'" icon="pi pi-check" [disabled]="lineForm.invalid" (onClick)="saveLine()" />
      </ng-template>
    </p-dialog>
  `,
})
export class ExpenseSheetDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly msg = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  sheet = signal<ExpenseSheet | null>(null);
  loading = signal(true);
  saving = false;
  serverError = '';
  isCreateMode = false;

  userOptions = signal<Ref[]>([]);
  buOptions = signal<Ref[]>([]);
  categoryOptions = signal<ExpenseCategory[]>([]);

  // Linked objects
  formAssociations: Array<{ entityType: string; entityId: string }> = [];
  entityTypes = ENTITY_TYPES;
  opportunityOptions = signal<Ref[]>([]);
  projectOptions = signal<Ref[]>([]);
  initiativeOptions = signal<Ref[]>([]);
  accountOptions = signal<Ref[]>([]);
  leadOptions = signal<Ref[]>([]);
  contactOptions = signal<Ref[]>([]);

  sheetTypes = SHEET_TYPES;
  paymentModes = PAYMENT_MODES;
  gstRates = GST_RATES;
  supplyTypes = SUPPLY_TYPES;
  advanceStatuses = ADVANCE_STATUSES;

  statusFlow = [
    { label: 'Draft', value: 'DRAFT' }, { label: 'Submitted', value: 'SUBMITTED' },
    { label: 'Approved', value: 'APPROVED' }, { label: 'In Progress', value: 'IN_PROGRESS' },
    { label: 'Expenses Submitted', value: 'EXPENSE_SUBMITTED' }, { label: 'Completed', value: 'COMPLETED' },
  ];
  private statusOrder = ['DRAFT', 'SUBMITTED', 'APPROVED', 'IN_PROGRESS', 'EXPENSE_SUBMITTED', 'COMPLETED'];

  // Reject dialog
  rejectDialogVisible = false;
  rejectReason = '';

  // Bills
  bills = signal<Array<{ id: string; fileName: string; fileSize: number; mimeType: string; importStatus: string; linkedLineId: string | null; aiExtractedData: Record<string, unknown> | null; errorMessage: string | null; createdAt: string }>>([]);
  billUploading = false;
  billProcessing = false;
  pendingBillCount = computed(() => this.bills().filter((b) => b.importStatus === 'PENDING').length);

  // Line dialog
  lineDialogVisible = false;
  lineEditId: string | null = null;
  selectedFile: File | null = null;
  existingFileName = '';
  removeAttachment = false;

  form = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(255)]],
    sheetType: ['ADMIN_GENERAL', Validators.required],
    claimantUserId: ['', Validators.required],
    businessUnitId: [''],
    periodFrom: [null as Date | null, Validators.required],
    periodTo: [null as Date | null, Validators.required],
    notes: [''],
    advanceAmountRupees: [null as number | null],
    advanceStatus: ['NOT_REQUESTED'],
  });

  lineForm = this.fb.group({
    expenseDate: [null as Date | null, Validators.required],
    category: ['', [Validators.required, Validators.maxLength(64)]],
    vendorName: [''],
    vendorGstin: [''],
    invoiceNumber: [''],
    invoiceDate: [null as Date | null],
    description: ['', [Validators.required, Validators.maxLength(500)]],
    amountRupees: [null as number | null, [Validators.required, Validators.min(0)]],
    gstRateBps: [1800],
    supplyType: ['INTRA'],
    hsnSacCode: [''],
    paymentMode: ['NEFT'],
    reverseCharge: [false],
    itcEligible: [false],
  });

  // Computed GST preview
  computedGst = computed(() => {
    const amt = this.lineForm.get('amountRupees')?.value ?? 0;
    const rate = this.lineForm.get('gstRateBps')?.value ?? 0;
    const supply = this.lineForm.get('supplyType')?.value ?? 'INTRA';
    const amtPaise = Math.round((amt ?? 0) * 100);
    if (amtPaise <= 0 || rate <= 0 || supply === 'EXEMPT') return { cgst: 0, sgst: 0, igst: 0, total: 0 };
    const totalGst = Math.floor(amtPaise * rate / 10000);
    if (supply === 'INTER') return { cgst: 0, sgst: 0, igst: totalGst, total: totalGst };
    const half = Math.floor(totalGst / 2);
    return { cgst: half, sgst: totalGst - half, igst: 0, total: totalGst };
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.isCreateMode = !id || id === 'new';
    if (this.isCreateMode) {
      this.loading.set(false);
    } else {
      this.loadSheet(id!);
    }
    this.loadOptions();

    // Re-compute GST preview when form values change
    this.lineForm.get('amountRupees')?.valueChanges.subscribe(() => this.computedGst());
    this.lineForm.get('gstRateBps')?.valueChanges.subscribe(() => this.computedGst());
    this.lineForm.get('supplyType')?.valueChanges.subscribe(() => this.computedGst());
  }

  private loadSheet(id: string, restoreScroll = false): void {
    const scrollY = restoreScroll ? window.scrollY : 0;
    this.http.get<{ data: ExpenseSheet }>(`${environment.apiBaseUrl}/expense-sheets/${id}`).subscribe({
      next: (r) => {
        this.sheet.set(r.data);
        this.form.patchValue({
          title: r.data.title, sheetType: r.data.sheetType,
          claimantUserId: r.data.claimantId,
          businessUnitId: r.data.businessUnitId ?? '',
          periodFrom: new Date(r.data.periodFrom + 'T00:00:00'),
          periodTo: new Date(r.data.periodTo + 'T00:00:00'),
          notes: r.data.notes ?? '',
          advanceAmountRupees: (r.data.advanceAmountPaise ?? 0) / 100 || null,
          advanceStatus: r.data.advanceStatus ?? 'NOT_REQUESTED',
        });
        this.formAssociations = (r.data.associations || []).map((a) => ({ entityType: a.entityType, entityId: a.entityId }));
        for (const a of this.formAssociations) this.loadEntityOptions(a.entityType);
        this.loadBills(r.data.id);
        this.form.markAsPristine();
        this.loading.set(false);
        if (restoreScroll) setTimeout(() => window.scrollTo({ top: scrollY }), 0);
      },
      error: () => { this.sheet.set(null); this.loading.set(false); },
    });
  }

  private loadOptions(): void {
    this.http.get<{ data: Array<{ id: string; fullName: string }> }>(`${environment.apiBaseUrl}/users?limit=200`).subscribe({
      next: (r) => this.userOptions.set(r.data.map((u) => ({ id: u.id, name: u.fullName }))),
    });
    this.http.get<{ data: Ref[] }>(`${environment.apiBaseUrl}/business-units?limit=200`).subscribe({
      next: (r) => this.buOptions.set(r.data),
    });
    this.http.get<{ data: ExpenseCategory[] }>(`${environment.apiBaseUrl}/expense-categories`).subscribe({
      next: (r) => this.categoryOptions.set(r.data),
    });
  }

  goBack(): void { this.router.navigate(['/work-area/expense-sheets']); }

  onSave(): void {
    if (this.form.invalid) return;
    this.saving = true;
    this.serverError = '';
    const v = this.form.value;
    const validAssocs = this.formAssociations.filter((a) => a.entityType && a.entityId);
    const body: Record<string, unknown> = {
      title: v.title, sheetType: v.sheetType,
      claimantUserId: v.claimantUserId,
      businessUnitId: v.businessUnitId || null,
      periodFrom: v.periodFrom instanceof Date ? this.toLocalDateStr(v.periodFrom) : v.periodFrom,
      periodTo: v.periodTo instanceof Date ? this.toLocalDateStr(v.periodTo) : v.periodTo,
      notes: v.notes || null,
      advanceAmountPaise: v.advanceAmountRupees != null ? Math.round(v.advanceAmountRupees * 100) : 0,
      advanceStatus: v.advanceStatus || 'NOT_REQUESTED',
      associations: validAssocs,
    };

    if (this.isCreateMode) {
      this.http.post<{ data: ExpenseSheet }>(`${environment.apiBaseUrl}/expense-sheets`, body).subscribe({
        next: (r) => { this.saving = false; this.msg.add({ severity: 'success', summary: 'Created' }); this.router.navigate(['/work-area/expense-sheets', r.data.id]); },
        error: (err: HttpErrorResponse) => { this.saving = false; this.serverError = err.error?.error?.message ?? 'Error'; },
      });
    } else {
      this.http.patch<{ data: ExpenseSheet }>(`${environment.apiBaseUrl}/expense-sheets/${this.sheet()!.id}`, body).subscribe({
        next: () => { this.saving = false; this.msg.add({ severity: 'success', summary: 'Saved' }); this.loadSheet(this.sheet()!.id); },
        error: (err: HttpErrorResponse) => { this.saving = false; this.serverError = err.error?.error?.message ?? 'Error'; },
      });
    }
  }

  transition(action: string): void {
    this.http.post(`${environment.apiBaseUrl}/expense-sheets/${this.sheet()!.id}/${action}`, {}).subscribe({
      next: () => { this.msg.add({ severity: 'success', summary: 'Updated', detail: action }); this.loadSheet(this.sheet()!.id); },
      error: (err: HttpErrorResponse) => { this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed' }); },
    });
  }

  // --- Lines ---

  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFile = input.files?.[0] ?? null;
  }

  onCategoryChange(event: { value: string }): void {
    const cat = this.categoryOptions().find((c) => c.name === event.value);
    if (cat) {
      this.lineForm.patchValue({
        hsnSacCode: cat.sacCode ?? '',
        gstRateBps: cat.defaultGstRateBps,
        itcEligible: cat.gstInputCreditEligible,
      });
    }
  }

  openLineDialog(line?: LineRow): void {
    if (line) {
      this.lineEditId = line.id;
      this.lineForm.patchValue({
        expenseDate: new Date(line.expenseDate), category: line.category,
        vendorName: line.vendorName ?? '', vendorGstin: line.vendorGstin ?? '',
        invoiceNumber: line.invoiceNumber ?? '',
        invoiceDate: line.invoiceDate ? new Date(line.invoiceDate) : null,
        description: line.description,
        amountRupees: line.amountPaise / 100,
        gstRateBps: line.gstRateBps, supplyType: line.supplyType,
        hsnSacCode: line.hsnSacCode ?? '',
        paymentMode: line.paymentMode,
        reverseCharge: line.reverseCharge, itcEligible: line.itcEligible,
      });
      this.existingFileName = line.attachmentName ?? '';
    } else {
      this.lineEditId = null;
      this.lineForm.reset({ paymentMode: 'NEFT', gstRateBps: 1800, supplyType: 'INTRA', reverseCharge: false, itcEligible: false });
      this.existingFileName = '';
    }
    this.selectedFile = null;
    this.removeAttachment = false;
    this.lineDialogVisible = true;
  }

  saveLine(): void {
    if (this.lineForm.invalid || !this.sheet()) return;
    const v = this.lineForm.value;
    const fd = new FormData();
    fd.append('expenseDate', v.expenseDate instanceof Date ? this.toLocalDateStr(v.expenseDate) : (v.expenseDate ?? ''));
    fd.append('category', v.category ?? '');
    fd.append('vendorName', v.vendorName ?? '');
    fd.append('vendorGstin', v.vendorGstin ?? '');
    fd.append('invoiceNumber', v.invoiceNumber ?? '');
    fd.append('invoiceDate', v.invoiceDate instanceof Date ? this.toLocalDateStr(v.invoiceDate) : '');
    fd.append('description', v.description ?? '');
    fd.append('amountPaise', String(v.amountRupees != null ? Math.round(v.amountRupees * 100) : 0));
    fd.append('gstRateBps', String(v.gstRateBps ?? 0));
    fd.append('supplyType', v.supplyType ?? 'INTRA');
    fd.append('hsnSacCode', v.hsnSacCode ?? '');
    fd.append('paymentMode', v.paymentMode ?? 'NEFT');
    fd.append('reverseCharge', String(v.reverseCharge ?? false));
    fd.append('itcEligible', String(v.itcEligible ?? false));
    if (this.selectedFile) fd.append('file', this.selectedFile);
    if (this.removeAttachment) fd.append('removeAttachment', 'true');

    const baseUrl = `${environment.apiBaseUrl}/expense-sheets/${this.sheet()!.id}/lines`;
    const req$ = this.lineEditId
      ? this.http.patch(`${baseUrl}/${this.lineEditId}`, fd)
      : this.http.post(baseUrl, fd);

    req$.subscribe({
      next: () => {
        this.lineDialogVisible = false;
        this.selectedFile = null;
        this.msg.add({ severity: 'success', summary: 'Saved', detail: `Line ${this.lineEditId ? 'updated' : 'added'}` });
        this.loadSheet(this.sheet()!.id, true);
      },
      error: (err: HttpErrorResponse) => {
        this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed to save line' });
      },
    });
  }

  deleteLine(lineId: string): void {
    this.confirm.confirm({
      message: 'Delete this line?',
      accept: () => {
        this.http.delete(`${environment.apiBaseUrl}/expense-sheets/${this.sheet()!.id}/lines/${lineId}`).subscribe({
          next: () => { this.msg.add({ severity: 'success', summary: 'Deleted' }); this.loadSheet(this.sheet()!.id, true); },
          error: (err: HttpErrorResponse) => { this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed' }); },
        });
      },
    });
  }

  downloadAttachment(line: LineRow): void {
    if (!line.attachmentPath || !this.sheet()) return;
    this.http.get(`${environment.apiBaseUrl}/expense-sheets/${this.sheet()!.id}/lines/${line.id}/download`, { responseType: 'blob' }).subscribe({
      next: (blob) => { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = line.attachmentName ?? 'attachment'; a.click(); URL.revokeObjectURL(url); },
      error: () => { this.msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to download' }); },
    });
  }

  isLineEditable(): boolean {
    const s = this.sheet()?.status;
    return s === 'DRAFT' || s === 'IN_PROGRESS';
  }

  isStepDone(step: string): boolean {
    const current = this.statusOrder.indexOf(this.sheet()?.status ?? '');
    const target = this.statusOrder.indexOf(step);
    return target >= 0 && current > target;
  }

  openRejectDialog(): void {
    this.rejectReason = '';
    this.rejectDialogVisible = true;
  }

  submitReject(): void {
    this.http.post(`${environment.apiBaseUrl}/expense-sheets/${this.sheet()!.id}/reject`, { reason: this.rejectReason }).subscribe({
      next: () => { this.rejectDialogVisible = false; this.msg.add({ severity: 'success', summary: 'Rejected' }); this.loadSheet(this.sheet()!.id); },
      error: (err: HttpErrorResponse) => { this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed' }); },
    });
  }

  // --- Linked Objects ---

  addAssociation(): void { this.formAssociations = [...this.formAssociations, { entityType: '', entityId: '' }]; this.form.markAsDirty(); }
  removeAssociation(i: number): void { this.formAssociations = this.formAssociations.filter((_, idx) => idx !== i); this.form.markAsDirty(); }

  loadEntityOptions(entityType: string): void {
    const api = environment.apiBaseUrl;
    switch (entityType) {
      case 'OPPORTUNITY':
        if (!this.opportunityOptions().length) this.http.get<{ data: Array<{ id: string; title: string }> }>(`${api}/opportunities?limit=200`).subscribe({ next: (r) => this.opportunityOptions.set(r.data.map((o) => ({ id: o.id, name: o.title }))) });
        break;
      case 'PROJECT':
        if (!this.projectOptions().length) this.http.get<{ data: Ref[] }>(`${api}/projects?limit=200`).subscribe({ next: (r) => this.projectOptions.set(r.data) });
        break;
      case 'INITIATIVE':
        if (!this.initiativeOptions().length) this.http.get<{ data: Array<{ id: string; title: string }> }>(`${api}/initiatives?limit=200`).subscribe({ next: (r) => this.initiativeOptions.set(r.data.map((i) => ({ id: i.id, name: i.title }))) });
        break;
      case 'ACCOUNT':
        if (!this.accountOptions().length) this.http.get<{ data: Ref[] }>(`${api}/accounts?limit=200`).subscribe({ next: (r) => this.accountOptions.set(r.data) });
        break;
      case 'LEAD':
        if (!this.leadOptions().length) this.http.get<{ data: Array<{ id: string; title: string }> }>(`${api}/leads?limit=200`).subscribe({ next: (r) => this.leadOptions.set(r.data.map((l) => ({ id: l.id, name: l.title }))) });
        break;
      case 'CONTACT':
        if (!this.contactOptions().length) this.http.get<{ data: Array<{ id: string; firstName: string; lastName?: string }> }>(`${api}/contacts?limit=200`).subscribe({ next: (r) => this.contactOptions.set(r.data.map((c) => ({ id: c.id, name: `${c.firstName}${c.lastName ? ' ' + c.lastName : ''}` }))) });
        break;
    }
  }

  getEntityOptions(entityType: string): Ref[] {
    switch (entityType) {
      case 'OPPORTUNITY': return this.opportunityOptions();
      case 'PROJECT': return this.projectOptions();
      case 'INITIATIVE': return this.initiativeOptions();
      case 'ACCOUNT': return this.accountOptions();
      case 'LEAD': return this.leadOptions();
      case 'CONTACT': return this.contactOptions();
      default: return [];
    }
  }

  // --- Bills ---

  private loadBills(sheetId: string): void {
    this.http.get<{ data: Array<{ id: string; fileName: string; fileSize: number; mimeType: string; importStatus: string; linkedLineId: string | null; aiExtractedData: Record<string, unknown> | null; errorMessage: string | null; createdAt: string }> }>(`${environment.apiBaseUrl}/expense-sheets/${sheetId}/bills`).subscribe({
      next: (r) => this.bills.set(r.data),
    });
  }

  onBillFilesSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files || files.length === 0 || !this.sheet()) return;
    this.billUploading = true;
    const fd = new FormData();
    for (let i = 0; i < files.length; i++) fd.append('files', files[i]!);
    this.http.post(`${environment.apiBaseUrl}/expense-sheets/${this.sheet()!.id}/bills`, fd).subscribe({
      next: () => { this.billUploading = false; this.msg.add({ severity: 'success', summary: `${files.length} bill(s) uploaded` }); this.loadBills(this.sheet()!.id); },
      error: (err: HttpErrorResponse) => { this.billUploading = false; this.msg.add({ severity: 'error', summary: 'Upload failed', detail: err.error?.error?.message ?? 'Error' }); },
    });
    input.value = ''; // reset file input
  }

  processBills(): void {
    if (!this.sheet()) return;
    this.billProcessing = true;
    this.http.post<{ data: { processed: number; success: number; failed: number } }>(`${environment.apiBaseUrl}/expense-sheets/${this.sheet()!.id}/bills/process`, {}).subscribe({
      next: (r) => {
        this.billProcessing = false;
        const d = r.data;
        this.msg.add({ severity: d.failed > 0 ? 'warn' : 'success', summary: `Processed ${d.processed} bill(s)`, detail: `${d.success} imported, ${d.failed} failed` });
        this.loadSheet(this.sheet()!.id, true);
      },
      error: (err: HttpErrorResponse) => { this.billProcessing = false; this.msg.add({ severity: 'error', summary: 'Processing failed', detail: err.error?.error?.message ?? 'Error' }); },
    });
  }

  retryBill(billId: string): void {
    this.http.post(`${environment.apiBaseUrl}/expense-sheets/${this.sheet()!.id}/bills/${billId}/retry`, {}).subscribe({
      next: () => { this.msg.add({ severity: 'info', summary: 'Bill reset to pending' }); this.loadBills(this.sheet()!.id); },
    });
  }

  deleteBill(billId: string): void {
    this.http.delete(`${environment.apiBaseUrl}/expense-sheets/${this.sheet()!.id}/bills/${billId}`).subscribe({
      next: () => { this.msg.add({ severity: 'success', summary: 'Bill removed' }); this.loadBills(this.sheet()!.id); },
    });
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  billStatusSev(s: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    switch (s) { case 'IMPORTED': return 'success'; case 'PROCESSING': return 'info'; case 'PENDING': return 'warn'; case 'FAILED': return 'danger'; default: return 'secondary'; }
  }

  formatRupees(paise: number): string { return '\u20B9' + ((paise ?? 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
  toLocalDateStr(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  statusSeverity(s: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    switch (s) { case 'COMPLETED': return 'success'; case 'APPROVED': case 'IN_PROGRESS': return 'info'; case 'SUBMITTED': case 'EXPENSE_SUBMITTED': return 'warn'; case 'REJECTED': return 'danger'; default: return 'secondary'; }
  }
}
