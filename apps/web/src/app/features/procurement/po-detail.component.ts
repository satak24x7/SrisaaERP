import { Component, ChangeDetectionStrategy, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ReactiveFormsModule, FormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TableModule } from 'primeng/table';
import { DatePickerModule } from 'primeng/datepicker';
import { TextareaModule } from 'primeng/textarea';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { TooltipModule } from 'primeng/tooltip';
import { environment } from '../../../environments/environment';

interface OemOption {
  id: string; modelName: string; oemPartNo: string | null; brand: string | null;
  unitPricePaise: number; uom: string; hsn: string | null; gstRateBps: number;
  warranty: string | null; masterItemId: string;
  masterItem: { id: string; sku: string; name: string };
  vendor: { id: string; name: string };
}

interface Ref { id: string; name: string; }
interface VendorRef { id: string; name: string; }
interface ProjectRef { id: string; name: string; }
interface BuRef { id: string; name: string; }
interface QuotationRef { id: string; quotationNo: string; vendorId: string; vendorName: string; displayLabel: string; }
interface ItemRef { id: string; name: string; uom: string; hsnSacCode: string | null; }

interface PoLine {
  id: string; lineNo: number; itemId: string | null; description: string; uom: string;
  qty: number; ratePaise: number; discountPct: number; gstRateBps: number;
  supplyType: string; hsnSacCode: string | null; deliveryDate: string | null;
  lineTotalPaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number;
  qtyReceived: number; qtyAccepted: number;
}

interface PoEvent {
  id: string; action: string; fromStatus: string | null; toStatus: string;
  userId: string; userName: string; notes: string | null; createdAt: string;
}

interface PurchaseOrder {
  id: string; poNo: string; poType: string; status: string;
  label: string | null;
  vendor: { id: string; name: string; gstin: string | null; address: string | null; city: string | null; state: string | null };
  quotation: { id: string; quotationNo: string } | null;
  project: { id: string; name: string; projectCode: string | null } | null;
  businessUnit: { id: string; name: string } | null;
  poDate: string; expectedDelivery: string | null;
  deliveryAddress: string | null; paymentTermsDays: number;
  freightPaise: number; notes: string | null;
  paymentTerms: Array<{ id: string; description: string; sortOrder: number }>;
  termConditions: Array<{ id: string; description: string; sortOrder: number }>;
  subTotalPaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number;
  grandTotalPaise: number;
  lines: PoLine[];
  events: PoEvent[];
  createdAt: string;
}

interface EditLine {
  id: string | null; itemId: string | null; description: string; uom: string;
  qty: number; rateRupees: number; discountPct: number; gstRateBps: number;
  supplyType: string; hsnSacCode: string; deliveryDate: Date | null;
}

const PO_TYPES = [
  { label: 'Admin', value: 'ADMIN' }, { label: 'Marketing', value: 'MARKETING' },
  { label: 'Project', value: 'PROJECT' },
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

@Component({
  selector: 'app-po-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, ButtonModule, InputTextModule, InputNumberModule, SelectModule, TagModule, DialogModule, ToastModule, ConfirmDialogModule, TableModule, DatePickerModule, TextareaModule, AutoCompleteModule, TooltipModule],
  providers: [MessageService, ConfirmationService],
  template: `
    <p-toast /><p-confirmDialog />

    @if (loading()) {
      <div class="flex items-center justify-center h-64"><i class="pi pi-spin pi-spinner text-4xl text-indigo-500"></i></div>
    } @else {
      <div class="p-6">
        <!-- Header -->
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            <p-button icon="pi pi-arrow-left" [text]="true" [rounded]="true" (onClick)="goBack()" />
            <h2 class="text-2xl font-bold text-gray-800">{{ isCreateMode ? 'New Purchase Order' : po()?.poNo }}</h2>
            @if (!isCreateMode && po()?.label) {
              <p class="text-sm text-gray-500 mt-1">{{ po()!.label }}</p>
            }
            @if (!isCreateMode && po()) {
              <p-tag [value]="po()!.status.replace('_', ' ')" [severity]="statusSeverity(po()!.status)" />
            }
          </div>
          @if (!isCreateMode && po()) {
            <div class="flex gap-2">
              @if (po()!.status === 'DRAFT') {
                <p-button label="Approve" icon="pi pi-check" severity="success" (onClick)="transition('approve')" />
              }
              @if (po()!.status === 'APPROVED') {
                <p-button label="Issue" icon="pi pi-send" severity="info" (onClick)="transition('issue')" />
                <p-button label="Cancel" icon="pi pi-times" severity="danger" [outlined]="true" (onClick)="transition('cancel')" />
              }
              @if (po()!.status === 'ISSUED') {
                <p-button label="Cancel" icon="pi pi-times" severity="danger" [outlined]="true" (onClick)="transition('cancel')" />
              }
              <p-button label="Print PO" icon="pi pi-print" [outlined]="true" (onClick)="openPrint()" />
            </div>
          }
        </div>

        <!-- CREATE / DRAFT EDIT MODE -->
        @if (isCreateMode || (po() && po()!.status === 'DRAFT')) {
          <form [formGroup]="form" (ngSubmit)="savePo()" class="space-y-6">
            <!-- Header Fields -->
            <div class="bg-white rounded-lg border p-5">
              <h3 class="text-lg font-semibold text-gray-700 mb-4">PO Details</h3>
              <div class="flex flex-col gap-1 mb-4">
                <label class="text-sm font-medium text-gray-600">PO Label / Title</label>
                <input pInputText formControlName="label" class="w-full" placeholder="e.g. Office furniture for HQ, Lab equipment Phase 2 (internal reference, not printed)" />
              </div>
              <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-600">PO Type *</label>
                  <p-select formControlName="poType" [options]="poTypes" optionLabel="label" optionValue="value" placeholder="Select type" appendTo="body" />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-600">Vendor *</label>
                  <p-select formControlName="vendorId" [options]="vendors()" optionLabel="name" optionValue="id" placeholder="Select vendor" [filter]="true" appendTo="body" (onChange)="onVendorChange()" />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-600">Quotation</label>
                  <p-select formControlName="quotationId" [options]="filteredQuotations()" optionLabel="displayLabel" optionValue="id" placeholder="None (select vendor first)" [showClear]="true" [filter]="true" appendTo="body" />
                </div>
                @if (form.value.poType === 'PROJECT') {
                  <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-gray-600">Project *</label>
                    <p-select formControlName="projectId" [options]="projects()" optionLabel="name" optionValue="id" placeholder="Select project" [filter]="true" appendTo="body" (onChange)="onProjectChange()" />
                  </div>
                }
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-600">Business Unit *</label>
                  <p-select formControlName="businessUnitId" [options]="businessUnits()" optionLabel="name" optionValue="id" placeholder="Select BU" appendTo="body" />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-600">PO Date *</label>
                  <p-datepicker formControlName="poDate" dateFormat="dd/mm/yy" [showIcon]="true" appendTo="body" />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-600">Expected Delivery</label>
                  <p-datepicker formControlName="expectedDelivery" dateFormat="dd/mm/yy" [showIcon]="true" appendTo="body" />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-600">Payment Terms (Days)</label>
                  <p-inputNumber formControlName="paymentTermsDays" [min]="0" [max]="365" />
                </div>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-600">Delivery Address</label>
                  <textarea pTextarea formControlName="deliveryAddress" rows="2" class="w-full"></textarea>
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-600">Freight (₹)</label>
                  <p-inputNumber formControlName="freightRupees" mode="decimal" [minFractionDigits]="2" [maxFractionDigits]="2" [min]="0" styleClass="w-full" />
                </div>
              </div>
              <div class="flex flex-col gap-1 mt-4">
                <label class="text-sm font-medium text-gray-600">Notes</label>
                <textarea pTextarea formControlName="notes" rows="2" class="w-full"></textarea>
              </div>

              <!-- Payment Terms List -->
              <div class="mt-6">
                <div class="flex items-center justify-between mb-2">
                  <label class="text-sm font-semibold text-gray-700">Payment Terms</label>
                  <p-button label="Add Term" icon="pi pi-plus" size="small" severity="secondary" (onClick)="addPaymentTerm()" />
                </div>
                @for (term of paymentTermsList; track $index; let i = $index) {
                  <div class="flex items-center gap-2 mb-2">
                    <span class="text-gray-400 text-sm w-6">{{ i + 1 }}.</span>
                    <input pInputText [(ngModel)]="paymentTermsList[i]" [ngModelOptions]="{standalone: true}" class="flex-1" placeholder="e.g. 50% advance on PO, 50% on delivery" />
                    <p-button icon="pi pi-trash" [rounded]="true" [text]="true" severity="danger" size="small" (onClick)="removePaymentTerm(i)" />
                  </div>
                }
                @if (paymentTermsList.length === 0) {
                  <p class="text-sm text-gray-400 italic">No payment terms added</p>
                }
              </div>

              <!-- Terms & Conditions List -->
              <div class="mt-6">
                <div class="flex items-center justify-between mb-2">
                  <label class="text-sm font-semibold text-gray-700">Terms & Conditions</label>
                  <p-button label="Add T&C" icon="pi pi-plus" size="small" severity="secondary" (onClick)="addTermCondition()" />
                </div>
                @for (tc of termConditionsList; track $index; let i = $index) {
                  <div class="flex items-center gap-2 mb-2">
                    <span class="text-gray-400 text-sm w-6">{{ i + 1 }}.</span>
                    <input pInputText [(ngModel)]="termConditionsList[i]" [ngModelOptions]="{standalone: true}" class="flex-1" placeholder="e.g. Goods must conform to specifications" />
                    <p-button icon="pi pi-trash" [rounded]="true" [text]="true" severity="danger" size="small" (onClick)="removeTermCondition(i)" />
                  </div>
                }
                @if (termConditionsList.length === 0) {
                  <p class="text-sm text-gray-400 italic">No terms & conditions added</p>
                }
              </div>
            </div>

            <!-- Line Items -->
            <div class="bg-white rounded-lg border p-5">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-semibold text-gray-700">Line Items</h3>
                <p-button label="Add Line" icon="pi pi-plus" size="small" (onClick)="openLineDialog()" />
              </div>
              <p-table [value]="lines()" styleClass="p-datatable-sm p-datatable-striped">
                <ng-template pTemplate="header">
                  <tr>
                    <th style="width:40px">#</th><th>Description</th><th>UOM</th>
                    <th class="text-right">Qty</th><th class="text-right">Rate (₹)</th>
                    <th class="text-right">Disc %</th><th>GST</th><th>Supply</th>
                    <th>Delivery</th>
                    <th class="text-right">Line Total (₹)</th>
                    <th class="text-right">CGST (₹)</th><th class="text-right">SGST (₹)</th><th class="text-right">IGST (₹)</th>
                    <th style="width:100px">Actions</th>
                  </tr>
                </ng-template>
                <ng-template pTemplate="body" let-line let-i="rowIndex">
                  <tr>
                    <td>{{ i + 1 }}</td>
                    <td class="font-medium">{{ line.description }}</td>
                    <td>{{ line.uom }}</td>
                    <td class="text-right">{{ line.qty }}</td>
                    <td class="text-right">{{ formatRupees(line.ratePaise) }}</td>
                    <td class="text-right">{{ line.discountPct }}%</td>
                    <td>{{ gstLabel(line.gstRateBps) }}</td>
                    <td>{{ line.supplyType }}</td>
                    <td>{{ line.deliveryDate || '—' }}</td>
                    <td class="text-right font-medium">{{ formatRupees(line.lineTotalPaise) }}</td>
                    <td class="text-right">{{ formatRupees(line.cgstPaise) }}</td>
                    <td class="text-right">{{ formatRupees(line.sgstPaise) }}</td>
                    <td class="text-right">{{ formatRupees(line.igstPaise) }}</td>
                    <td>
                      <div class="flex gap-1">
                        <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small" (onClick)="editLine_fn(i)" />
                        <p-button icon="pi pi-trash" [text]="true" [rounded]="true" size="small" severity="danger" (onClick)="removeLine(i)" />
                      </div>
                    </td>
                  </tr>
                </ng-template>
                <ng-template pTemplate="emptymessage">
                  <tr><td colspan="14" class="text-center text-gray-400 py-6">No line items added</td></tr>
                </ng-template>
              </p-table>

              <!-- Summary -->
              @if (lines().length > 0) {
                <div class="flex justify-end mt-4">
                  <div class="w-72 space-y-2 text-sm">
                    <div class="flex justify-between"><span class="text-gray-500">Sub Total</span><span class="font-medium">{{ formatRupees(subTotal()) }}</span></div>
                    <div class="flex justify-between"><span class="text-gray-500">CGST</span><span>{{ formatRupees(cgstTotal()) }}</span></div>
                    <div class="flex justify-between"><span class="text-gray-500">SGST</span><span>{{ formatRupees(sgstTotal()) }}</span></div>
                    <div class="flex justify-between"><span class="text-gray-500">IGST</span><span>{{ formatRupees(igstTotal()) }}</span></div>
                    <div class="flex justify-between"><span class="text-gray-500">Freight</span><span>{{ formatRupees((form.value.freightRupees || 0) * 100) }}</span></div>
                    <div class="flex justify-between border-t pt-2"><span class="font-semibold text-gray-700">Grand Total</span><span class="font-bold text-lg">{{ formatRupees(grandTotal()) }}</span></div>
                  </div>
                </div>
              }
            </div>

            <div class="flex justify-end gap-3">
              <p-button label="Cancel" [outlined]="true" (onClick)="goBack()" />
              <p-button label="{{ isCreateMode ? 'Create PO' : 'Update PO' }}" icon="pi pi-save" type="submit" [disabled]="form.invalid || lines().length === 0" />
            </div>
          </form>
        }

        <!-- READ-ONLY VIEW (non-DRAFT) -->
        @if (!isCreateMode && po() && po()!.status !== 'DRAFT') {
          <div class="space-y-6">
            <!-- Header Details -->
            <div class="bg-white rounded-lg border p-5">
              <h3 class="text-lg font-semibold text-gray-700 mb-4">PO Details</h3>
              <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div><span class="text-gray-500 block">PO Type</span><span class="font-medium">{{ po()!.poType }}</span></div>
                <div><span class="text-gray-500 block">Vendor</span><span class="font-medium">{{ po()!.vendor.name }}</span></div>
                <div><span class="text-gray-500 block">Project</span><span class="font-medium">{{ po()!.project?.name || '-' }}</span></div>
                <div><span class="text-gray-500 block">Business Unit</span><span class="font-medium">{{ po()!.businessUnit?.name || '-' }}</span></div>
                <div><span class="text-gray-500 block">PO Date</span><span class="font-medium">{{ po()!.poDate | date:'mediumDate' }}</span></div>
                <div><span class="text-gray-500 block">Expected Delivery</span><span class="font-medium">{{ po()!.expectedDelivery ? (po()!.expectedDelivery | date:'mediumDate') : '-' }}</span></div>
                <div><span class="text-gray-500 block">Payment Terms</span><span class="font-medium">{{ po()!.paymentTermsDays }} days</span></div>
                <div><span class="text-gray-500 block">Freight</span><span class="font-medium">{{ formatRupees(po()!.freightPaise) }}</span></div>
              </div>
              @if (po()!.deliveryAddress) {
                <div class="mt-3 text-sm"><span class="text-gray-500">Delivery Address:</span> {{ po()!.deliveryAddress }}</div>
              }
              @if (po()!.notes) {
                <div class="mt-3 text-sm"><span class="text-gray-500">Notes:</span> {{ po()!.notes }}</div>
              }
              @if (po()!.paymentTerms?.length) {
                <div class="mt-4">
                  <span class="text-sm font-semibold text-gray-700">Payment Terms</span>
                  <ol class="list-decimal list-inside mt-1 text-sm text-gray-700 space-y-1">
                    @for (t of po()!.paymentTerms; track t.id) { <li>{{ t.description }}</li> }
                  </ol>
                </div>
              }
              @if (po()!.termConditions?.length) {
                <div class="mt-4">
                  <span class="text-sm font-semibold text-gray-700">Terms & Conditions</span>
                  <ol class="list-decimal list-inside mt-1 text-sm text-gray-700 space-y-1">
                    @for (t of po()!.termConditions; track t.id) { <li>{{ t.description }}</li> }
                  </ol>
                </div>
              }
            </div>

            <!-- Line Items Read-Only -->
            <div class="bg-white rounded-lg border p-5">
              <h3 class="text-lg font-semibold text-gray-700 mb-4">Line Items</h3>
              <p-table [value]="po()!.lines" styleClass="p-datatable-sm p-datatable-striped">
                <ng-template pTemplate="header">
                  <tr>
                    <th style="width:40px">#</th><th>Description</th><th>HSN/SAC</th><th>UOM</th>
                    <th class="text-right">Qty</th><th class="text-right">Rate (₹)</th>
                    <th class="text-right">Disc %</th><th>GST</th><th>Supply</th>
                    <th>Delivery</th>
                    <th class="text-right">Line Total (₹)</th>
                    <th class="text-right">CGST (₹)</th><th class="text-right">SGST (₹)</th><th class="text-right">IGST (₹)</th>
                    <th class="text-right">Received</th><th class="text-right">Accepted</th>
                  </tr>
                </ng-template>
                <ng-template pTemplate="body" let-line let-i="rowIndex">
                  <tr>
                    <td>{{ i + 1 }}</td>
                    <td class="font-medium">{{ line.description }}</td>
                    <td>{{ line.hsnSacCode || '-' }}</td>
                    <td>{{ line.uom }}</td>
                    <td class="text-right">{{ line.qty }}</td>
                    <td class="text-right">{{ formatRupees(line.ratePaise) }}</td>
                    <td class="text-right">{{ line.discountPct }}%</td>
                    <td>{{ gstLabel(line.gstRateBps) }}</td>
                    <td>{{ line.supplyType }}</td>
                    <td>{{ line.deliveryDate || '—' }}</td>
                    <td class="text-right font-medium">{{ formatRupees(line.lineTotalPaise) }}</td>
                    <td class="text-right">{{ formatRupees(line.cgstPaise) }}</td>
                    <td class="text-right">{{ formatRupees(line.sgstPaise) }}</td>
                    <td class="text-right">{{ formatRupees(line.igstPaise) }}</td>
                    <td class="text-right">{{ line.qtyReceived }}</td>
                    <td class="text-right">{{ line.qtyAccepted }}</td>
                  </tr>
                </ng-template>
              </p-table>

              <!-- Summary -->
              <div class="flex justify-end mt-4">
                <div class="w-72 space-y-2 text-sm">
                  <div class="flex justify-between"><span class="text-gray-500">Sub Total</span><span class="font-medium">{{ formatRupees(po()!.subTotalPaise) }}</span></div>
                  <div class="flex justify-between"><span class="text-gray-500">CGST</span><span>{{ formatRupees(po()!.cgstPaise) }}</span></div>
                  <div class="flex justify-between"><span class="text-gray-500">SGST</span><span>{{ formatRupees(po()!.sgstPaise) }}</span></div>
                  <div class="flex justify-between"><span class="text-gray-500">IGST</span><span>{{ formatRupees(po()!.igstPaise) }}</span></div>
                  <div class="flex justify-between"><span class="text-gray-500">Freight</span><span>{{ formatRupees(po()!.freightPaise) }}</span></div>
                  <div class="flex justify-between border-t pt-2"><span class="font-semibold text-gray-700">Grand Total</span><span class="font-bold text-lg">{{ formatRupees(po()!.grandTotalPaise) }}</span></div>
                </div>
              </div>
            </div>

            <!-- Events Timeline -->
            @if (po()!.events && po()!.events.length > 0) {
              <div class="bg-white rounded-lg border p-5">
                <h3 class="text-lg font-semibold text-gray-700 mb-4">Status History</h3>
                <div class="space-y-3">
                  @for (ev of po()!.events; track ev.id) {
                    <div class="flex items-start gap-3 text-sm border-l-2 border-indigo-300 pl-4 py-1">
                      <div class="flex-1">
                        <span class="font-medium">{{ ev.action }}</span>
                        @if (ev.fromStatus) {
                          <span class="text-gray-400 mx-1">{{ ev.fromStatus }}</span>
                          <i class="pi pi-arrow-right text-xs text-gray-400 mx-1"></i>
                        }
                        <p-tag [value]="ev.toStatus.replace('_', ' ')" [severity]="statusSeverity(ev.toStatus)" />
                        <span class="text-gray-500 ml-2">by {{ ev.userName }}</span>
                        @if (ev.notes) {
                          <span class="text-gray-500 ml-2">— {{ ev.notes }}</span>
                        }
                      </div>
                      <span class="text-gray-400 text-xs whitespace-nowrap">{{ ev.createdAt | date:'medium' }}</span>
                    </div>
                  }
                </div>
              </div>
            }
          </div>
        }
      </div>
    }

    <!-- Line Item Dialog -->
    <p-dialog [(visible)]="lineDialogVisible" [header]="editingLineIndex >= 0 ? 'Edit Line Item' : 'Add Line Item'" [modal]="true" [style]="{ width: '600px' }">
      <div class="space-y-4 p-2">
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-600">Pick from OEM Catalog (optional)</label>
          <p-autoComplete [suggestions]="oemSuggestions()" (completeMethod)="searchOemCatalog($event)"
            field="modelName" [forceSelection]="false" placeholder="Search by model, part no, brand..."
            styleClass="w-full" [inputStyleClass]="'text-sm w-full'" appendTo="body"
            (onSelect)="onOemSelect($event)">
            <ng-template let-item pTemplate="item">
              <div class="flex flex-col">
                <div class="flex justify-between gap-2">
                  <span class="text-sm font-medium">{{ item.modelName }}</span>
                  <span class="text-xs font-mono text-indigo-600">₹{{ (item.unitPricePaise / 100) | number:'1.2-2' }}</span>
                </div>
                <div class="text-xs text-gray-400">
                  {{ item.vendor.name }} · {{ item.brand || '' }} {{ item.oemPartNo ? '· ' + item.oemPartNo : '' }}
                  · Master: {{ item.masterItem.name }}
                </div>
              </div>
            </ng-template>
          </p-autoComplete>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-600">Master Item (optional)</label>
          <p-select [(ngModel)]="editLine.itemId" [options]="items()" optionLabel="name" optionValue="id"
            placeholder="Select item or leave blank" [showClear]="true" [filter]="true" appendTo="body"
            (onChange)="onItemSelect()" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-600">Description *</label>
          <input pInputText [(ngModel)]="editLine.description" class="w-full" />
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-600">UOM *</label>
            <input pInputText [(ngModel)]="editLine.uom" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-600">HSN/SAC Code</label>
            <input pInputText [(ngModel)]="editLine.hsnSacCode" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-600">Delivery Date</label>
            <p-datepicker [(ngModel)]="editLine.deliveryDate" dateFormat="dd-M-yy" appendTo="body" styleClass="w-full" [showIcon]="true" />
          </div>
        </div>
        <div class="grid grid-cols-3 gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-600">Qty *</label>
            <p-inputNumber [(ngModel)]="editLine.qty" [min]="0.01" mode="decimal" [minFractionDigits]="2" [maxFractionDigits]="4" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-600">Rate (₹) *</label>
            <p-inputNumber [(ngModel)]="editLine.rateRupees" [min]="0" mode="decimal" [minFractionDigits]="2" [maxFractionDigits]="2" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-600">Discount %</label>
            <p-inputNumber [(ngModel)]="editLine.discountPct" [min]="0" [max]="100" mode="decimal" [minFractionDigits]="2" [maxFractionDigits]="2" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-600">GST Rate *</label>
            <p-select [(ngModel)]="editLine.gstRateBps" [options]="gstRates" optionLabel="label" optionValue="value" appendTo="body" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-600">Supply Type *</label>
            <p-select [(ngModel)]="editLine.supplyType" [options]="supplyTypes" optionLabel="label" optionValue="value" appendTo="body" />
          </div>
        </div>
        <!-- Computed Preview -->
        @if (editLine.qty > 0 && editLine.rateRupees > 0) {
          <div class="bg-gray-50 rounded p-3 text-sm space-y-1">
            <div class="flex justify-between"><span class="text-gray-500">Taxable</span><span>{{ formatRupees(computeLineTotal()) }}</span></div>
            @if (editLine.supplyType === 'INTRA') {
              <div class="flex justify-between"><span class="text-gray-500">CGST ({{ editLine.gstRateBps / 200 }}%)</span><span>{{ formatRupees(computeLineCgst()) }}</span></div>
              <div class="flex justify-between"><span class="text-gray-500">SGST ({{ editLine.gstRateBps / 200 }}%)</span><span>{{ formatRupees(computeLineSgst()) }}</span></div>
            }
            @if (editLine.supplyType === 'INTER') {
              <div class="flex justify-between"><span class="text-gray-500">IGST ({{ editLine.gstRateBps / 100 }}%)</span><span>{{ formatRupees(computeLineIgst()) }}</span></div>
            }
            <div class="flex justify-between border-t pt-1 font-medium"><span>Total</span><span>{{ formatRupees(computeLineTotal() + computeLineCgst() + computeLineSgst() + computeLineIgst()) }}</span></div>
          </div>
        }
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" [text]="true" (onClick)="lineDialogVisible = false" />
        <p-button label="{{ editingLineIndex >= 0 ? 'Update' : 'Add' }}" icon="pi pi-check" (onClick)="saveLineItem()"
          [disabled]="!editLine.description || !editLine.uom || editLine.qty <= 0 || editLine.rateRupees <= 0" />
      </ng-template>
    </p-dialog>
  `,
})
export class PoDetailComponent implements OnInit {
  readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly msg = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  po = signal<PurchaseOrder | null>(null);
  loading = signal(false);
  isCreateMode = true;
  poId = '';

  // Lookups
  vendors = signal<VendorRef[]>([]);
  projects = signal<ProjectRef[]>([]);
  businessUnits = signal<BuRef[]>([]);
  allQuotations = signal<QuotationRef[]>([]);
  filteredQuotations = signal<QuotationRef[]>([]);
  items = signal<ItemRef[]>([]);

  // Form
  form = this.fb.group({
    poType: ['ADMIN', Validators.required],
    label: [''],
    vendorId: ['', Validators.required],
    quotationId: [null as string | null],
    projectId: [null as string | null],
    businessUnitId: ['', Validators.required],
    poDate: [new Date(), Validators.required],
    expectedDelivery: [null as Date | null],
    paymentTermsDays: [30],
    deliveryAddress: [null as string | null],
    freightRupees: [0],
    notes: [null as string | null],
  });

  // Line items
  lines = signal<PoLine[]>([]);
  lineDialogVisible = false;
  editingLineIndex = -1;
  editLine: EditLine = this.emptyLine();
  paymentTermsList: string[] = [];
  termConditionsList: string[] = [];

  // Constants
  poTypes = PO_TYPES;
  gstRates = GST_RATES;
  supplyTypes = SUPPLY_TYPES;

  // Computed totals — lineTotalPaise already includes GST, so subTotal = taxable only
  subTotal = computed(() => this.lines().reduce((s, l) => s + l.lineTotalPaise - l.cgstPaise - l.sgstPaise - l.igstPaise, 0));
  cgstTotal = computed(() => this.lines().reduce((s, l) => s + l.cgstPaise, 0));
  sgstTotal = computed(() => this.lines().reduce((s, l) => s + l.sgstPaise, 0));
  igstTotal = computed(() => this.lines().reduce((s, l) => s + l.igstPaise, 0));
  grandTotal = computed(() => this.subTotal() + this.cgstTotal() + this.sgstTotal() + this.igstTotal() + Math.round((this.form.value.freightRupees || 0) * 100));

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.isCreateMode = false;
      this.poId = id;
    }
    this.loadLookups();
  }

  private lookupsLoaded = 0;
  private lookupsExpected = 5;

  private onLookupLoaded(): void {
    this.lookupsLoaded++;
    if (this.lookupsLoaded >= this.lookupsExpected && !this.isCreateMode) {
      this.loadPo();
    }
  }

  private loadLookups(): void {
    this.http.get<{ data: VendorRef[] }>(`${environment.apiBaseUrl}/vendors?limit=200`).subscribe({
      next: (r) => { this.vendors.set(r.data); this.onLookupLoaded(); },
      error: () => this.onLookupLoaded(),
    });
    this.http.get<{ data: ProjectRef[] }>(`${environment.apiBaseUrl}/projects?limit=200`).subscribe({
      next: (r) => { this.projects.set(r.data); this.onLookupLoaded(); },
      error: () => this.onLookupLoaded(),
    });
    this.http.get<{ data: BuRef[] }>(`${environment.apiBaseUrl}/business-units?limit=50`).subscribe({
      next: (r) => { this.businessUnits.set(r.data); this.onLookupLoaded(); },
      error: () => this.onLookupLoaded(),
    });
    this.http.get<{ data: Array<{ id: string; quotationNo: string; vendorId: string; vendorName: string; grandTotalPaise: number }> }>(`${environment.apiBaseUrl}/quotations?limit=200`).subscribe({
      next: (r) => {
        const mapped = r.data.map((q) => ({
          id: q.id, quotationNo: q.quotationNo, vendorId: q.vendorId,
          vendorName: q.vendorName,
          displayLabel: `${q.quotationNo} — ${q.vendorName}`,
        }));
        this.allQuotations.set(mapped);
        this.filteredQuotations.set(mapped);
        this.onLookupLoaded();
      },
      error: () => this.onLookupLoaded(),
    });
    this.http.get<{ data: ItemRef[] }>(`${environment.apiBaseUrl}/items?limit=200`).subscribe({
      next: (r) => { this.items.set(r.data); this.onLookupLoaded(); },
      error: () => this.onLookupLoaded(),
    });
  }

  private loadPo(): void {
    this.loading.set(true);
    this.http.get<{ data: PurchaseOrder }>(`${environment.apiBaseUrl}/purchase-orders/${this.poId}`).subscribe({
      next: (r) => {
        this.po.set(r.data);
        this.lines.set(r.data.lines || []);
        if (r.data.status === 'DRAFT') {
          this.patchForm(r.data);
        }
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed to load PO' });
        this.loading.set(false);
      },
    });
  }

  private patchForm(po: PurchaseOrder): void {
    this.form.patchValue({
      poType: po.poType,
      label: po.label || '',
      vendorId: po.vendor.id,
      quotationId: po.quotation?.id ?? null,
      projectId: po.project?.id ?? null,
      businessUnitId: po.businessUnit?.id ?? '',
      poDate: new Date(po.poDate),
      expectedDelivery: po.expectedDelivery ? new Date(po.expectedDelivery) : null,
      paymentTermsDays: po.paymentTermsDays,
      deliveryAddress: po.deliveryAddress,
      freightRupees: po.freightPaise / 100,
      notes: po.notes,
    });
    this.paymentTermsList = (po.paymentTerms || []).map((t) => t.description);
    this.termConditionsList = (po.termConditions || []).map((t) => t.description);
    if (po.vendor?.id) {
      this.filteredQuotations.set(this.allQuotations().filter((q) => q.vendorId === po.vendor.id));
    }
    if (po.project?.id) {
    }
  }

  onVendorChange(): void {
    const vid = this.form.value.vendorId;
    this.form.patchValue({ quotationId: null });
    if (vid) {
      this.filteredQuotations.set(this.allQuotations().filter((q) => q.vendorId === vid));
    } else {
      this.filteredQuotations.set(this.allQuotations());
    }
  }

  onProjectChange(): void {
    // placeholder for future use
  }

  savePo(): void {
    if (this.form.invalid || this.lines().length === 0) return;
    const v = this.form.value;
    const body: Record<string, unknown> = {
      poType: v.poType,
      label: v.label || null,
      vendorId: v.vendorId,
      quotationId: v.quotationId || null,
      projectId: v.poType === 'PROJECT' ? v.projectId : null,
      businessUnitId: v.businessUnitId,
      poDate: v.poDate instanceof Date ? v.poDate.toISOString().split('T')[0] : v.poDate,
      expectedDelivery: v.expectedDelivery instanceof Date ? v.expectedDelivery.toISOString().split('T')[0] : v.expectedDelivery,
      paymentTermsDays: v.paymentTermsDays ?? 30,
      deliveryAddress: v.deliveryAddress || null,
      freightPaise: Math.round((v.freightRupees || 0) * 100),
      notes: v.notes || null,
      paymentTerms: this.paymentTermsList.filter((t) => t.trim()),
      termConditions: this.termConditionsList.filter((t) => t.trim()),
      lines: this.lines().map((l, i) => ({
        lineNo: i + 1,
        itemId: l.itemId || null,
        description: l.description,
        uom: l.uom,
        qty: l.qty,
        ratePaise: l.ratePaise,
        discountPct: l.discountPct,
        gstRateBps: l.gstRateBps,
        supplyType: l.supplyType,
        hsnSacCode: l.hsnSacCode || null,
        deliveryDate: l.deliveryDate || undefined,
      })),
    };

    const req$ = this.isCreateMode
      ? this.http.post<{ data: PurchaseOrder }>(`${environment.apiBaseUrl}/purchase-orders`, body)
      : this.http.patch<{ data: PurchaseOrder }>(`${environment.apiBaseUrl}/purchase-orders/${this.poId}`, body);

    req$.subscribe({
      next: (r) => {
        this.msg.add({ severity: 'success', summary: this.isCreateMode ? 'PO Created' : 'PO Updated' });
        this.router.navigate(['/procurement/purchase-orders', r.data.id]);
      },
      error: (err: HttpErrorResponse) => {
        const details = err.error?.error?.details;
        const detail = details?.length
          ? details.map((d: { path: string; message: string }) => `${d.path}: ${d.message}`).join(' | ')
          : (err.error?.error?.message ?? 'Failed to save PO');
        this.msg.add({ severity: 'error', summary: 'Error', detail, life: 10000 });
      },
    });
  }

  transition(action: string): void {
    this.confirm.confirm({
      message: `Are you sure you want to ${action} this purchase order?`,
      accept: () => {
        this.http.post<{ data: PurchaseOrder }>(`${environment.apiBaseUrl}/purchase-orders/${this.poId}/${action}`, {}).subscribe({
          next: (r) => {
            this.msg.add({ severity: 'success', summary: `PO ${action}d successfully` });
            this.po.set(r.data);
            this.lines.set(r.data.lines || []);
          },
          error: (err: HttpErrorResponse) => {
            this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed' });
          },
        });
      },
    });
  }

  // ---- Line Item Dialog ----

  emptyLine(): EditLine {
    return { id: null, itemId: null, description: '', uom: 'NOS', qty: 1, rateRupees: 0, discountPct: 0, gstRateBps: 1800, supplyType: 'INTRA', hsnSacCode: '', deliveryDate: null };
  }

  openLineDialog(): void {
    this.editingLineIndex = -1;
    this.editLine = this.emptyLine();
    this.lineDialogVisible = true;
  }

  editLine_fn(index: number): void {
    this.editingLineIndex = index;
    const l = this.lines()[index];
    this.editLine = {
      id: l.id, itemId: l.itemId, description: l.description, uom: l.uom,
      qty: l.qty, rateRupees: l.ratePaise / 100, discountPct: l.discountPct,
      gstRateBps: l.gstRateBps, supplyType: l.supplyType, hsnSacCode: l.hsnSacCode || '',
      deliveryDate: l.deliveryDate ? new Date(l.deliveryDate) : null,
    };
    this.lineDialogVisible = true;
  }



  onItemSelect(): void {
    const itemId = this.editLine.itemId;
    if (!itemId) return;
    const item = this.items().find(i => i.id === itemId);
    if (item) {
      this.editLine.description = item.name;
      this.editLine.uom = item.uom;
      if (item.hsnSacCode) this.editLine.hsnSacCode = item.hsnSacCode;
    }
  }

  oemSuggestions = signal<OemOption[]>([]);

  searchOemCatalog(event: { query: string }): void {
    this.http.get<{ data: OemOption[] }>(`${environment.apiBaseUrl}/oem-catalog?q=${encodeURIComponent(event.query)}&limit=20&status=ACTIVE`).subscribe({
      next: (r) => this.oemSuggestions.set(r.data),
    });
  }

  onOemSelect(event: { value: OemOption }): void {
    const oem = event.value;
    if (!oem) return;
    this.editLine.itemId = oem.masterItemId;
    this.editLine.description = oem.modelName + (oem.brand ? ` (${oem.brand})` : '') + (oem.oemPartNo ? ` [${oem.oemPartNo}]` : '');
    this.editLine.uom = oem.uom;
    this.editLine.rateRupees = oem.unitPricePaise / 100;
    this.editLine.gstRateBps = oem.gstRateBps;
    if (oem.hsn) this.editLine.hsnSacCode = oem.hsn;
  }

  saveLineItem(): void {
    const ratePaise = Math.round(this.editLine.rateRupees * 100);
    const taxable = this.computeLineTotal();
    const cgstPaise = this.computeLineCgst();
    const sgstPaise = this.computeLineSgst();
    const igstPaise = this.computeLineIgst();
    const lineTotalPaise = taxable + cgstPaise + sgstPaise + igstPaise;

    const newLine: PoLine = {
      id: this.editLine.id || `temp-${Date.now()}`,
      lineNo: this.editingLineIndex >= 0 ? this.editingLineIndex + 1 : this.lines().length + 1,
      itemId: this.editLine.itemId,
      description: this.editLine.description,
      uom: this.editLine.uom,
      qty: this.editLine.qty,
      ratePaise,
      discountPct: this.editLine.discountPct,
      gstRateBps: this.editLine.gstRateBps,
      supplyType: this.editLine.supplyType,
      hsnSacCode: this.editLine.hsnSacCode || null,
      deliveryDate: this.editLine.deliveryDate ? this.toDateStr(this.editLine.deliveryDate) : null,
      lineTotalPaise, cgstPaise, sgstPaise, igstPaise,
      qtyReceived: 0, qtyAccepted: 0,
    };

    const current = [...this.lines()];
    if (this.editingLineIndex >= 0) {
      // Preserve received/accepted from original
      newLine.qtyReceived = current[this.editingLineIndex].qtyReceived;
      newLine.qtyAccepted = current[this.editingLineIndex].qtyAccepted;
      current[this.editingLineIndex] = newLine;
    } else {
      current.push(newLine);
    }
    this.lines.set(current);
    this.lineDialogVisible = false;
  }

  removeLine(index: number): void {
    const current = [...this.lines()];
    current.splice(index, 1);
    this.lines.set(current);
  }

  openPrint(): void {
    window.open(`/procurement/purchase-orders/${this.po()!.id}/print`, '_blank');
  }

  // ---- Tax Computation ----

  computeLineTotal(): number {
    const gross = this.editLine.qty * this.editLine.rateRupees * 100;
    const discount = gross * this.editLine.discountPct / 100;
    return Math.round(gross - discount);
  }

  computeLineCgst(): number {
    if (this.editLine.supplyType !== 'INTRA') return 0;
    return Math.round(this.computeLineTotal() * this.editLine.gstRateBps / 20000);
  }

  computeLineSgst(): number {
    if (this.editLine.supplyType !== 'INTRA') return 0;
    return Math.round(this.computeLineTotal() * this.editLine.gstRateBps / 20000);
  }

  computeLineIgst(): number {
    if (this.editLine.supplyType !== 'INTER') return 0;
    return Math.round(this.computeLineTotal() * this.editLine.gstRateBps / 10000);
  }

  // ---- Payment Terms & T&C List ----

  addPaymentTerm(): void { this.paymentTermsList.push(''); }
  removePaymentTerm(i: number): void { this.paymentTermsList.splice(i, 1); }
  addTermCondition(): void { this.termConditionsList.push(''); }
  removeTermCondition(i: number): void { this.termConditionsList.splice(i, 1); }

  // ---- Helpers ----

  goBack(): void { this.router.navigate(['/procurement/purchase-orders']); }

  toDateStr(d: Date | null): string | null {
    if (!d) return null;
    const dt = d instanceof Date ? d : new Date(d);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }

  formatRupees(paise: number): string {
    return '\u20B9' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 });
  }

  gstLabel(bps: number): string {
    return (bps / 100) + '%';
  }

  statusSeverity(s: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    switch (s) {
      case 'DRAFT': return 'info';
      case 'APPROVED': return 'warn';
      case 'ISSUED': return 'success';
      case 'PARTIALLY_RECEIVED': return 'warn';
      case 'COMPLETED': return 'success';
      case 'CANCELLED': return 'danger';
      default: return 'secondary';
    }
  }
}
