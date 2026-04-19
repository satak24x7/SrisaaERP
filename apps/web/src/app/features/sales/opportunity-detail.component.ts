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
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ConfirmationService, MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';
import { ActivityPanelComponent } from '../../shared/components/activity-panel.component';

interface Ref { id: string; name: string; }
interface InfluencerRef { id: string; name: string; rating: number | null; }
interface Opportunity {
  id: string; title: string; stage: string; entryPath: string;
  closedStatus: string | null;
  tenderReleased: boolean;
  contractValuePaise: number | null; probabilityPct: number | null;
  submissionDue: string | null;
  businessUnitId: string; businessUnitName: string | null;
  accountId: string | null; accountName: string | null;
  endClientAccountId: string | null; endClientName: string | null;
  ownerUserId: string | null; ownerName: string | null;
  contacts: Ref[]; influencers: InfluencerRef[];
  createdAt: string; updatedAt: string;
}
interface LookupItem { label: string; value: string; isActive?: boolean; }
interface Tender {
  id: string; tenderNumber: string; tenderTitle: string | null;
  referenceNumber: string | null; publishingAuthority: string | null; publishingDepartment: string | null;
  tenderType: string; tenderCategory: string | null; procurementMode: string | null;
  portalName: string | null; portalTenderId: string | null; portalUrl: string | null;
  estimatedValuePaise: number | null; emdAmountPaise: number | null; emdMode: string | null;
  tenderFeePaise: number | null; documentCostPaise: number | null;
  publishDate: string | null; preBidMeetingDate: string | null; clarificationDeadline: string | null;
  submissionDeadlineOnline: string | null; submissionDeadlinePhysical: string | null;
  technicalOpeningDate: string | null; financialOpeningDate: string | null;
  bidValidityDays: number | null; completionPeriodDays: number | null; projectLocation: string | null;
  eligibilityCriteria: string | null; turnoverRequirementPaise: number | null;
  experienceYears: number | null; similarWorkValuePaise: number | null;
  tenderStatus: string; notes: string | null; corrigendumDetails: string | null;
}

interface CosEntry {
  id: string; opportunityId: string; category: string; entryDate: string;
  description: string; amountPaise: number; status: string;
  receiptRef: string | null; createdAt: string; updatedAt: string;
}
interface CosSummary {
  byCategory: Record<string, number>;
  byStatus: Record<string, number>;
  grandTotal: number;
}

const COS_CATEGORIES = [
  { label: 'Travel', value: 'TRAVEL' },
  { label: 'Accommodation', value: 'ACCOMMODATION' },
  { label: 'Demo / Presentation', value: 'DEMO_PRESENTATION' },
  { label: 'Consulting', value: 'CONSULTING' },
  { label: 'Documentation', value: 'DOCUMENTATION' },
  { label: 'Stationery / Printing', value: 'STATIONERY_PRINTING' },
  { label: 'Communication', value: 'COMMUNICATION' },
  { label: 'Other', value: 'OTHER' },
];

const COS_STATUSES = [
  { label: 'Spent', value: 'SPENT' },
  { label: 'Committed', value: 'COMMITTED' },
  { label: 'Projected', value: 'PROJECTED' },
];

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(COS_CATEGORIES.map((c) => [c.value, c.label]));

@Component({
  selector: 'app-opportunity-detail',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, ButtonModule, InputTextModule, SelectModule, MultiSelectModule, InputNumberModule, TagModule, DialogModule, ToastModule, ConfirmDialogModule, TabsModule, TableModule, DatePickerModule, TextareaModule, ToggleSwitchModule, ActivityPanelComponent],
  providers: [MessageService, ConfirmationService],
  template: `
    <p-toast /><p-confirmDialog />

    @if (loading()) {
      <div class="flex items-center gap-2 text-gray-500 py-12 justify-center"><i class="pi pi-spin pi-spinner text-2xl"></i> Loading...</div>
    } @else if (!opp()) {
      <div class="text-center py-12 text-gray-500">Opportunity not found</div>
    } @else {
      <div class="flex items-center justify-between mb-6">
        <div>
          <div class="flex items-center gap-3">
            <p-button icon="pi pi-arrow-left" [text]="true" [rounded]="true" (onClick)="goBack()" />
            <h2 class="text-2xl font-semibold text-gray-800">{{ opp()!.title }}</h2>
            <p-tag [value]="opp()!.stage" [severity]="stageSeverity(opp()!.stage)" />
            @if (opp()!.closedStatus) {
              <p-tag [value]="opp()!.closedStatus!" severity="danger" />
            }
          </div>
          <p class="text-sm text-gray-500 mt-1 ml-12">{{ opp()!.entryPath }} &middot; Created {{ opp()!.createdAt | date:'mediumDate' }}
            @if (opp()!.ownerName) { &middot; Owner: {{ opp()!.ownerName }} }
          </p>
        </div>
      </div>

      <form [formGroup]="form" (ngSubmit)="onSave()">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <!-- Left: Core -->
          <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 class="text-lg font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <i class="pi pi-star text-blue-600"></i> Opportunity Details
            </h3>
            <div class="flex flex-col gap-4">
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Title *</label>
                <input pInputText formControlName="title" class="w-full" />
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Stage</label>
                  <p-select appendTo="body" formControlName="stage" [options]="stageOptions()" optionLabel="label" optionValue="value" class="w-full" />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Entry Path</label>
                  <p-select appendTo="body" formControlName="entryPath" [options]="entryPathOptions()" optionLabel="label" optionValue="value" class="w-full" />
                </div>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Closed Status</label>
                <p-select appendTo="body" formControlName="closedStatus" [options]="closedStatusOptions" optionLabel="label" optionValue="value" [showClear]="true" placeholder="Open (active)" class="w-full" />
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Contract Value (₹)</label>
                  <p-inputNumber formControlName="contractValueRupees" mode="currency" currency="INR" locale="en-IN" class="w-full" />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Probability %</label>
                  <p-inputNumber formControlName="probabilityPct" [min]="0" [max]="100" suffix="%" class="w-full" />
                </div>
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Business Unit *</label>
                  <p-select appendTo="body" formControlName="businessUnitId" [options]="buOptions()" optionLabel="name" optionValue="id" [filter]="true" class="w-full" />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium text-gray-700">Owner</label>
                  <p-select appendTo="body" formControlName="ownerUserId" [options]="userOptions()" optionLabel="name" optionValue="id" [filter]="true" [showClear]="true" placeholder="Select owner" class="w-full" />
                </div>
              </div>
            </div>
          </div>

          <!-- Right: Relationships -->
          <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 class="text-lg font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <i class="pi pi-link text-green-600"></i> Relationships
            </h3>
            <div class="flex flex-col gap-4">
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Account</label>
                <p-select appendTo="body" formControlName="accountId" [options]="accountOptions()" optionLabel="name" optionValue="id" [filter]="true" [showClear]="true" placeholder="Select account" class="w-full" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">End Client</label>
                <p-select appendTo="body" formControlName="endClientAccountId" [options]="accountOptions()" optionLabel="name" optionValue="id" [filter]="true" [showClear]="true" placeholder="Select end client" class="w-full" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Contacts</label>
                <p-multiSelect appendTo="body" formControlName="contactIds" [options]="contactOptions()" optionLabel="name" optionValue="id" placeholder="Select contacts" display="chip" class="w-full" />
              </div>

              <!-- Influencers -->
              <div class="border-t pt-3 mt-1">
                <div class="flex items-center justify-between mb-2">
                  <label class="text-sm font-semibold text-gray-700">Influencers</label>
                  <p-button icon="pi pi-user-plus" size="small" [text]="true" (onClick)="linkDialogVisible=true" />
                </div>
                <div class="flex flex-wrap gap-2">
                  @for (inf of opp()!.influencers; track inf.id) {
                    <div class="flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-full px-3 py-1 text-sm">
                      <span>{{ inf.name }}</span>
                      @if (inf.rating) { <span class="text-amber-600">★{{ inf.rating }}</span> }
                      <button type="button" class="text-red-400 hover:text-red-600 ml-1" (click)="unlinkInfluencer(inf.id)">×</button>
                    </div>
                  }
                  @if (opp()!.influencers.length === 0) {
                    <span class="text-sm text-gray-400">None linked</span>
                  }
                </div>
              </div>
            </div>
          </div>
        </div>

        @if (serverError) {
          <div class="p-3 mb-4 bg-red-50 border border-red-200 rounded text-sm text-red-700">{{ serverError }}</div>
        }

        <div class="flex justify-end gap-2 mb-6">
          <p-button label="Cancel" severity="secondary" [outlined]="true" (onClick)="goBack()" />
          <p-button label="Save Changes" type="submit" icon="pi pi-save" [loading]="saving" [disabled]="form.pristine || form.invalid || saving" />
        </div>
        <!-- Tender Released Toggle -->
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div class="flex items-center gap-4">
            <p-toggleSwitch [(ngModel)]="tenderReleased" (onChange)="onTenderToggle($event)" />
            <div>
              <span class="font-semibold text-gray-700">Tender Released</span>
              <p class="text-xs text-gray-500">Enable to add tender/RFP details for this opportunity</p>
            </div>
          </div>
        </div>
      </form>

      <!-- Tender Details Section -->
      @if (tenderReleased && opp()) {
        <div class="bg-white rounded-lg shadow-sm border border-orange-200 p-6 mb-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-gray-700 flex items-center gap-2">
              <i class="pi pi-file-edit text-orange-600"></i> Tender Details
            </h3>
            @if (!tender()) {
              <p-button label="Add Tender" icon="pi pi-plus" size="small" (onClick)="openTenderDialog()" />
            } @else {
              <p-button label="Edit Tender" icon="pi pi-pencil" size="small" severity="info" [outlined]="true" (onClick)="openTenderDialog()" />
            }
          </div>

          @if (tender(); as t) {
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <!-- Identity -->
              <div>
                <h4 class="text-sm font-semibold text-gray-500 uppercase mb-3">Tender Identity</h4>
                <div class="space-y-2 text-sm">
                  <div><span class="text-gray-500">Number:</span> <span class="font-medium">{{ t.tenderNumber }}</span></div>
                  @if (t.tenderTitle) { <div><span class="text-gray-500">Title:</span> {{ t.tenderTitle }}</div> }
                  @if (t.referenceNumber) { <div><span class="text-gray-500">Ref No:</span> {{ t.referenceNumber }}</div> }
                  @if (t.publishingAuthority) { <div><span class="text-gray-500">Authority:</span> {{ t.publishingAuthority }}</div> }
                  @if (t.publishingDepartment) { <div><span class="text-gray-500">Department:</span> {{ t.publishingDepartment }}</div> }
                  <div class="flex gap-2 mt-2">
                    <p-tag [value]="t.tenderType" severity="info" [style]="{'font-size':'0.7rem'}" />
                    @if (t.tenderCategory) { <p-tag [value]="t.tenderCategory" severity="secondary" [style]="{'font-size':'0.7rem'}" /> }
                    @if (t.procurementMode) { <p-tag [value]="t.procurementMode" severity="warn" [style]="{'font-size':'0.7rem'}" /> }
                  </div>
                  @if (t.portalName) {
                    <div class="mt-2"><span class="text-gray-500">Portal:</span> {{ t.portalName }}
                      @if (t.portalTenderId) { <span class="text-gray-400"> ({{ t.portalTenderId }})</span> }
                    </div>
                  }
                  @if (t.portalUrl) { <div><a [href]="t.portalUrl" target="_blank" class="text-blue-600 hover:underline text-xs">View on portal →</a></div> }
                  <div class="mt-2"><p-tag [value]="t.tenderStatus" [severity]="tenderStatusSeverity(t.tenderStatus)" /></div>
                </div>
              </div>

              <!-- Financial -->
              <div>
                <h4 class="text-sm font-semibold text-gray-500 uppercase mb-3">Financial</h4>
                <div class="space-y-2 text-sm">
                  @if (t.estimatedValuePaise) { <div><span class="text-gray-500">Estimated Value:</span> <span class="font-medium">₹{{ formatRupees(t.estimatedValuePaise) }}</span></div> }
                  @if (t.emdAmountPaise) { <div><span class="text-gray-500">EMD:</span> ₹{{ formatRupees(t.emdAmountPaise) }} @if (t.emdMode) { <span class="text-gray-400">({{ t.emdMode }})</span> }</div> }
                  @if (t.tenderFeePaise) { <div><span class="text-gray-500">Tender Fee:</span> ₹{{ formatRupees(t.tenderFeePaise) }}</div> }
                  @if (t.documentCostPaise) { <div><span class="text-gray-500">Document Cost:</span> ₹{{ formatRupees(t.documentCostPaise) }}</div> }
                </div>

                <h4 class="text-sm font-semibold text-gray-500 uppercase mb-3 mt-6">Eligibility</h4>
                <div class="space-y-2 text-sm">
                  @if (t.turnoverRequirementPaise) { <div><span class="text-gray-500">Min Turnover:</span> ₹{{ formatRupees(t.turnoverRequirementPaise) }}</div> }
                  @if (t.experienceYears) { <div><span class="text-gray-500">Min Experience:</span> {{ t.experienceYears }} years</div> }
                  @if (t.similarWorkValuePaise) { <div><span class="text-gray-500">Similar Work Value:</span> ₹{{ formatRupees(t.similarWorkValuePaise) }}</div> }
                  @if (t.eligibilityCriteria) { <div class="mt-2 text-xs text-gray-600 bg-gray-50 p-2 rounded">{{ t.eligibilityCriteria }}</div> }
                </div>
              </div>

              <!-- Dates & Terms -->
              <div>
                <h4 class="text-sm font-semibold text-gray-500 uppercase mb-3">Key Dates</h4>
                <div class="space-y-2 text-sm">
                  @if (t.publishDate) { <div><span class="text-gray-500">Published:</span> {{ t.publishDate | date:'mediumDate' }}</div> }
                  @if (t.preBidMeetingDate) { <div><span class="text-gray-500">Pre-Bid Meeting:</span> {{ t.preBidMeetingDate | date:'medium' }}</div> }
                  @if (t.clarificationDeadline) { <div><span class="text-gray-500">Clarification Due:</span> {{ t.clarificationDeadline | date:'medium' }}</div> }
                  @if (t.submissionDeadlineOnline) { <div><span class="text-gray-500">Submit (Online):</span> <span class="font-medium text-red-600">{{ t.submissionDeadlineOnline | date:'medium' }}</span></div> }
                  @if (t.submissionDeadlinePhysical) { <div><span class="text-gray-500">Submit (Physical):</span> {{ t.submissionDeadlinePhysical | date:'medium' }}</div> }
                  @if (t.technicalOpeningDate) { <div><span class="text-gray-500">Tech Opening:</span> {{ t.technicalOpeningDate | date:'medium' }}</div> }
                  @if (t.financialOpeningDate) { <div><span class="text-gray-500">Fin Opening:</span> {{ t.financialOpeningDate | date:'medium' }}</div> }
                </div>

                <h4 class="text-sm font-semibold text-gray-500 uppercase mb-3 mt-6">Terms</h4>
                <div class="space-y-2 text-sm">
                  @if (t.bidValidityDays) { <div><span class="text-gray-500">Bid Validity:</span> {{ t.bidValidityDays }} days</div> }
                  @if (t.completionPeriodDays) { <div><span class="text-gray-500">Completion Period:</span> {{ t.completionPeriodDays }} days</div> }
                  @if (t.projectLocation) { <div><span class="text-gray-500">Location:</span> {{ t.projectLocation }}</div> }
                </div>
              </div>
            </div>

            @if (t.notes) {
              <div class="mt-4 p-3 bg-gray-50 rounded text-sm"><strong>Notes:</strong> {{ t.notes }}</div>
            }
            @if (t.corrigendumDetails) {
              <div class="mt-2 p-3 bg-amber-50 border border-amber-200 rounded text-sm"><strong>Corrigendum:</strong> {{ t.corrigendumDetails }}</div>
            }
          } @else {
            <div class="text-center text-gray-400 py-8">
              <i class="pi pi-file-edit text-4xl mb-2 block"></i>
              <p>No tender details added yet. Click "Add Tender" to enter RFP/NIT details.</p>
            </div>
          }
        </div>
      }

      <!-- Tender Dialog -->
      <p-dialog [header]="tender() ? 'Edit Tender' : 'Add Tender'" [(visible)]="tenderDialogVisible" [modal]="true" [style]="{width:'800px'}" [dismissableMask]="true">
        <form [formGroup]="tenderForm" class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <!-- Identity -->
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Tender/NIT Number *</label>
            <input pInputText formControlName="tenderNumber" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Tender Title</label>
            <input pInputText formControlName="tenderTitle" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Reference Number</label>
            <input pInputText formControlName="referenceNumber" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Publishing Authority</label>
            <input pInputText formControlName="publishingAuthority" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Department</label>
            <input pInputText formControlName="publishingDepartment" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Tender Type *</label>
            <p-select appendTo="body" formControlName="tenderType" [options]="tenderTypeOptions" optionLabel="label" optionValue="value" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Category</label>
            <p-select appendTo="body" formControlName="tenderCategory" [options]="tenderCategoryOptions" optionLabel="label" optionValue="value" [showClear]="true" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Procurement Mode</label>
            <p-select appendTo="body" formControlName="procurementMode" [options]="procurementModeOptions" optionLabel="label" optionValue="value" [showClear]="true" class="w-full" />
          </div>

          <!-- Portal -->
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Portal</label>
            <p-select appendTo="body" formControlName="portalName" [options]="portalOptions" optionLabel="label" optionValue="value" [showClear]="true" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Portal Tender ID</label>
            <input pInputText formControlName="portalTenderId" class="w-full" />
          </div>
          <div class="flex flex-col gap-1 md:col-span-2">
            <label class="text-sm font-medium text-gray-700">Portal URL</label>
            <input pInputText formControlName="portalUrl" class="w-full" />
          </div>

          <!-- Financial -->
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Estimated Value (₹)</label>
            <p-inputNumber formControlName="estimatedValueRupees" mode="currency" currency="INR" locale="en-IN" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">EMD Amount (₹)</label>
            <p-inputNumber formControlName="emdAmountRupees" mode="currency" currency="INR" locale="en-IN" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">EMD Mode</label>
            <p-select appendTo="body" formControlName="emdMode" [options]="emdModeOptions" optionLabel="label" optionValue="value" [showClear]="true" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Tender Fee (₹)</label>
            <p-inputNumber formControlName="tenderFeeRupees" mode="currency" currency="INR" locale="en-IN" class="w-full" />
          </div>

          <!-- Dates -->
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Publish Date</label>
            <p-datePicker appendTo="body" formControlName="publishDate" dateFormat="dd-M-yy" [showIcon]="true" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Pre-Bid Meeting</label>
            <p-datePicker appendTo="body" formControlName="preBidMeetingDate" dateFormat="dd-M-yy" [showTime]="true" [showIcon]="true" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Submission Deadline (Online)</label>
            <p-datePicker appendTo="body" formControlName="submissionDeadlineOnline" dateFormat="dd-M-yy" [showTime]="true" [showIcon]="true" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Submission Deadline (Physical)</label>
            <p-datePicker appendTo="body" formControlName="submissionDeadlinePhysical" dateFormat="dd-M-yy" [showTime]="true" [showIcon]="true" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Technical Opening</label>
            <p-datePicker appendTo="body" formControlName="technicalOpeningDate" dateFormat="dd-M-yy" [showTime]="true" [showIcon]="true" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Financial Opening</label>
            <p-datePicker appendTo="body" formControlName="financialOpeningDate" dateFormat="dd-M-yy" [showTime]="true" [showIcon]="true" class="w-full" />
          </div>

          <!-- Terms -->
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Bid Validity (days)</label>
            <p-inputNumber formControlName="bidValidityDays" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Completion Period (days)</label>
            <p-inputNumber formControlName="completionPeriodDays" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Project Location</label>
            <input pInputText formControlName="projectLocation" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Tender Status</label>
            <p-select appendTo="body" formControlName="tenderStatus" [options]="tenderStatusOptions" optionLabel="label" optionValue="value" class="w-full" />
          </div>

          <!-- Eligibility -->
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Min Annual Turnover (₹)</label>
            <p-inputNumber formControlName="turnoverRequirementRupees" mode="currency" currency="INR" locale="en-IN" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Min Experience (years)</label>
            <p-inputNumber formControlName="experienceYears" class="w-full" />
          </div>
          <div class="flex flex-col gap-1 md:col-span-2">
            <label class="text-sm font-medium text-gray-700">Eligibility Criteria</label>
            <textarea pTextarea formControlName="eligibilityCriteria" [autoResize]="true" [rows]="3" class="w-full"></textarea>
          </div>
          <div class="flex flex-col gap-1 md:col-span-2">
            <label class="text-sm font-medium text-gray-700">Notes</label>
            <textarea pTextarea formControlName="notes" [autoResize]="true" [rows]="2" class="w-full"></textarea>
          </div>
          <div class="flex flex-col gap-1 md:col-span-2">
            <label class="text-sm font-medium text-gray-700">Corrigendum Details</label>
            <textarea pTextarea formControlName="corrigendumDetails" [autoResize]="true" [rows]="2" class="w-full"></textarea>
          </div>
        </form>

        @if (tenderServerError) {
          <div class="text-red-600 text-sm mt-2">{{ tenderServerError }}</div>
        }

        <ng-template pTemplate="footer">
          <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="tenderDialogVisible=false" />
          <p-button [label]="tender() ? 'Update' : 'Create'" icon="pi pi-check" (onClick)="saveTender()" [disabled]="tenderForm.invalid || tenderSaving" [loading]="tenderSaving" />
        </ng-template>
      </p-dialog>

      <!-- Cost of Sale Section -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-gray-700 flex items-center gap-2">
            <i class="pi pi-wallet text-purple-600"></i> Cost of Sale
          </h3>
          <p-button label="Add Cost Entry" icon="pi pi-plus" size="small" (onClick)="openCosDialog()" />
        </div>

        <!-- Summary Cards -->
        @if (cosSummary()) {
          <div class="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
            <div class="bg-green-50 rounded-lg p-3 border border-green-200">
              <div class="text-xs text-green-600 font-medium">Spent</div>
              <div class="text-lg font-bold text-green-800">{{ formatRupees(cosSummary()!.byStatus['SPENT'] || 0) }}</div>
            </div>
            <div class="bg-yellow-50 rounded-lg p-3 border border-yellow-200">
              <div class="text-xs text-yellow-600 font-medium">Committed</div>
              <div class="text-lg font-bold text-yellow-800">{{ formatRupees(cosSummary()!.byStatus['COMMITTED'] || 0) }}</div>
            </div>
            <div class="bg-blue-50 rounded-lg p-3 border border-blue-200">
              <div class="text-xs text-blue-600 font-medium">Projected</div>
              <div class="text-lg font-bold text-blue-800">{{ formatRupees(cosSummary()!.byStatus['PROJECTED'] || 0) }}</div>
            </div>
            <div class="bg-purple-50 rounded-lg p-3 border border-purple-200">
              <div class="text-xs text-purple-600 font-medium">Grand Total</div>
              <div class="text-lg font-bold text-purple-800">{{ formatRupees(cosSummary()!.grandTotal) }}</div>
            </div>
            <div class="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <div class="text-xs text-gray-500 font-medium">Contract Value</div>
              <div class="text-lg font-bold text-gray-800">{{ formatRupees(opp()!.contractValuePaise || 0) }}</div>
            </div>
          </div>
        }

        <!-- Entries Table -->
        <p-table [value]="cosEntries()" styleClass="p-datatable-sm" [rows]="20">
          <ng-template pTemplate="header">
            <tr>
              <th>Date</th><th>Category</th><th>Description</th><th class="text-right">Amount (₹)</th><th>Status</th><th style="width:100px">Actions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-entry>
            <tr>
              <td>{{ entry.entryDate | date:'mediumDate' }}</td>
              <td>{{ categoryLabel(entry.category) }}</td>
              <td>{{ entry.description }}</td>
              <td class="text-right font-medium">{{ formatRupees(entry.amountPaise) }}</td>
              <td><p-tag [value]="entry.status" [severity]="cosStatusSeverity(entry.status)" /></td>
              <td>
                <div class="flex gap-1">
                  <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small" (onClick)="openCosDialog(entry)" />
                  <p-button icon="pi pi-trash" [text]="true" [rounded]="true" size="small" severity="danger" (onClick)="deleteCosEntry(entry.id)" />
                </div>
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td colspan="6" class="text-center text-gray-400 py-4">No cost entries yet</td></tr>
          </ng-template>
        </p-table>
      </div>

      <!-- Activities Panel -->
      <div class="mt-6">
        <app-activity-panel entityType="OPPORTUNITY" [entityId]="opp()!.id" />
      </div>

      <!-- Link Influencer Dialog -->
      <p-dialog header="Link Influencer" [(visible)]="linkDialogVisible" [modal]="true" [style]="{width:'400px'}">
        <div class="flex flex-col gap-3 pt-2">
          <p-select appendTo="body" [(ngModel)]="selectedInfluencerId" [options]="influencerOptions()" optionLabel="name" optionValue="id"
                    [filter]="true" filterBy="name" placeholder="Select influencer" class="w-full" />
        </div>
        <ng-template pTemplate="footer">
          <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="linkDialogVisible=false" />
          <p-button label="Link" icon="pi pi-link" [disabled]="!selectedInfluencerId" (onClick)="linkInfluencer()" />
        </ng-template>
      </p-dialog>

      <!-- Cost of Sale Entry Dialog -->
      <p-dialog [header]="cosEditId ? 'Edit Cost Entry' : 'Add Cost Entry'" [(visible)]="cosDialogVisible" [modal]="true" [style]="{width:'500px'}">
        <form [formGroup]="cosForm" class="flex flex-col gap-4 pt-2">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Category *</label>
            <p-select appendTo="body" formControlName="category" [options]="cosCategories" optionLabel="label" optionValue="value" class="w-full" />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Date *</label>
              <p-datepicker appendTo="body" formControlName="entryDate" dateFormat="yy-mm-dd" class="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Status</label>
              <p-select appendTo="body" formControlName="status" [options]="cosStatuses" optionLabel="label" optionValue="value" class="w-full" />
            </div>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Amount (₹) *</label>
            <p-inputNumber formControlName="amountRupees" mode="currency" currency="INR" locale="en-IN" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Description *</label>
            <textarea pTextarea formControlName="description" [rows]="2" class="w-full"></textarea>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Receipt Ref</label>
            <input pInputText formControlName="receiptRef" class="w-full" />
          </div>
        </form>
        <ng-template pTemplate="footer">
          <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="cosDialogVisible=false" />
          <p-button [label]="cosEditId ? 'Update' : 'Add'" icon="pi pi-check" [disabled]="cosForm.invalid" (onClick)="saveCosEntry()" />
        </ng-template>
      </p-dialog>
    }
  `,
})
export class OpportunityDetailComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly msg = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  opp = signal<Opportunity | null>(null);
  loading = signal(true);
  saving = false;
  serverError = '';

  buOptions = signal<Ref[]>([]);
  accountOptions = signal<Ref[]>([]);
  contactOptions = signal<Ref[]>([]);
  userOptions = signal<Ref[]>([]);
  influencerOptions = signal<Ref[]>([]);
  stageOptions = signal<LookupItem[]>([]);
  entryPathOptions = signal<LookupItem[]>([]);
  closedStatusOptions = [
    { label: 'Won', value: 'WON' },
    { label: 'Lost', value: 'LOST' },
    { label: 'Cancelled', value: 'CANCELLED' },
    { label: 'On Hold', value: 'ON_HOLD' },
  ];
  linkDialogVisible = false;
  selectedInfluencerId = '';

  // Tender
  tender = signal<Tender | null>(null);
  tenderReleased = false;
  tenderDialogVisible = false;
  tenderSaving = false;
  tenderServerError = '';

  tenderTypeOptions = [
    { label: 'Open', value: 'OPEN' }, { label: 'Limited', value: 'LIMITED' },
    { label: 'Single Source', value: 'SINGLE_SOURCE' }, { label: 'EOI', value: 'EOI' },
    { label: 'Reverse Auction', value: 'REVERSE_AUCTION' },
  ];
  tenderCategoryOptions = [
    { label: 'Works', value: 'WORKS' }, { label: 'Goods', value: 'GOODS' },
    { label: 'Services', value: 'SERVICES' }, { label: 'Consultancy', value: 'CONSULTANCY' },
  ];
  procurementModeOptions = [
    { label: 'ICB', value: 'ICB' }, { label: 'NCB', value: 'NCB' },
    { label: 'Shopping', value: 'SHOPPING' }, { label: 'Direct', value: 'DIRECT' },
  ];
  portalOptions = [
    { label: 'GeM', value: 'GeM' }, { label: 'CPPP', value: 'CPPP' },
    { label: 'State Portal', value: 'STATE_PORTAL' }, { label: 'Department Website', value: 'DEPARTMENT' },
    { label: 'Other', value: 'OTHER' },
  ];
  emdModeOptions = [
    { label: 'Bank Guarantee', value: 'BG' }, { label: 'Demand Draft', value: 'DD' },
    { label: 'FDR', value: 'FDR' }, { label: 'Online', value: 'ONLINE' },
    { label: 'Exempted', value: 'EXEMPTED' },
  ];
  tenderStatusOptions = [
    { label: 'Published', value: 'PUBLISHED' }, { label: 'Corrigendum', value: 'CORRIGENDUM' },
    { label: 'Pre-Bid Done', value: 'PREBID_DONE' }, { label: 'Submission Closed', value: 'SUBMISSION_CLOSED' },
    { label: 'Tech Opened', value: 'TECH_OPENED' }, { label: 'Fin Opened', value: 'FIN_OPENED' },
    { label: 'Awarded', value: 'AWARDED' }, { label: 'Cancelled', value: 'CANCELLED' },
  ];

  tenderForm = this.fb.group({
    tenderNumber: ['', Validators.required],
    tenderTitle: [''],
    referenceNumber: [''],
    publishingAuthority: [''],
    publishingDepartment: [''],
    tenderType: ['OPEN', Validators.required],
    tenderCategory: [null as string | null],
    procurementMode: [null as string | null],
    portalName: [null as string | null],
    portalTenderId: [''],
    portalUrl: [''],
    estimatedValueRupees: [null as number | null],
    emdAmountRupees: [null as number | null],
    emdMode: [null as string | null],
    tenderFeeRupees: [null as number | null],
    publishDate: [null as Date | null],
    preBidMeetingDate: [null as Date | null],
    clarificationDeadline: [null as Date | null],
    submissionDeadlineOnline: [null as Date | null],
    submissionDeadlinePhysical: [null as Date | null],
    technicalOpeningDate: [null as Date | null],
    financialOpeningDate: [null as Date | null],
    bidValidityDays: [null as number | null],
    completionPeriodDays: [null as number | null],
    projectLocation: [''],
    eligibilityCriteria: [''],
    turnoverRequirementRupees: [null as number | null],
    experienceYears: [null as number | null],
    notes: [''],
    corrigendumDetails: [''],
    tenderStatus: ['PUBLISHED'],
  });

  // Cost of Sale
  cosEntries = signal<CosEntry[]>([]);
  cosSummary = signal<CosSummary | null>(null);
  cosDialogVisible = false;
  cosEditId: string | null = null;
  cosCategories = COS_CATEGORIES;
  cosStatuses = COS_STATUSES;

  form = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(255)]],
    stage: [''],
    entryPath: [''],
    closedStatus: [null as string | null],
    contractValueRupees: [null as number | null],
    probabilityPct: [null as number | null],
    businessUnitId: ['', Validators.required],
    ownerUserId: [''],
    accountId: [''],
    endClientAccountId: [''],
    contactIds: [[] as string[]],
  });

  cosForm = this.fb.group({
    category: ['', Validators.required],
    entryDate: [null as Date | null, Validators.required],
    amountRupees: [null as number | null, [Validators.required, Validators.min(0)]],
    status: ['SPENT', Validators.required],
    description: ['', [Validators.required, Validators.maxLength(500)]],
    receiptRef: [''],
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.loadOpp(id);
    this.loadOptions();
  }

  private loadOpp(id: string): void {
    this.loading.set(true);
    this.http.get<{ data: Opportunity }>(`${environment.apiBaseUrl}/opportunities/${id}`).subscribe({
      next: (r) => {
        this.opp.set(r.data);
        this.form.patchValue({
          title: r.data.title, stage: r.data.stage, entryPath: r.data.entryPath, closedStatus: r.data.closedStatus,
          contractValueRupees: r.data.contractValuePaise ? r.data.contractValuePaise / 100 : null,
          probabilityPct: r.data.probabilityPct,
          businessUnitId: r.data.businessUnitId,
          ownerUserId: r.data.ownerUserId ?? '',
          accountId: r.data.accountId ?? '', endClientAccountId: r.data.endClientAccountId ?? '',
          contactIds: r.data.contacts.map((c) => c.id),
        });
        this.form.markAsPristine();
        this.tenderReleased = r.data.tenderReleased;
        if (this.tenderReleased) this.loadTender();
        this.loading.set(false);
        this.loadCostOfSale(id);
      },
      error: () => { this.opp.set(null); this.loading.set(false); },
    });
  }

  private loadOptions(): void {
    this.http.get<{ data: Ref[] }>(`${environment.apiBaseUrl}/business-units?limit=200`).subscribe({ next: (r) => this.buOptions.set(r.data) });
    this.http.get<{ data: Ref[] }>(`${environment.apiBaseUrl}/accounts?limit=200`).subscribe({ next: (r) => this.accountOptions.set(r.data) });
    this.http.get<{ data: Array<{ id: string; firstName: string; lastName: string | null }> }>(`${environment.apiBaseUrl}/contacts?limit=200`).subscribe({
      next: (r) => this.contactOptions.set(r.data.map((c) => ({ id: c.id, name: `${c.firstName}${c.lastName ? ' ' + c.lastName : ''}` }))),
    });
    this.http.get<{ data: Array<{ id: string; fullName: string }> }>(`${environment.apiBaseUrl}/users?limit=200`).subscribe({
      next: (r) => this.userOptions.set(r.data.map((u) => ({ id: u.id, name: u.fullName }))),
    });
    this.http.get<{ data: Ref[] }>(`${environment.apiBaseUrl}/influencers?limit=200`).subscribe({ next: (r) => this.influencerOptions.set(r.data) });
    this.http.get<{ data: LookupItem[] }>(`${environment.apiBaseUrl}/lookup-lists/by-code/opportunity_stage/items`).subscribe({
      next: (r) => this.stageOptions.set(r.data.filter((i) => i.isActive !== false)),
      error: () => {},
    });
    this.http.get<{ data: LookupItem[] }>(`${environment.apiBaseUrl}/lookup-lists/by-code/entry_path/items`).subscribe({
      next: (r) => this.entryPathOptions.set(r.data.filter((i) => i.isActive !== false)),
      error: () => {},
    });
  }

  // ---- Tender ----

  private loadTender(): void {
    const id = this.opp()?.id;
    if (!id) return;
    this.http.get<{ data: Tender | null }>(`${environment.apiBaseUrl}/opportunities/${id}/tender`).subscribe({
      next: (r) => this.tender.set(r.data),
    });
  }

  onTenderToggle(event: { checked: boolean }): void {
    const id = this.opp()?.id;
    if (!id) return;
    this.http.patch(`${environment.apiBaseUrl}/opportunities/${id}`, { tenderReleased: event.checked }).subscribe({
      next: () => {
        if (event.checked) this.loadTender();
      },
    });
  }

  openTenderDialog(): void {
    this.tenderServerError = '';
    const t = this.tender();
    if (t) {
      this.tenderForm.patchValue({
        tenderNumber: t.tenderNumber, tenderTitle: t.tenderTitle ?? '',
        referenceNumber: t.referenceNumber ?? '', publishingAuthority: t.publishingAuthority ?? '',
        publishingDepartment: t.publishingDepartment ?? '', tenderType: t.tenderType,
        tenderCategory: t.tenderCategory, procurementMode: t.procurementMode,
        portalName: t.portalName, portalTenderId: t.portalTenderId ?? '', portalUrl: t.portalUrl ?? '',
        estimatedValueRupees: t.estimatedValuePaise ? t.estimatedValuePaise / 100 : null,
        emdAmountRupees: t.emdAmountPaise ? t.emdAmountPaise / 100 : null,
        emdMode: t.emdMode, tenderFeeRupees: t.tenderFeePaise ? t.tenderFeePaise / 100 : null,
        publishDate: t.publishDate ? new Date(t.publishDate) : null,
        preBidMeetingDate: t.preBidMeetingDate ? new Date(t.preBidMeetingDate) : null,
        clarificationDeadline: t.clarificationDeadline ? new Date(t.clarificationDeadline) : null,
        submissionDeadlineOnline: t.submissionDeadlineOnline ? new Date(t.submissionDeadlineOnline) : null,
        submissionDeadlinePhysical: t.submissionDeadlinePhysical ? new Date(t.submissionDeadlinePhysical) : null,
        technicalOpeningDate: t.technicalOpeningDate ? new Date(t.technicalOpeningDate) : null,
        financialOpeningDate: t.financialOpeningDate ? new Date(t.financialOpeningDate) : null,
        bidValidityDays: t.bidValidityDays, completionPeriodDays: t.completionPeriodDays,
        projectLocation: t.projectLocation ?? '', eligibilityCriteria: t.eligibilityCriteria ?? '',
        turnoverRequirementRupees: t.turnoverRequirementPaise ? t.turnoverRequirementPaise / 100 : null,
        experienceYears: t.experienceYears, notes: t.notes ?? '', corrigendumDetails: t.corrigendumDetails ?? '',
        tenderStatus: t.tenderStatus,
      });
    } else {
      this.tenderForm.reset({ tenderType: 'OPEN', tenderStatus: 'PUBLISHED' });
    }
    this.tenderDialogVisible = true;
  }

  saveTender(): void {
    if (this.tenderForm.invalid) return;
    this.tenderSaving = true;
    this.tenderServerError = '';
    const v = this.tenderForm.getRawValue();
    const id = this.opp()!.id;

    const body: Record<string, unknown> = {
      tenderNumber: v.tenderNumber, tenderTitle: v.tenderTitle || null,
      referenceNumber: v.referenceNumber || null, publishingAuthority: v.publishingAuthority || null,
      publishingDepartment: v.publishingDepartment || null, tenderType: v.tenderType,
      tenderCategory: v.tenderCategory || null, procurementMode: v.procurementMode || null,
      portalName: v.portalName || null, portalTenderId: v.portalTenderId || null, portalUrl: v.portalUrl || null,
      estimatedValuePaise: v.estimatedValueRupees ? Math.round(v.estimatedValueRupees * 100) : null,
      emdAmountPaise: v.emdAmountRupees ? Math.round(v.emdAmountRupees * 100) : null,
      emdMode: v.emdMode || null,
      tenderFeePaise: v.tenderFeeRupees ? Math.round(v.tenderFeeRupees * 100) : null,
      publishDate: v.publishDate?.toISOString() ?? null,
      preBidMeetingDate: v.preBidMeetingDate?.toISOString() ?? null,
      clarificationDeadline: v.clarificationDeadline?.toISOString() ?? null,
      submissionDeadlineOnline: v.submissionDeadlineOnline?.toISOString() ?? null,
      submissionDeadlinePhysical: v.submissionDeadlinePhysical?.toISOString() ?? null,
      technicalOpeningDate: v.technicalOpeningDate?.toISOString() ?? null,
      financialOpeningDate: v.financialOpeningDate?.toISOString() ?? null,
      bidValidityDays: v.bidValidityDays, completionPeriodDays: v.completionPeriodDays,
      projectLocation: v.projectLocation || null, eligibilityCriteria: v.eligibilityCriteria || null,
      turnoverRequirementRupees: v.turnoverRequirementRupees ? Math.round(v.turnoverRequirementRupees * 100) : null,
      experienceYears: v.experienceYears, notes: v.notes || null, corrigendumDetails: v.corrigendumDetails || null,
      tenderStatus: v.tenderStatus,
    };
    // Fix: turnoverRequirement should be Paise
    body['turnoverRequirementPaise'] = body['turnoverRequirementRupees'];
    delete body['turnoverRequirementRupees'];

    const req$ = this.tender()
      ? this.http.patch<{ data: Tender }>(`${environment.apiBaseUrl}/opportunities/${id}/tender`, body)
      : this.http.post<{ data: Tender }>(`${environment.apiBaseUrl}/opportunities/${id}/tender`, body);

    req$.subscribe({
      next: (r) => {
        this.tenderSaving = false;
        this.tenderDialogVisible = false;
        this.tender.set(r.data);
        this.msg.add({ severity: 'success', summary: 'Saved', detail: 'Tender details saved' });
      },
      error: (err: HttpErrorResponse) => {
        this.tenderSaving = false;
        this.tenderServerError = err.error?.error?.message ?? 'Failed to save tender';
      },
    });
  }

  tenderStatusSeverity(status: string): 'info' | 'success' | 'warn' | 'danger' | 'secondary' {
    switch (status) {
      case 'PUBLISHED': return 'info';
      case 'CORRIGENDUM': return 'warn';
      case 'PREBID_DONE': return 'info';
      case 'SUBMISSION_CLOSED': return 'secondary';
      case 'TECH_OPENED': case 'FIN_OPENED': return 'warn';
      case 'AWARDED': return 'success';
      case 'CANCELLED': return 'danger';
      default: return 'info';
    }
  }

  formatRupees(paise: number): string {
    const r = paise / 100;
    if (r >= 10000000) return (r / 10000000).toFixed(2) + ' Cr';
    if (r >= 100000) return (r / 100000).toFixed(2) + ' L';
    return r.toLocaleString('en-IN');
  }

  // ---- Cost of Sale ----

  private loadCostOfSale(oppId: string): void {
    this.http.get<{ data: CosEntry[]; summary: CosSummary }>(`${environment.apiBaseUrl}/opportunities/${oppId}/cost-of-sale?limit=200`).subscribe({
      next: (r) => { this.cosEntries.set(r.data); this.cosSummary.set(r.summary); },
      error: () => {},
    });
  }

  openCosDialog(entry?: CosEntry): void {
    if (entry) {
      this.cosEditId = entry.id;
      this.cosForm.patchValue({
        category: entry.category,
        entryDate: new Date(entry.entryDate),
        amountRupees: entry.amountPaise / 100,
        status: entry.status,
        description: entry.description,
        receiptRef: entry.receiptRef ?? '',
      });
    } else {
      this.cosEditId = null;
      this.cosForm.reset({ status: 'SPENT' });
    }
    this.cosDialogVisible = true;
  }

  saveCosEntry(): void {
    if (this.cosForm.invalid || !this.opp()) return;
    const v = this.cosForm.value;
    const body: Record<string, unknown> = {
      category: v.category,
      entryDate: v.entryDate instanceof Date ? v.entryDate.toISOString().slice(0, 10) : v.entryDate,
      amountPaise: v.amountRupees != null ? Math.round(v.amountRupees * 100) : 0,
      status: v.status,
      description: v.description,
      receiptRef: v.receiptRef || undefined,
    };

    const url = `${environment.apiBaseUrl}/opportunities/${this.opp()!.id}/cost-of-sale`;
    const req$ = this.cosEditId
      ? this.http.patch(`${url}/${this.cosEditId}`, body)
      : this.http.post(url, body);

    req$.subscribe({
      next: () => {
        this.cosDialogVisible = false;
        this.loadCostOfSale(this.opp()!.id);
        this.msg.add({ severity: 'success', summary: 'Saved', detail: `Cost entry ${this.cosEditId ? 'updated' : 'added'}` });
      },
      error: (err: HttpErrorResponse) => this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed' }),
    });
  }

  deleteCosEntry(entryId: string): void {
    this.confirm.confirm({
      message: 'Delete this cost entry?',
      accept: () => {
        this.http.delete(`${environment.apiBaseUrl}/opportunities/${this.opp()!.id}/cost-of-sale/${entryId}`).subscribe({
          next: () => {
            this.loadCostOfSale(this.opp()!.id);
            this.msg.add({ severity: 'success', summary: 'Deleted' });
          },
        });
      },
    });
  }

  categoryLabel(code: string): string { return CATEGORY_LABELS[code] ?? code; }

  cosStatusSeverity(s: string): 'success' | 'warn' | 'info' {
    if (s === 'SPENT') return 'success';
    if (s === 'COMMITTED') return 'warn';
    return 'info';
  }

  // ---- Opportunity Save ----

  onSave(): void {
    if (this.form.invalid || !this.opp()) return;
    this.saving = true; this.serverError = '';
    const v = this.form.value;
    const body: Record<string, unknown> = {
      title: v.title, stage: v.stage, entryPath: v.entryPath, closedStatus: v.closedStatus || null,
      businessUnitId: v.businessUnitId,
      accountId: v.accountId || null,
      endClientAccountId: v.endClientAccountId || null,
      ownerUserId: v.ownerUserId || null,
      probabilityPct: v.probabilityPct,
      contactIds: v.contactIds,
    };
    if (v.contractValueRupees != null) body['contractValuePaise'] = Math.round(v.contractValueRupees * 100);
    else body['contractValuePaise'] = null;

    this.http.patch<{ data: Opportunity }>(`${environment.apiBaseUrl}/opportunities/${this.opp()!.id}`, body).subscribe({
      next: (r) => {
        this.saving = false; this.opp.set(r.data); this.form.markAsPristine();
        this.msg.add({ severity: 'success', summary: 'Saved', detail: 'Opportunity updated' });
      },
      error: (err: HttpErrorResponse) => { this.saving = false; this.serverError = err.error?.error?.message ?? 'Error'; },
    });
  }

  linkInfluencer(): void {
    if (!this.opp() || !this.selectedInfluencerId) return;
    this.http.post(`${environment.apiBaseUrl}/opportunities/${this.opp()!.id}/influencers`, { influencerId: this.selectedInfluencerId }).subscribe({
      next: () => { this.linkDialogVisible = false; this.selectedInfluencerId = ''; this.loadOpp(this.opp()!.id); },
      error: (err: HttpErrorResponse) => this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed' }),
    });
  }

  unlinkInfluencer(influencerId: string): void {
    this.http.delete(`${environment.apiBaseUrl}/opportunities/${this.opp()!.id}/influencers/${influencerId}`).subscribe({
      next: () => this.loadOpp(this.opp()!.id),
    });
  }

  goBack(): void { this.router.navigate(['/sales/opportunities']); }

  stageSeverity(s: string): 'info' | 'success' | 'warn' | 'danger' {
    const sl = s.toLowerCase();
    if (sl.includes('award')) return 'success';
    if (sl.includes('lost')) return 'danger';
    if (sl.includes('bid')) return 'warn';
    return 'info';
  }
}
