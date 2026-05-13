import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormBuilder, FormArray, Validators } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { TextareaModule } from 'primeng/textarea';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { TooltipModule } from 'primeng/tooltip';
import { environment } from '../../../environments/environment';

interface OemOption {
  id: string; modelName: string; oemPartNo: string | null; brand: string | null;
  unitPricePaise: number; uom: string; hsn: string | null; gstRateBps: number;
  masterItemId: string;
  masterItem: { id: string; sku: string; name: string };
  vendor: { id: string; name: string };
}

interface VendorOption { id: string; name: string; }
interface QuotationLine {
  id?: string; description: string; uom: string; qty: number;
  ratePaise: number; discountPct: number; gstRateBps: number;
  supplyType: string; hsnSacCode: string;
}
interface Quotation {
  id: string; quotationNo: string; vendorId: string;
  vendor: { id: string; name: string; gstin: string | null };
  quotationDate: string; validUntil: string | null;
  referenceNo: string | null;
  paymentTermsDays: number | null; deliveryDays: number | null;
  notes: string | null; status: string;
  totalPaise: number; gstTotalPaise: number; grandTotalPaise: number;
  lines: QuotationLine[];
  attachmentName: string | null; attachmentPath: string | null;
}

const GST_RATES = [
  { label: '0%', value: 0 },
  { label: '5%', value: 500 },
  { label: '12%', value: 1200 },
  { label: '18%', value: 1800 },
  { label: '28%', value: 2800 },
];

const SUPPLY_TYPES = [
  { label: 'Intra-State', value: 'INTRA' },
  { label: 'Inter-State', value: 'INTER' },
  { label: 'Exempt', value: 'EXEMPT' },
];

const UOM_OPTIONS = [
  { label: 'Nos', value: 'NOS' },
  { label: 'Lot', value: 'LOT' },
  { label: 'Set', value: 'SET' },
  { label: 'Kg', value: 'KG' },
  { label: 'Metre', value: 'MTR' },
  { label: 'Sq.m', value: 'SQM' },
  { label: 'Litre', value: 'LTR' },
];

@Component({
  selector: 'app-quotation-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, TableModule, TagModule, ButtonModule, InputTextModule, InputNumberModule, SelectModule, DatePickerModule, TextareaModule, ToastModule, AutoCompleteModule, TooltipModule, DialogModule],
  providers: [MessageService],
  template: `
    <p-toast />
    <div class="flex items-center gap-3 mb-6">
      <p-button icon="pi pi-arrow-left" [rounded]="true" [text]="true" (onClick)="router.navigate(['/procurement/quotations'])" />
      <div>
        <h2 class="text-2xl font-semibold text-gray-800">
          {{ isNew() ? 'New Quotation' : ('Quotation: ' + quotation()?.quotationNo) }}
        </h2>
        @if (!isNew() && quotation()) {
          <p class="text-sm text-gray-500 mt-1">Vendor: {{ quotation()!.vendor.name }} &middot; Status: {{ quotation()!.status }}</p>
        }
      </div>
    </div>

    @if (serverError) {
      <div class="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{{ serverError }}</div>
    }

    @if (loading()) {
      <div class="flex items-center gap-2 text-gray-500 py-12 justify-center"><i class="pi pi-spin pi-spinner text-2xl"></i> Loading...</div>
    } @else {
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <form [formGroup]="form">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Quotation No *</label>
              <input pInputText formControlName="quotationNo" placeholder="e.g. VQ/2026/001 or vendor ref" class="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Vendor *</label>
              <p-select formControlName="vendorId" [options]="vendors()" optionLabel="name" optionValue="id"
                placeholder="Select vendor" [filter]="true" filterBy="name" styleClass="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Reference No</label>
              <input pInputText formControlName="referenceNo" placeholder="Vendor's ref / PO ref" class="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Quotation Date *</label>
              <p-datepicker formControlName="quotationDate" dateFormat="dd-M-yy" styleClass="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Valid Until</label>
              <p-datepicker formControlName="validUntil" dateFormat="dd-M-yy" styleClass="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Payment Terms (Days)</label>
              <p-inputNumber formControlName="paymentTermsDays" [min]="0" [max]="365" styleClass="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Delivery (Days)</label>
              <p-inputNumber formControlName="deliveryDays" [min]="0" [max]="999" styleClass="w-full" />
            </div>
            <div class="flex flex-col gap-1 md:col-span-2">
              <label class="text-sm font-medium text-gray-700">Notes</label>
              <textarea pTextarea formControlName="notes" rows="2" class="w-full"></textarea>
            </div>
          </div>

          <!-- Attachment Upload -->
          <div class="mb-6 flex items-center gap-4">
            <label class="text-sm font-medium text-gray-700">Document:</label>
            @if (!isNew() && quotation()?.attachmentName) {
              <a class="text-sm hover:underline flex items-center gap-1 cursor-pointer"
                (click)="downloadAttachment()">
                <i class="pi pi-file-pdf"></i> {{ quotation()!.attachmentName }}
              </a>
            }
            <input type="file" #fileInput (change)="onFileSelected($event)" accept=".pdf,.jpg,.png,.xlsx,.docx"
              class="text-sm" [class.hidden]="!isNew() && quotation()?.attachmentName" />
            @if (selectedFile) {
              <span class="text-sm text-gray-500">{{ selectedFile.name }}</span>
            }
          </div>

          <!-- Lines -->
          <div class="mb-4 flex items-center justify-between">
            <h3 class="text-lg font-semibold text-gray-700">Quotation Lines</h3>
            <p-button label="Add Line" icon="pi pi-plus" severity="secondary" size="small" (onClick)="addLine()" />
          </div>

          <div class="overflow-x-auto mb-6">
            <table class="w-full text-sm border border-gray-200">
              <thead class="bg-gray-50">
                <tr>
                  <th class="p-2 text-left font-semibold">#</th>
                  <th class="p-2 text-left font-semibold" style="min-width:200px">Description</th>
                  <th class="p-2 text-left font-semibold" style="width:90px">UOM</th>
                  <th class="p-2 text-right font-semibold" style="width:80px">Qty</th>
                  <th class="p-2 text-right font-semibold" style="width:130px">Rate (₹)</th>
                  <th class="p-2 text-right font-semibold" style="width:80px">Disc %</th>
                  <th class="p-2 text-left font-semibold" style="width:90px">GST</th>
                  <th class="p-2 text-left font-semibold" style="width:110px">Supply</th>
                  <th class="p-2 text-left font-semibold" style="width:110px">HSN/SAC</th>
                  <th class="p-2 text-right font-semibold" style="width:130px">Total</th>
                  <th class="p-2" style="width:50px"></th>
                </tr>
              </thead>
              <tbody formArrayName="lines">
                @for (line of linesArray.controls; track $index; let i = $index) {
                  <tr [formGroupName]="i" class="border-t border-gray-100">
                    <td class="p-2 text-gray-500">{{ i + 1 }}</td>
                    <td class="p-2">
                      <div class="flex gap-1">
                        <input pInputText formControlName="description" class="w-full p-1 text-sm" placeholder="Type or search OEM catalog..." />
                        <button type="button" class="p-1 text-gray-400 hover:text-indigo-600 shrink-0" (click)="openOemPicker(i)" pTooltip="Pick from OEM catalog" tooltipPosition="top">
                          <i class="pi pi-search text-xs"></i>
                        </button>
                      </div>
                    </td>
                    <td class="p-2"><p-select formControlName="uom" [options]="uomOptions" optionLabel="label" optionValue="value" styleClass="w-full" /></td>
                    <td class="p-2"><p-inputNumber formControlName="qty" [min]="0" styleClass="w-full" inputStyleClass="text-right text-sm p-1" /></td>
                    <td class="p-2"><p-inputNumber formControlName="rateRupees" [min]="0" [minFractionDigits]="2" [maxFractionDigits]="2" mode="decimal" styleClass="w-full" inputStyleClass="text-right text-sm p-1" locale="en-IN" /></td>
                    <td class="p-2"><p-inputNumber formControlName="discountPct" [min]="0" [max]="100" styleClass="w-full" inputStyleClass="text-right text-sm p-1" /></td>
                    <td class="p-2"><p-select formControlName="gstRateBps" [options]="gstRates" optionLabel="label" optionValue="value" styleClass="w-full" /></td>
                    <td class="p-2"><p-select formControlName="supplyType" [options]="supplyTypes" optionLabel="label" optionValue="value" styleClass="w-full" /></td>
                    <td class="p-2"><input pInputText formControlName="hsnSacCode" class="w-full p-1 text-sm" /></td>
                    <td class="p-2 text-right font-mono font-medium">{{ formatRupees(lineTotal(i)) }}</td>
                    <td class="p-2"><p-button icon="pi pi-trash" [rounded]="true" [text]="true" severity="danger" size="small" (onClick)="removeLine(i)" /></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          @if (linesArray.length > 0) {
            <div class="flex justify-end mb-6">
              <div class="bg-gray-50 rounded-lg p-4 w-72">
                <div class="flex justify-between text-sm mb-1"><span>Subtotal</span><span class="font-mono">{{ formatRupees(getSubtotal()) }}</span></div>
                <div class="flex justify-between text-sm mb-1"><span>GST</span><span class="font-mono">{{ formatRupees(getGstTotal()) }}</span></div>
                <div class="flex justify-between text-base font-bold border-t pt-2"><span>Grand Total</span><span class="font-mono">{{ formatRupees(getGrandTotal()) }}</span></div>
              </div>
            </div>
          }

          <div class="flex gap-3">
            <p-button [label]="isNew() ? 'Save Quotation' : 'Update Quotation'" icon="pi pi-check" (onClick)="save()" [loading]="saving()" [disabled]="form.invalid || linesArray.length === 0" />
            <p-button label="Cancel" icon="pi pi-times" severity="secondary" [text]="true" (onClick)="router.navigate(['/procurement/quotations'])" />
          </div>
        </form>
      </div>
    }

    <!-- OEM Catalog Picker Dialog -->
    <p-dialog [(visible)]="oemPickerVisible" header="Pick from OEM Catalog" [modal]="true" [style]="{ width: '700px' }" appendTo="body">
      <div class="mb-3">
        <p-autoComplete [(ngModel)]="oemSearchText" [suggestions]="oemSuggestions()" (completeMethod)="searchOemCatalog($event)"
          field="modelName" [forceSelection]="true" placeholder="Search model, part no, brand..." styleClass="w-full"
          [inputStyleClass]="'w-full'" appendTo="body" (onSelect)="onOemPick($event)">
          <ng-template let-item pTemplate="item">
            <div class="flex flex-col py-1">
              <div class="flex justify-between gap-2">
                <span class="text-sm font-medium">{{ item.modelName }}</span>
                <span class="text-sm font-mono text-indigo-600">₹{{ (item.unitPricePaise / 100) | number:'1.2-2' }}</span>
              </div>
              <div class="text-xs text-gray-400">
                {{ item.vendor.name }} · {{ item.brand || '' }} {{ item.oemPartNo ? '· ' + item.oemPartNo : '' }}
                · Master: {{ item.masterItem.name }}
              </div>
            </div>
          </ng-template>
        </p-autoComplete>
      </div>
      <p class="text-xs text-gray-400">Search and select an OEM catalog item. The line fields will be auto-filled.</p>
    </p-dialog>
  `,
  styles: [`:host { display: block; padding: 1.5rem; }`],
})
export class QuotationDetailComponent implements OnInit {
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private cdr = inject(ChangeDetectorRef);
  router = inject(Router);
  private msg = inject(MessageService);
  environment = environment;

  quotation = signal<Quotation | null>(null);
  vendors = signal<VendorOption[]>([]);
  loading = signal(false);
  saving = signal(false);
  isNew = signal(true);
  serverError = '';
  selectedFile: File | null = null;

  gstRates = GST_RATES;
  supplyTypes = SUPPLY_TYPES;
  uomOptions = UOM_OPTIONS;

  form = this.fb.group({
    quotationNo: ['', Validators.required],
    vendorId: ['', Validators.required],
    referenceNo: [''],
    quotationDate: [new Date(), Validators.required],
    validUntil: [null as Date | null],
    paymentTermsDays: [30 as number | null],
    deliveryDays: [null as number | null],
    notes: [''],
    lines: this.fb.array<ReturnType<typeof this.createLineGroup>>([]),
  });

  get linesArray() { return this.form.get('lines') as FormArray; }

  ngOnInit() {
    this.loadVendors();
    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new') {
      this.isNew.set(false);
      this.loadQuotation(id);
    } else {
      this.addLine();
    }
  }

  loadVendors() {
    this.http.get<{ data: VendorOption[] }>(`${environment.apiBaseUrl}/vendors?status=ACTIVE&limit=200`).subscribe({
      next: (r) => this.vendors.set(r.data),
    });
  }

  loadQuotation(id: string) {
    this.loading.set(true);
    this.http.get<{ data: Quotation }>(`${environment.apiBaseUrl}/quotations/${id}`).subscribe({
      next: (r) => {
        const q = r.data;
        this.quotation.set(q);
        this.form.patchValue({
          quotationNo: q.quotationNo,
          vendorId: q.vendorId,
          referenceNo: q.referenceNo || '',
          quotationDate: new Date(q.quotationDate),
          validUntil: q.validUntil ? new Date(q.validUntil) : null,
          paymentTermsDays: q.paymentTermsDays,
          deliveryDays: q.deliveryDays,
          notes: q.notes || '',
        });
        this.linesArray.clear();
        for (const line of q.lines) {
          const g = this.createLineGroup();
          g.patchValue({
            description: line.description,
            uom: line.uom,
            qty: line.qty,
            rateRupees: line.ratePaise / 100,
            discountPct: line.discountPct,
            gstRateBps: line.gstRateBps,
            supplyType: line.supplyType,
            hsnSacCode: line.hsnSacCode || '',
          });
          this.linesArray.push(g);
        }
        this.loading.set(false);
      },
      error: () => { this.msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to load quotation' }); this.loading.set(false); },
    });
  }

  createLineGroup() {
    return this.fb.group({
      description: ['', Validators.required],
      uom: ['NOS'],
      qty: [1, [Validators.required, Validators.min(0.01)]],
      rateRupees: [0, [Validators.required, Validators.min(0)]],
      discountPct: [0],
      gstRateBps: [1800],
      supplyType: ['INTRA'],
      hsnSacCode: [''],
    });
  }

  addLine() { this.linesArray.push(this.createLineGroup()); }
  removeLine(i: number) { this.linesArray.removeAt(i); }

  // OEM Catalog Picker
  oemPickerVisible = false;
  oemPickerLineIndex = -1;
  oemSearchText = '';
  oemSuggestions = signal<OemOption[]>([]);

  openOemPicker(lineIndex: number): void {
    this.oemPickerLineIndex = lineIndex;
    this.oemSearchText = '';
    this.oemPickerVisible = true;
  }

  searchOemCatalog(event: { query: string }): void {
    this.http.get<{ data: OemOption[] }>(`${environment.apiBaseUrl}/oem-catalog?q=${encodeURIComponent(event.query)}&limit=20&status=ACTIVE`).subscribe({
      next: (r) => this.oemSuggestions.set(r.data),
    });
  }

  onOemPick(event: { value: OemOption }): void {
    const oem = event.value;
    if (!oem || this.oemPickerLineIndex < 0) return;
    const g = this.linesArray.at(this.oemPickerLineIndex);
    g.patchValue({
      description: oem.modelName + (oem.brand ? ` (${oem.brand})` : '') + (oem.oemPartNo ? ` [${oem.oemPartNo}]` : ''),
      uom: oem.uom,
      rateRupees: oem.unitPricePaise / 100,
      gstRateBps: oem.gstRateBps,
      hsnSacCode: oem.hsn || '',
    });
    this.oemPickerVisible = false;
  }

  lineTotalBase(i: number): number {
    const g = this.linesArray.at(i);
    const qty = g.get('qty')?.value || 0;
    const rate = Math.round((g.get('rateRupees')?.value || 0) * 100);
    const disc = g.get('discountPct')?.value || 0;
    return Math.round(qty * rate * (1 - disc / 100));
  }

  lineTotal(i: number): number {
    const base = this.lineTotalBase(i);
    const gstBps = this.linesArray.at(i).get('gstRateBps')?.value || 0;
    return base + Math.round(base * gstBps / 10000);
  }

  getSubtotal(): number {
    let total = 0;
    for (let i = 0; i < this.linesArray.length; i++) total += this.lineTotalBase(i);
    return total;
  }

  getGstTotal(): number {
    let total = 0;
    for (let i = 0; i < this.linesArray.length; i++) {
      const base = this.lineTotalBase(i);
      const gstBps = this.linesArray.at(i).get('gstRateBps')?.value || 0;
      total += Math.round(base * gstBps / 10000);
    }
    return total;
  }

  getGrandTotal(): number { return this.getSubtotal() + this.getGstTotal(); }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    this.selectedFile = input.files?.[0] ?? null;
  }

  downloadAttachment() {
    const q = this.quotation();
    if (!q) return;
    window.open(`${environment.apiBaseUrl}/quotations/${q.id}/attachment/download`, '_blank');
  }

  save() {
    if (this.form.invalid || this.linesArray.length === 0) return;
    this.saving.set(true);
    this.serverError = '';
    const v = this.form.getRawValue();

    const toDateStr = (d: Date | null | undefined): string | undefined => {
      if (!d) return undefined;
      const dt = d instanceof Date ? d : new Date(d);
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const day = String(dt.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    const body: Record<string, unknown> = {
      quotationNo: v.quotationNo || undefined,
      vendorId: v.vendorId,
      referenceNo: v.referenceNo || undefined,
      quotationDate: toDateStr(v.quotationDate as Date),
      validUntil: toDateStr(v.validUntil as Date | null) || undefined,
      paymentTermsDays: v.paymentTermsDays ?? undefined,
      deliveryDays: v.deliveryDays ?? undefined,
      notes: v.notes || undefined,
      lines: v.lines.map((l: Record<string, unknown>) => ({
        description: l['description'],
        uom: l['uom'] || 'NOS',
        qty: l['qty'] || 1,
        ratePaise: Math.round(((l['rateRupees'] as number) || 0) * 100),
        discountPct: l['discountPct'] || 0,
        gstRateBps: l['gstRateBps'] ?? 1800,
        supplyType: l['supplyType'] || 'INTRA',
        hsnSacCode: l['hsnSacCode'] || undefined,
      })),
    };

    // Strip undefined values
    for (const key of Object.keys(body)) {
      if (body[key] === undefined) delete body[key];
    }

    const q = this.quotation();
    const req = q
      ? this.http.put<{ data: { id: string; quotationNo: string } }>(`${environment.apiBaseUrl}/quotations/${q.id}`, body)
      : this.http.post<{ data: { id: string; quotationNo: string } }>(`${environment.apiBaseUrl}/quotations`, body);

    req.subscribe({
      next: (r) => {
        const savedId = r.data.id;
        // Upload attachment if selected
        if (this.selectedFile) {
          const fd = new FormData();
          fd.append('file', this.selectedFile);
          this.http.post(`${environment.apiBaseUrl}/quotations/${savedId}/attachment`, fd).subscribe({
            next: () => {
              this.msg.add({ severity: 'success', summary: 'Saved', detail: `Quotation ${r.data.quotationNo} saved with attachment` });
              this.saving.set(false);
              this.router.navigate(['/procurement/quotations', savedId]);
            },
            error: () => {
              this.msg.add({ severity: 'warn', summary: 'Saved', detail: 'Quotation saved but attachment upload failed' });
              this.saving.set(false);
              this.router.navigate(['/procurement/quotations', savedId]);
            },
          });
        } else {
          this.msg.add({ severity: 'success', summary: 'Saved', detail: `Quotation ${r.data.quotationNo} saved` });
          this.saving.set(false);
          this.router.navigate(['/procurement/quotations', savedId]);
        }
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        const details = err.error?.error?.details;
        if (details?.length) {
          this.serverError = details.map((d: { path: string; message: string }) => `${d.path}: ${d.message}`).join(' | ');
        } else {
          this.serverError = err.error?.error?.message ?? 'Failed to save quotation';
        }
        this.msg.add({ severity: 'error', summary: 'Error', detail: this.serverError });
        this.cdr.markForCheck();
      },
    });
  }

  formatRupees(paise: number) { return '\u20B9' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 }); }
}
