import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';
import { DatePickerModule } from 'primeng/datepicker';
import { TextareaModule } from 'primeng/textarea';
import { FileUploadModule } from 'primeng/fileupload';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';
import { environment } from '../../../environments/environment';

interface TenderDoc {
  id: string; tenderId: string; name: string; docType: string;
  fileName: string; mimeType: string; fileSize: number; sortOrder: number;
  createdAt: string; updatedAt: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
interface AiAnalysis {
  summary: string; scope: string; projectLocation: string | null;
  estimatedValueCr: number | null; completionPeriod: string | null;
  recommendation: string;
  keyDates: { publishDate?: string | null; preBidMeetingDate?: string | null; clarificationDeadline?: string | null; submissionDeadlineOnline?: string | null; submissionDeadlinePhysical?: string | null; technicalOpeningDate?: string | null; financialOpeningDate?: string | null };
  financial: { emdAmount?: string | null; emdMode?: string | null; tenderFee?: string | null; documentCost?: string | null; bidValidity?: string | null; performanceGuarantee?: string | null };
  eligibility: { turnoverRequirement?: string | null; experienceRequirement?: string | null; similarWorkRequirement?: string | null; technicalCapability?: string | null; certifications?: string | null; consortiumAllowed?: string | null; mseExemption?: string | null };
  evaluation: { method: string | null; technicalWeightPct: number | null; financialWeightPct: number | null; minimumTechnicalScore: number | null; evaluationCriteria: string[] };
  specialConditions: string[]; risks: string[];
  keyPersonnel: string[]; deliverables: string[];
  [key: string]: any;
}

interface OppInfo {
  id: string; title: string; stage: string; closedStatus: string | null; entryPath: string;
  contractValuePaise: number | null; probabilityPct: number | null; submissionDue: string | null;
  businessUnitId: string;
  businessUnit: { name: string };
  account: { id: string; name: string } | null;
  endClient: { id: string; name: string } | null;
  owner: { id: string; fullName: string } | null;
}

interface TenderDetail {
  id: string; opportunityId: string; tenderNumber: string; tenderTitle: string | null;
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
  aiAnalysis: Record<string, unknown> | null; aiAnalyzedAt: string | null;
  createdAt: string; updatedAt: string;
  opportunity: OppInfo;
}

@Component({
  selector: 'app-tender-detail',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterLink, ButtonModule, InputTextModule, InputNumberModule,
    SelectModule, TagModule, DialogModule, ToastModule, DatePickerModule, TextareaModule, FileUploadModule, ConfirmDialogModule, TooltipModule],
  providers: [MessageService, ConfirmationService],
  template: `
    <p-toast />

    @if (loading()) {
      <div class="flex items-center gap-2 text-gray-500 py-12 justify-center"><i class="pi pi-spin pi-spinner text-2xl"></i> Loading...</div>
    } @else if (tender()) {
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div>
          <div class="flex items-center gap-3">
            <p-button icon="pi pi-arrow-left" [text]="true" [rounded]="true" (onClick)="goBack()" />
            <h2 class="text-2xl font-semibold text-gray-800">{{ tender()!.tenderNumber }}</h2>
            <p-tag [value]="tender()!.tenderStatus" [severity]="statusSeverity(tender()!.tenderStatus)" />
            <p-tag [value]="tender()!.tenderType" severity="info" />
            @if (tender()!.tenderCategory) { <p-tag [value]="tender()!.tenderCategory!" severity="secondary" /> }
          </div>
          @if (tender()!.tenderTitle) {
            <p class="text-sm text-gray-500 mt-1 ml-12">{{ tender()!.tenderTitle }}</p>
          }
        </div>
        <div class="flex gap-2">
          @if (docsChangedSinceAnalysis()) {
            <p-button [label]="aiAnalysis() ? 'Re-analyze RFP' : 'Analyze RFP'" icon="pi pi-sparkles" severity="help"
                      [outlined]="!!aiAnalysis()" (onClick)="analyzeRfp()" [loading]="analyzing" [disabled]="analyzing || documents().length === 0"
                      [pTooltip]="documents().length === 0 ? 'Upload RFP documents first' : ''" />
          } @else {
            <p-button label="Analysis Up to Date" icon="pi pi-check-circle" severity="secondary" [outlined]="true" [disabled]="true"
                      pTooltip="Documents haven't changed since last analysis" />
          }
          <p-button label="Edit" icon="pi pi-pencil" (onClick)="openEditDialog()" />
        </div>
      </div>

      <!-- AI Analysis Card (Collapsible) -->
      @if (aiAnalysis()) {
        <div class="rounded-lg shadow-sm border border-orange-300 mb-6 overflow-hidden">
          <!-- Collapsed Header — always visible -->
          <div (click)="aiExpanded = !aiExpanded"
               class="flex items-center justify-between px-6 py-4 cursor-pointer bg-gradient-to-r from-orange-50 to-amber-50 hover:from-orange-100 hover:to-amber-100 transition-colors">
            <div class="flex items-center gap-3">
              <i class="pi pi-sparkles text-orange-600"></i>
              <span class="font-semibold text-gray-800">AI Recommendation</span>
              <p-tag
                [value]="aiAnalysis()!.recommendation"
                [severity]="aiAnalysis()!.recommendation === 'GO' ? 'success' : aiAnalysis()!.recommendation === 'NO-GO' ? 'danger' : 'warn'"
                [style]="{'font-size':'0.85rem','padding':'4px 12px'}" />
              @if (tender()!.aiAnalyzedAt) {
                <span class="text-xs text-gray-400 ml-2">{{ tender()!.aiAnalyzedAt | date:'medium' }}</span>
              }
            </div>
            <i class="pi text-gray-500" [class.pi-chevron-down]="!aiExpanded" [class.pi-chevron-up]="aiExpanded"></i>
          </div>

          <!-- Expanded Content -->
          @if (aiExpanded) {
            <div class="bg-gradient-to-r from-purple-50 to-indigo-50 p-6">
              <!-- Summary -->
              <div class="bg-white rounded-lg p-4 mb-4">
                <h4 class="text-sm font-semibold text-gray-600 mb-2">Executive Summary</h4>
                <p class="text-sm text-gray-700">{{ aiAnalysis()!.summary }}</p>
              </div>

              <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                <!-- Scope & Deliverables -->
                <div class="bg-white rounded-lg p-4">
                  <h4 class="text-sm font-semibold text-gray-600 mb-2">Scope of Work</h4>
                  <p class="text-sm text-gray-700 mb-3">{{ aiAnalysis()!.scope }}</p>
                  @if (aiAnalysis()!.deliverables?.length) {
                    <h4 class="text-sm font-semibold text-gray-600 mb-1">Key Deliverables</h4>
                    <ul class="text-sm text-gray-600 list-disc pl-4 space-y-1">
                      @for (d of aiAnalysis()!.deliverables; track $index) { <li>{{ d }}</li> }
                    </ul>
                  }
                  @if (aiAnalysis()!.completionPeriod) {
                    <div class="mt-2 text-sm"><span class="text-gray-500">Completion:</span> <span class="font-medium">{{ aiAnalysis()!.completionPeriod }}</span></div>
                  }
                </div>

                <!-- Evaluation -->
                <div class="bg-white rounded-lg p-4">
                  <h4 class="text-sm font-semibold text-gray-600 mb-2">Evaluation Method</h4>
                  <div class="space-y-2 text-sm">
                    @if (aiAnalysis()!.evaluation?.method) { <div><span class="text-gray-500">Method:</span> <span class="font-medium">{{ aiAnalysis()!.evaluation.method }}</span></div> }
                    @if (aiAnalysis()!.evaluation?.technicalWeightPct) { <div><span class="text-gray-500">Technical Weight:</span> {{ aiAnalysis()!.evaluation.technicalWeightPct }}%</div> }
                    @if (aiAnalysis()!.evaluation?.financialWeightPct) { <div><span class="text-gray-500">Financial Weight:</span> {{ aiAnalysis()!.evaluation.financialWeightPct }}%</div> }
                    @if (aiAnalysis()!.evaluation?.minimumTechnicalScore) { <div><span class="text-gray-500">Min Tech Score:</span> {{ aiAnalysis()!.evaluation.minimumTechnicalScore }}</div> }
                  </div>
                  @if (aiAnalysis()!.evaluation?.evaluationCriteria?.length) {
                    <h4 class="text-sm font-semibold text-gray-600 mt-3 mb-1">Criteria</h4>
                    <ul class="text-sm text-gray-600 list-disc pl-4 space-y-1">
                      @for (c of aiAnalysis()!.evaluation.evaluationCriteria; track $index) { <li>{{ c }}</li> }
                    </ul>
                  }
                </div>
              </div>

              <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                <!-- Eligibility -->
                <div class="bg-white rounded-lg p-4">
                  <h4 class="text-sm font-semibold text-gray-600 mb-2">Eligibility Requirements</h4>
                  <div class="space-y-2 text-sm">
                    @if (aiAnalysis()!.eligibility?.turnoverRequirement) { <div><span class="text-gray-500">Turnover:</span> {{ aiAnalysis()!.eligibility.turnoverRequirement }}</div> }
                    @if (aiAnalysis()!.eligibility?.experienceRequirement) { <div><span class="text-gray-500">Experience:</span> {{ aiAnalysis()!.eligibility.experienceRequirement }}</div> }
                    @if (aiAnalysis()!.eligibility?.similarWorkRequirement) { <div><span class="text-gray-500">Similar Work:</span> {{ aiAnalysis()!.eligibility.similarWorkRequirement }}</div> }
                    @if (aiAnalysis()!.eligibility?.technicalCapability) { <div><span class="text-gray-500">Technical:</span> {{ aiAnalysis()!.eligibility.technicalCapability }}</div> }
                    @if (aiAnalysis()!.eligibility?.certifications) { <div><span class="text-gray-500">Certifications:</span> {{ aiAnalysis()!.eligibility.certifications }}</div> }
                    @if (aiAnalysis()!.eligibility?.consortiumAllowed) { <div><span class="text-gray-500">JV/Consortium:</span> {{ aiAnalysis()!.eligibility.consortiumAllowed }}</div> }
                  </div>
                </div>

                <!-- Key Personnel -->
                <div class="bg-white rounded-lg p-4">
                  @if (aiAnalysis()!.keyPersonnel?.length) {
                    <h4 class="text-sm font-semibold text-gray-600 mb-2">Key Personnel Required</h4>
                    <ul class="text-sm text-gray-600 list-disc pl-4 space-y-1">
                      @for (p of aiAnalysis()!.keyPersonnel; track $index) { <li>{{ p }}</li> }
                    </ul>
                  }
                  @if (aiAnalysis()!.financial?.performanceGuarantee) {
                    <div class="mt-3 text-sm"><span class="text-gray-500">Performance Guarantee:</span> {{ aiAnalysis()!.financial.performanceGuarantee }}</div>
                  }
                </div>
              </div>

              <!-- Risks & Special Conditions -->
              <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                @if (aiAnalysis()!.risks?.length) {
                  <div class="bg-red-50 rounded-lg p-4 border border-red-100">
                    <h4 class="text-sm font-semibold text-red-700 mb-2 flex items-center gap-1"><i class="pi pi-exclamation-triangle"></i> Risks / Red Flags</h4>
                    <ul class="text-sm text-red-800 list-disc pl-4 space-y-1">
                      @for (r of aiAnalysis()!.risks; track $index) { <li>{{ r }}</li> }
                    </ul>
                  </div>
                }
                @if (aiAnalysis()!.specialConditions?.length) {
                  <div class="bg-amber-50 rounded-lg p-4 border border-amber-100">
                    <h4 class="text-sm font-semibold text-amber-700 mb-2 flex items-center gap-1"><i class="pi pi-info-circle"></i> Special Conditions</h4>
                    <ul class="text-sm text-amber-800 list-disc pl-4 space-y-1">
                      @for (s of aiAnalysis()!.specialConditions; track $index) { <li>{{ s }}</li> }
                    </ul>
                  </div>
                }
              </div>
            </div>
          }
        </div>
      }

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <!-- Column 1: Tender Identity -->
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 class="text-md font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <i class="pi pi-file-edit text-orange-600"></i> Tender Identity
          </h3>
          <div class="space-y-3 text-sm">
            <div class="flex justify-between"><span class="text-gray-500">Tender No</span> <span class="font-medium">{{ tender()!.tenderNumber }}</span></div>
            @if (tender()!.referenceNumber) { <div class="flex justify-between"><span class="text-gray-500">Reference No</span> <span>{{ tender()!.referenceNumber }}</span></div> }
            @if (tender()!.publishingAuthority) { <div class="flex justify-between"><span class="text-gray-500">Authority</span> <span>{{ tender()!.publishingAuthority }}</span></div> }
            @if (tender()!.publishingDepartment) { <div class="flex justify-between"><span class="text-gray-500">Department</span> <span>{{ tender()!.publishingDepartment }}</span></div> }
            @if (tender()!.procurementMode) { <div class="flex justify-between"><span class="text-gray-500">Procurement</span> <p-tag [value]="tender()!.procurementMode!" severity="warn" [style]="{'font-size':'0.7rem'}" /></div> }
            @if (tender()!.projectLocation) { <div class="flex justify-between"><span class="text-gray-500">Location</span> <span>{{ tender()!.projectLocation }}</span></div> }
          </div>

          @if (tender()!.portalName) {
            <div class="mt-4 pt-4 border-t">
              <h4 class="text-xs font-semibold text-gray-500 uppercase mb-2">Portal</h4>
              <div class="space-y-2 text-sm">
                <div class="flex justify-between"><span class="text-gray-500">Portal</span> <span class="font-medium">{{ tender()!.portalName }}</span></div>
                @if (tender()!.portalTenderId) { <div class="flex justify-between"><span class="text-gray-500">Portal ID</span> <span class="font-mono text-xs">{{ tender()!.portalTenderId }}</span></div> }
                @if (tender()!.portalUrl) { <div><a [href]="tender()!.portalUrl!" target="_blank" class="text-blue-600 hover:underline text-xs flex items-center gap-1"><i class="pi pi-external-link text-xs"></i> View on portal</a></div> }
              </div>
            </div>
          }
        </div>

        <!-- Column 2: Financial & Eligibility -->
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 class="text-md font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <i class="pi pi-indian-rupee text-green-600"></i> Financial
          </h3>
          <div class="space-y-3 text-sm">
            @if (tender()!.estimatedValuePaise) { <div class="flex justify-between"><span class="text-gray-500">Estimated Value</span> <span class="font-bold text-green-700">₹{{ formatRupees(tender()!.estimatedValuePaise!) }}</span></div> }
            @if (tender()!.emdAmountPaise) { <div class="flex justify-between"><span class="text-gray-500">EMD</span> <span class="font-medium">₹{{ formatRupees(tender()!.emdAmountPaise!) }}@if (tender()!.emdMode) { <span class="text-gray-400 ml-1">({{ tender()!.emdMode }})</span> }</span></div> }
            @if (tender()!.tenderFeePaise) { <div class="flex justify-between"><span class="text-gray-500">Tender Fee</span> <span>₹{{ formatRupees(tender()!.tenderFeePaise!) }}</span></div> }
            @if (tender()!.documentCostPaise) { <div class="flex justify-between"><span class="text-gray-500">Document Cost</span> <span>₹{{ formatRupees(tender()!.documentCostPaise!) }}</span></div> }
          </div>

          <div class="mt-4 pt-4 border-t">
            <h4 class="text-xs font-semibold text-gray-500 uppercase mb-2">Eligibility Requirements</h4>
            <div class="space-y-3 text-sm">
              @if (tender()!.turnoverRequirementPaise) { <div class="flex justify-between"><span class="text-gray-500">Min Turnover</span> <span class="font-medium">₹{{ formatRupees(tender()!.turnoverRequirementPaise!) }}</span></div> }
              @if (tender()!.experienceYears) { <div class="flex justify-between"><span class="text-gray-500">Min Experience</span> <span>{{ tender()!.experienceYears }} years</span></div> }
              @if (tender()!.similarWorkValuePaise) { <div class="flex justify-between"><span class="text-gray-500">Similar Work Value</span> <span>₹{{ formatRupees(tender()!.similarWorkValuePaise!) }}</span></div> }
            </div>
            @if (tender()!.eligibilityCriteria) {
              <div class="mt-3 bg-gray-50 p-3 rounded text-xs text-gray-600">{{ tender()!.eligibilityCriteria }}</div>
            }
          </div>
        </div>

        <!-- Column 3: Key Dates & Terms -->
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 class="text-md font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <i class="pi pi-calendar text-blue-600"></i> Key Dates
          </h3>
          <div class="space-y-3 text-sm">
            @if (tender()!.publishDate) { <div class="flex justify-between"><span class="text-gray-500">Published</span> <span>{{ tender()!.publishDate | date:'dd-MMM-yyyy' }}</span></div> }
            @if (tender()!.preBidMeetingDate) { <div class="flex justify-between"><span class="text-gray-500">Pre-Bid Meeting</span> <span>{{ tender()!.preBidMeetingDate | date:'dd-MMM-yyyy, h:mm a' }}</span></div> }
            @if (tender()!.clarificationDeadline) { <div class="flex justify-between"><span class="text-gray-500">Clarification Due</span> <span>{{ tender()!.clarificationDeadline | date:'dd-MMM-yyyy, h:mm a' }}</span></div> }
            @if (tender()!.submissionDeadlineOnline) {
              <div class="flex justify-between">
                <span class="text-gray-500">Submit (Online)</span>
                <span class="font-bold" [class.text-red-600]="isOverdue(tender()!.submissionDeadlineOnline!)">{{ tender()!.submissionDeadlineOnline | date:'dd-MMM-yyyy, h:mm a' }}</span>
              </div>
            }
            @if (tender()!.submissionDeadlinePhysical) { <div class="flex justify-between"><span class="text-gray-500">Submit (Physical)</span> <span>{{ tender()!.submissionDeadlinePhysical | date:'dd-MMM-yyyy, h:mm a' }}</span></div> }
            @if (tender()!.technicalOpeningDate) { <div class="flex justify-between"><span class="text-gray-500">Tech Opening</span> <span>{{ tender()!.technicalOpeningDate | date:'dd-MMM-yyyy, h:mm a' }}</span></div> }
            @if (tender()!.financialOpeningDate) { <div class="flex justify-between"><span class="text-gray-500">Fin Opening</span> <span>{{ tender()!.financialOpeningDate | date:'dd-MMM-yyyy, h:mm a' }}</span></div> }
          </div>

          <div class="mt-4 pt-4 border-t">
            <h4 class="text-xs font-semibold text-gray-500 uppercase mb-2">Terms</h4>
            <div class="space-y-3 text-sm">
              @if (tender()!.bidValidityDays) { <div class="flex justify-between"><span class="text-gray-500">Bid Validity</span> <span>{{ tender()!.bidValidityDays }} days</span></div> }
              @if (tender()!.completionPeriodDays) { <div class="flex justify-between"><span class="text-gray-500">Completion Period</span> <span>{{ tender()!.completionPeriodDays }} days</span></div> }
            </div>
          </div>
        </div>
      </div>

      <!-- Linked Opportunity Card -->
      <div class="bg-white rounded-lg shadow-sm border border-blue-200 p-6 mb-6">
        <h3 class="text-md font-semibold text-gray-700 mb-4 flex items-center gap-2">
          <i class="pi pi-star text-blue-600"></i> Linked Opportunity
        </h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span class="text-gray-500 block">Opportunity</span>
            <a [routerLink]="['/sales/opportunities', tender()!.opportunity.id]" class="font-medium text-blue-700 hover:underline cursor-pointer">{{ tender()!.opportunity.title }}</a>
          </div>
          <div>
            <span class="text-gray-500 block">Stage</span>
            <p-tag [value]="tender()!.opportunity.stage" severity="info" [style]="{'font-size':'0.7rem'}" />
            @if (tender()!.opportunity.closedStatus) {
              <p-tag [value]="tender()!.opportunity.closedStatus!" severity="danger" [style]="{'font-size':'0.7rem','margin-left':'4px'}" />
            }
          </div>
          <div>
            <span class="text-gray-500 block">Business Unit</span>
            <span class="font-medium">{{ tender()!.opportunity.businessUnit.name }}</span>
          </div>
          <div>
            <span class="text-gray-500 block">Contract Value</span>
            <span class="font-bold text-green-700">{{ tender()!.opportunity.contractValuePaise ? '₹' + formatRupees(tender()!.opportunity.contractValuePaise!) : '—' }}</span>
          </div>
          @if (tender()!.opportunity.account) {
            <div>
              <span class="text-gray-500 block">Account</span>
              <span>{{ tender()!.opportunity.account!.name }}</span>
            </div>
          }
          @if (tender()!.opportunity.endClient) {
            <div>
              <span class="text-gray-500 block">End Client</span>
              <span>{{ tender()!.opportunity.endClient!.name }}</span>
            </div>
          }
          @if (tender()!.opportunity.owner) {
            <div>
              <span class="text-gray-500 block">Owner</span>
              <span>{{ tender()!.opportunity.owner!.fullName }}</span>
            </div>
          }
        </div>
      </div>

      <!-- Notes & Corrigendum -->
      @if (tender()!.notes || tender()!.corrigendumDetails) {
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          @if (tender()!.notes) {
            <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 class="text-md font-semibold text-gray-700 mb-3"><i class="pi pi-comment text-gray-500 mr-2"></i>Notes</h3>
              <p class="text-sm text-gray-600 whitespace-pre-wrap">{{ tender()!.notes }}</p>
            </div>
          }
          @if (tender()!.corrigendumDetails) {
            <div class="bg-white rounded-lg shadow-sm border border-amber-200 p-6">
              <h3 class="text-md font-semibold text-amber-700 mb-3"><i class="pi pi-exclamation-triangle text-amber-500 mr-2"></i>Corrigendum</h3>
              <p class="text-sm text-gray-600 whitespace-pre-wrap">{{ tender()!.corrigendumDetails }}</p>
            </div>
          }
        </div>
      }

      <!-- Documents Section -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-md font-semibold text-gray-700 flex items-center gap-2">
            <i class="pi pi-folder-open text-indigo-600"></i> Documents
          </h3>
          <p-button label="Upload" icon="pi pi-upload" size="small" (onClick)="uploadDialogVisible=true" />
        </div>

        @if (documents().length === 0) {
          <div class="text-center text-gray-400 py-8">
            <i class="pi pi-file text-4xl mb-2 block"></i>
            <p>No documents uploaded yet</p>
          </div>
        } @else {
          <!-- Group documents by docType -->
          @for (group of groupedDocuments(); track group.type) {
            <div class="mb-4">
              <h4 class="text-sm font-semibold text-gray-500 uppercase mb-2 flex items-center gap-2">
                <i [class]="docTypeIcon(group.type)"></i> {{ docTypeLabel(group.type) }}
                <span class="text-xs text-gray-400 font-normal">({{ group.docs.length }})</span>
              </h4>
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                @for (doc of group.docs; track doc.id) {
                  <div class="flex items-center gap-3 bg-gray-50 border rounded-lg px-4 py-3 group hover:border-blue-300 transition-colors">
                    <i [class]="fileIcon(doc.mimeType) + ' text-2xl'"></i>
                    <div class="flex-1 min-w-0">
                      <div class="font-medium text-sm truncate">{{ doc.name }}</div>
                      <div class="text-xs text-gray-400">{{ doc.fileName }} &middot; {{ formatFileSize(doc.fileSize) }}</div>
                    </div>
                    <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <p-button icon="pi pi-download" [rounded]="true" [text]="true" size="small" severity="info"
                                (onClick)="downloadDoc(doc)" pTooltip="Download" />
                      <p-button icon="pi pi-trash" [rounded]="true" [text]="true" size="small" severity="danger"
                                (onClick)="deleteDoc(doc)" pTooltip="Delete" />
                    </div>
                  </div>
                }
              </div>
            </div>
          }
        }
      </div>

      <!-- Upload Dialog -->
      <p-dialog header="Upload Document" [(visible)]="uploadDialogVisible" [modal]="true" [style]="{width:'500px'}">
        <div class="flex flex-col gap-4 pt-2">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Document Name *</label>
            <input pInputText [(ngModel)]="uploadName" class="w-full" placeholder="e.g. RFP Volume 1" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Document Type *</label>
            <p-select appendTo="body" [(ngModel)]="uploadDocType" [options]="docTypeOptions" optionLabel="label" optionValue="value" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">File *</label>
            <input type="file" (change)="onFileSelect($event)" class="text-sm" />
          </div>
        </div>
        <ng-template pTemplate="footer">
          <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="uploadDialogVisible=false" />
          <p-button label="Upload" icon="pi pi-upload" (onClick)="uploadDocument()" [disabled]="!uploadName || !uploadFile || uploading" [loading]="uploading" />
        </ng-template>
      </p-dialog>

      <p-confirmDialog />

      <!-- Edit Dialog -->
      <p-dialog header="Edit Tender" [(visible)]="editVisible" [modal]="true" [style]="{width:'800px'}" [dismissableMask]="true">
        <form [formGroup]="form" class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div class="flex flex-col gap-1"><label class="text-sm font-medium text-gray-700">Tender No *</label><input pInputText formControlName="tenderNumber" class="w-full" /></div>
          <div class="flex flex-col gap-1"><label class="text-sm font-medium text-gray-700">Title</label><input pInputText formControlName="tenderTitle" class="w-full" /></div>
          <div class="flex flex-col gap-1"><label class="text-sm font-medium text-gray-700">Reference No</label><input pInputText formControlName="referenceNumber" class="w-full" /></div>
          <div class="flex flex-col gap-1"><label class="text-sm font-medium text-gray-700">Authority</label><input pInputText formControlName="publishingAuthority" class="w-full" /></div>
          <div class="flex flex-col gap-1"><label class="text-sm font-medium text-gray-700">Department</label><input pInputText formControlName="publishingDepartment" class="w-full" /></div>
          <div class="flex flex-col gap-1"><label class="text-sm font-medium text-gray-700">Type *</label><p-select appendTo="body" formControlName="tenderType" [options]="typeOpts" optionLabel="label" optionValue="value" class="w-full" /></div>
          <div class="flex flex-col gap-1"><label class="text-sm font-medium text-gray-700">Category</label><p-select appendTo="body" formControlName="tenderCategory" [options]="catOpts" optionLabel="label" optionValue="value" [showClear]="true" class="w-full" /></div>
          <div class="flex flex-col gap-1"><label class="text-sm font-medium text-gray-700">Procurement Mode</label><p-select appendTo="body" formControlName="procurementMode" [options]="procOpts" optionLabel="label" optionValue="value" [showClear]="true" class="w-full" /></div>
          <div class="flex flex-col gap-1"><label class="text-sm font-medium text-gray-700">Portal</label><p-select appendTo="body" formControlName="portalName" [options]="portalOpts" optionLabel="label" optionValue="value" [showClear]="true" class="w-full" /></div>
          <div class="flex flex-col gap-1"><label class="text-sm font-medium text-gray-700">Portal ID</label><input pInputText formControlName="portalTenderId" class="w-full" /></div>
          <div class="flex flex-col gap-1 md:col-span-2"><label class="text-sm font-medium text-gray-700">Portal URL</label><input pInputText formControlName="portalUrl" class="w-full" /></div>

          <div class="flex flex-col gap-1"><label class="text-sm font-medium text-gray-700">Estimated Value (₹)</label><p-inputNumber formControlName="estimatedValueRupees" mode="currency" currency="INR" locale="en-IN" class="w-full" /></div>
          <div class="flex flex-col gap-1"><label class="text-sm font-medium text-gray-700">EMD (₹)</label><p-inputNumber formControlName="emdAmountRupees" mode="currency" currency="INR" locale="en-IN" class="w-full" /></div>
          <div class="flex flex-col gap-1"><label class="text-sm font-medium text-gray-700">EMD Mode</label><p-select appendTo="body" formControlName="emdMode" [options]="emdOpts" optionLabel="label" optionValue="value" [showClear]="true" class="w-full" /></div>
          <div class="flex flex-col gap-1"><label class="text-sm font-medium text-gray-700">Tender Fee (₹)</label><p-inputNumber formControlName="tenderFeeRupees" mode="currency" currency="INR" locale="en-IN" class="w-full" /></div>

          <div class="flex flex-col gap-1"><label class="text-sm font-medium text-gray-700">Publish Date</label><p-datePicker appendTo="body" formControlName="publishDate" dateFormat="dd-M-yy" [showIcon]="true" class="w-full" /></div>
          <div class="flex flex-col gap-1"><label class="text-sm font-medium text-gray-700">Pre-Bid Meeting</label><p-datePicker appendTo="body" formControlName="preBidMeetingDate" dateFormat="dd-M-yy" [showTime]="true" [showIcon]="true" class="w-full" /></div>
          <div class="flex flex-col gap-1"><label class="text-sm font-medium text-gray-700">Submit Deadline (Online)</label><p-datePicker appendTo="body" formControlName="submissionDeadlineOnline" dateFormat="dd-M-yy" [showTime]="true" [showIcon]="true" class="w-full" /></div>
          <div class="flex flex-col gap-1"><label class="text-sm font-medium text-gray-700">Submit Deadline (Physical)</label><p-datePicker appendTo="body" formControlName="submissionDeadlinePhysical" dateFormat="dd-M-yy" [showTime]="true" [showIcon]="true" class="w-full" /></div>
          <div class="flex flex-col gap-1"><label class="text-sm font-medium text-gray-700">Tech Opening</label><p-datePicker appendTo="body" formControlName="technicalOpeningDate" dateFormat="dd-M-yy" [showTime]="true" [showIcon]="true" class="w-full" /></div>
          <div class="flex flex-col gap-1"><label class="text-sm font-medium text-gray-700">Fin Opening</label><p-datePicker appendTo="body" formControlName="financialOpeningDate" dateFormat="dd-M-yy" [showTime]="true" [showIcon]="true" class="w-full" /></div>

          <div class="flex flex-col gap-1"><label class="text-sm font-medium text-gray-700">Bid Validity (days)</label><p-inputNumber formControlName="bidValidityDays" class="w-full" /></div>
          <div class="flex flex-col gap-1"><label class="text-sm font-medium text-gray-700">Completion Period (days)</label><p-inputNumber formControlName="completionPeriodDays" class="w-full" /></div>
          <div class="flex flex-col gap-1"><label class="text-sm font-medium text-gray-700">Location</label><input pInputText formControlName="projectLocation" class="w-full" /></div>
          <div class="flex flex-col gap-1"><label class="text-sm font-medium text-gray-700">Status</label><p-select appendTo="body" formControlName="tenderStatus" [options]="statusOpts" optionLabel="label" optionValue="value" class="w-full" /></div>

          <div class="flex flex-col gap-1"><label class="text-sm font-medium text-gray-700">Min Turnover (₹)</label><p-inputNumber formControlName="turnoverRequirementRupees" mode="currency" currency="INR" locale="en-IN" class="w-full" /></div>
          <div class="flex flex-col gap-1"><label class="text-sm font-medium text-gray-700">Min Experience (years)</label><p-inputNumber formControlName="experienceYears" class="w-full" /></div>
          <div class="flex flex-col gap-1 md:col-span-2"><label class="text-sm font-medium text-gray-700">Eligibility Criteria</label><textarea pTextarea formControlName="eligibilityCriteria" [autoResize]="true" [rows]="3" class="w-full"></textarea></div>
          <div class="flex flex-col gap-1 md:col-span-2"><label class="text-sm font-medium text-gray-700">Notes</label><textarea pTextarea formControlName="notes" [autoResize]="true" [rows]="2" class="w-full"></textarea></div>
          <div class="flex flex-col gap-1 md:col-span-2"><label class="text-sm font-medium text-gray-700">Corrigendum</label><textarea pTextarea formControlName="corrigendumDetails" [autoResize]="true" [rows]="2" class="w-full"></textarea></div>
        </form>

        @if (serverError) { <div class="text-red-600 text-sm mt-2">{{ serverError }}</div> }

        <ng-template pTemplate="footer">
          <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="editVisible=false" />
          <p-button label="Save" icon="pi pi-check" (onClick)="save()" [disabled]="form.invalid || saving" [loading]="saving" />
        </ng-template>
      </p-dialog>
    }
  `,
})
export class TenderDetailComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly msg = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  tender = signal<TenderDetail | null>(null);
  documents = signal<TenderDoc[]>([]);
  aiAnalysis = signal<AiAnalysis | null>(null);
  analyzing = false;
  aiExpanded = false;

  /** True if no analysis exists OR documents were added/changed after the last analysis */
  docsChangedSinceAnalysis = computed(() => {
    const t = this.tender();
    const docs = this.documents();
    if (!t?.aiAnalyzedAt) return true; // never analyzed
    if (docs.length === 0) return true; // no docs yet
    const analyzedAt = new Date(t.aiAnalyzedAt).getTime();
    // Check if any document was created or updated after the analysis
    return docs.some((d) => new Date(d.createdAt).getTime() > analyzedAt || new Date(d.updatedAt).getTime() > analyzedAt);
  });
  loading = signal(true);
  editVisible = false;
  saving = false;
  serverError = '';

  typeOpts = [{ label: 'Open', value: 'OPEN' }, { label: 'Limited', value: 'LIMITED' }, { label: 'Single Source', value: 'SINGLE_SOURCE' }, { label: 'EOI', value: 'EOI' }, { label: 'Reverse Auction', value: 'REVERSE_AUCTION' }];
  catOpts = [{ label: 'Works', value: 'WORKS' }, { label: 'Goods', value: 'GOODS' }, { label: 'Services', value: 'SERVICES' }, { label: 'Consultancy', value: 'CONSULTANCY' }];
  procOpts = [{ label: 'ICB', value: 'ICB' }, { label: 'NCB', value: 'NCB' }, { label: 'Shopping', value: 'SHOPPING' }, { label: 'Direct', value: 'DIRECT' }];
  portalOpts = [{ label: 'GeM', value: 'GeM' }, { label: 'CPPP', value: 'CPPP' }, { label: 'State Portal', value: 'STATE_PORTAL' }, { label: 'Department', value: 'DEPARTMENT' }, { label: 'Other', value: 'OTHER' }];
  emdOpts = [{ label: 'Bank Guarantee', value: 'BG' }, { label: 'DD', value: 'DD' }, { label: 'FDR', value: 'FDR' }, { label: 'Online', value: 'ONLINE' }, { label: 'Exempted', value: 'EXEMPTED' }];
  statusOpts = [{ label: 'Published', value: 'PUBLISHED' }, { label: 'Corrigendum', value: 'CORRIGENDUM' }, { label: 'Pre-Bid Done', value: 'PREBID_DONE' }, { label: 'Submission Closed', value: 'SUBMISSION_CLOSED' }, { label: 'Tech Opened', value: 'TECH_OPENED' }, { label: 'Fin Opened', value: 'FIN_OPENED' }, { label: 'Awarded', value: 'AWARDED' }, { label: 'Cancelled', value: 'CANCELLED' }];

  form = this.fb.group({
    tenderNumber: ['', Validators.required], tenderTitle: [''], referenceNumber: [''],
    publishingAuthority: [''], publishingDepartment: [''],
    tenderType: ['OPEN', Validators.required], tenderCategory: [null as string | null],
    procurementMode: [null as string | null], portalName: [null as string | null],
    portalTenderId: [''], portalUrl: [''],
    estimatedValueRupees: [null as number | null], emdAmountRupees: [null as number | null],
    emdMode: [null as string | null], tenderFeeRupees: [null as number | null],
    publishDate: [null as Date | null], preBidMeetingDate: [null as Date | null],
    clarificationDeadline: [null as Date | null],
    submissionDeadlineOnline: [null as Date | null], submissionDeadlinePhysical: [null as Date | null],
    technicalOpeningDate: [null as Date | null], financialOpeningDate: [null as Date | null],
    bidValidityDays: [null as number | null], completionPeriodDays: [null as number | null],
    projectLocation: [''], tenderStatus: ['PUBLISHED'],
    turnoverRequirementRupees: [null as number | null], experienceYears: [null as number | null],
    eligibilityCriteria: [''], notes: [''], corrigendumDetails: [''],
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.loadTender(id);
  }

  private loadTender(id: string): void {
    this.loading.set(true);
    this.http.get<{ data: TenderDetail }>(`${environment.apiBaseUrl}/tenders/${id}`).subscribe({
      next: (r) => {
        this.tender.set(r.data);
        if (r.data.aiAnalysis) this.aiAnalysis.set(r.data.aiAnalysis as unknown as AiAnalysis);
        this.loading.set(false);
        this.loadDocuments();
      },
      error: () => this.loading.set(false),
    });
  }

  openEditDialog(): void {
    const t = this.tender()!;
    this.serverError = '';
    this.form.patchValue({
      tenderNumber: t.tenderNumber, tenderTitle: t.tenderTitle ?? '', referenceNumber: t.referenceNumber ?? '',
      publishingAuthority: t.publishingAuthority ?? '', publishingDepartment: t.publishingDepartment ?? '',
      tenderType: t.tenderType, tenderCategory: t.tenderCategory, procurementMode: t.procurementMode,
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
      projectLocation: t.projectLocation ?? '', tenderStatus: t.tenderStatus,
      turnoverRequirementRupees: t.turnoverRequirementPaise ? t.turnoverRequirementPaise / 100 : null,
      experienceYears: t.experienceYears, eligibilityCriteria: t.eligibilityCriteria ?? '',
      notes: t.notes ?? '', corrigendumDetails: t.corrigendumDetails ?? '',
    });
    this.editVisible = true;
  }

  save(): void {
    if (this.form.invalid) return;
    this.saving = true;
    this.serverError = '';
    const v = this.form.getRawValue();
    const t = this.tender()!;

    const body: Record<string, unknown> = {
      tenderNumber: v.tenderNumber, tenderTitle: v.tenderTitle || null,
      referenceNumber: v.referenceNumber || null, publishingAuthority: v.publishingAuthority || null,
      publishingDepartment: v.publishingDepartment || null, tenderType: v.tenderType,
      tenderCategory: v.tenderCategory || null, procurementMode: v.procurementMode || null,
      portalName: v.portalName || null, portalTenderId: v.portalTenderId || null, portalUrl: v.portalUrl || null,
      estimatedValuePaise: v.estimatedValueRupees ? Math.round(v.estimatedValueRupees * 100) : null,
      emdAmountPaise: v.emdAmountRupees ? Math.round(v.emdAmountRupees * 100) : null,
      emdMode: v.emdMode || null, tenderFeePaise: v.tenderFeeRupees ? Math.round(v.tenderFeeRupees * 100) : null,
      publishDate: v.publishDate?.toISOString() ?? null,
      preBidMeetingDate: v.preBidMeetingDate?.toISOString() ?? null,
      clarificationDeadline: v.clarificationDeadline?.toISOString() ?? null,
      submissionDeadlineOnline: v.submissionDeadlineOnline?.toISOString() ?? null,
      submissionDeadlinePhysical: v.submissionDeadlinePhysical?.toISOString() ?? null,
      technicalOpeningDate: v.technicalOpeningDate?.toISOString() ?? null,
      financialOpeningDate: v.financialOpeningDate?.toISOString() ?? null,
      bidValidityDays: v.bidValidityDays, completionPeriodDays: v.completionPeriodDays,
      projectLocation: v.projectLocation || null, tenderStatus: v.tenderStatus,
      turnoverRequirementPaise: v.turnoverRequirementRupees ? Math.round(v.turnoverRequirementRupees * 100) : null,
      experienceYears: v.experienceYears, eligibilityCriteria: v.eligibilityCriteria || null,
      notes: v.notes || null, corrigendumDetails: v.corrigendumDetails || null,
    };

    this.http.patch<{ data: TenderDetail }>(`${environment.apiBaseUrl}/opportunities/${t.opportunityId}/tender`, body).subscribe({
      next: () => {
        this.saving = false;
        this.editVisible = false;
        this.msg.add({ severity: 'success', summary: 'Saved', detail: 'Tender updated' });
        this.loadTender(t.id);
      },
      error: (err: HttpErrorResponse) => {
        this.saving = false;
        this.serverError = err.error?.error?.message ?? 'Failed to save';
      },
    });
  }

  // ---- Documents ----

  uploadDialogVisible = false;
  uploadName = '';
  uploadDocType = 'RFP';
  uploadFile: File | null = null;
  uploading = false;

  docTypeOptions = [
    { label: 'RFP / Tender Document', value: 'RFP' },
    { label: 'Corrigendum', value: 'CORRIGENDUM' },
    { label: 'Addendum', value: 'ADDENDUM' },
    { label: 'BOQ / Schedule', value: 'BOQ' },
    { label: 'Drawing / Map', value: 'DRAWING' },
    { label: 'Pre-Bid Minutes', value: 'PRE_BID_MINUTES' },
    { label: 'Clarification', value: 'CLARIFICATION' },
    { label: 'Other', value: 'OTHER' },
  ];

  private loadDocuments(): void {
    const t = this.tender();
    if (!t) return;
    this.http.get<{ data: TenderDoc[] }>(`${environment.apiBaseUrl}/tenders/${t.id}/documents`).subscribe({
      next: (r) => this.documents.set(r.data),
    });
  }

  groupedDocuments(): Array<{ type: string; docs: TenderDoc[] }> {
    const map = new Map<string, TenderDoc[]>();
    for (const doc of this.documents()) {
      const list = map.get(doc.docType) ?? [];
      list.push(doc);
      map.set(doc.docType, list);
    }
    // Sort: RFP first, then rest alphabetically
    const order = ['RFP', 'CORRIGENDUM', 'ADDENDUM', 'BOQ', 'DRAWING', 'PRE_BID_MINUTES', 'CLARIFICATION', 'OTHER'];
    return Array.from(map.entries())
      .sort(([a], [b]) => (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b)))
      .map(([type, docs]) => ({ type, docs }));
  }

  docTypeLabel(type: string): string {
    return this.docTypeOptions.find((o) => o.value === type)?.label ?? type;
  }

  docTypeIcon(type: string): string {
    switch (type) {
      case 'RFP': return 'pi pi-file-pdf text-red-500';
      case 'CORRIGENDUM': return 'pi pi-exclamation-triangle text-amber-500';
      case 'ADDENDUM': return 'pi pi-file-plus text-blue-500';
      case 'BOQ': return 'pi pi-table text-green-500';
      case 'DRAWING': return 'pi pi-image text-purple-500';
      case 'PRE_BID_MINUTES': return 'pi pi-comments text-cyan-500';
      case 'CLARIFICATION': return 'pi pi-question-circle text-orange-500';
      default: return 'pi pi-file text-gray-500';
    }
  }

  fileIcon(mimeType: string): string {
    if (mimeType.includes('pdf')) return 'pi pi-file-pdf text-red-500';
    if (mimeType.includes('word') || mimeType.includes('document')) return 'pi pi-file-word text-blue-500';
    if (mimeType.includes('excel') || mimeType.includes('sheet')) return 'pi pi-file-excel text-green-500';
    if (mimeType.includes('image')) return 'pi pi-image text-purple-500';
    return 'pi pi-file text-gray-500';
  }

  formatFileSize(bytes: number): string {
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return bytes + ' B';
  }

  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.uploadFile = input.files?.[0] ?? null;
  }

  uploadDocument(): void {
    if (!this.uploadName || !this.uploadFile || !this.tender()) return;
    this.uploading = true;

    const formData = new FormData();
    formData.append('file', this.uploadFile);
    formData.append('name', this.uploadName);
    formData.append('docType', this.uploadDocType);

    this.http.post(`${environment.apiBaseUrl}/tenders/${this.tender()!.id}/documents`, formData).subscribe({
      next: () => {
        this.uploading = false;
        this.uploadDialogVisible = false;
        this.uploadName = '';
        this.uploadFile = null;
        this.uploadDocType = 'RFP';
        this.msg.add({ severity: 'success', summary: 'Uploaded', detail: 'Document uploaded' });
        this.loadDocuments();
      },
      error: (err: HttpErrorResponse) => {
        this.uploading = false;
        this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Upload failed' });
      },
    });
  }

  downloadDoc(doc: TenderDoc): void {
    const url = `${environment.apiBaseUrl}/tenders/${doc.tenderId}/documents/${doc.id}/download`;
    this.http.get(url, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = doc.fileName;
        a.click();
        URL.revokeObjectURL(a.href);
      },
    });
  }

  deleteDoc(doc: TenderDoc): void {
    this.confirm.confirm({
      message: `Delete "${doc.name}"?`,
      header: 'Delete Document',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.http.delete(`${environment.apiBaseUrl}/tenders/${doc.tenderId}/documents/${doc.id}`).subscribe({
          next: () => {
            this.msg.add({ severity: 'success', summary: 'Deleted', detail: `"${doc.name}" deleted` });
            this.loadDocuments();
          },
        });
      },
    });
  }

  analyzeRfp(): void {
    const t = this.tender();
    if (!t) return;
    this.analyzing = true;
    this.http.post<{ data: AiAnalysis }>(`${environment.apiBaseUrl}/tenders/${t.id}/analyze`, {}).subscribe({
      next: (r) => {
        this.analyzing = false;
        this.aiAnalysis.set(r.data);
        this.msg.add({ severity: 'success', summary: 'Analysis Complete', detail: 'RFP analyzed by Gemini AI' });
        // Reload tender to get aiAnalyzedAt
        this.loadTender(t.id);
      },
      error: (err: HttpErrorResponse) => {
        this.analyzing = false;
        this.msg.add({ severity: 'error', summary: 'Analysis Failed', detail: err.error?.error?.message ?? 'Failed to analyze RFP' });
      },
    });
  }

  goBack(): void { this.router.navigate(['/bid-management/tenders']); }

  isOverdue(d: string): boolean { return new Date(d).getTime() < Date.now(); }

  statusSeverity(s: string): 'info' | 'success' | 'warn' | 'danger' | 'secondary' {
    switch (s) {
      case 'PUBLISHED': return 'info'; case 'CORRIGENDUM': return 'warn';
      case 'PREBID_DONE': return 'info'; case 'SUBMISSION_CLOSED': return 'secondary';
      case 'TECH_OPENED': case 'FIN_OPENED': return 'warn';
      case 'AWARDED': return 'success'; case 'CANCELLED': return 'danger';
      default: return 'info';
    }
  }

  formatRupees(paise: number): string {
    const r = paise / 100;
    if (r >= 10000000) return (r / 10000000).toFixed(2) + ' Cr';
    if (r >= 100000) return (r / 100000).toFixed(2) + ' L';
    return r.toLocaleString('en-IN');
  }
}
