import { Component, ChangeDetectionStrategy, inject, signal, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { DatePickerModule } from 'primeng/datepicker';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { ToastModule } from 'primeng/toast';
import { RadioButtonModule } from 'primeng/radiobutton';
import { MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';

interface VendorOption { id: string; name: string; }
interface QuotationOption { id: string; quotationNo: string; quotationDate: string; grandTotalPaise: number; lineCount: number; }
interface SheetData { name: string; headers: string[]; sampleRows: unknown[][]; totalRows: number; }

interface MappedLine {
  description: string; uom: string; qty: number; rate: number;
  discountPct: number; gstRatePct: number | null; hsnSacCode: string;
  _valid: boolean;
}

@Component({
  selector: 'app-quotation-import',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, DialogModule, ButtonModule, SelectModule, InputTextModule,
    InputNumberModule, DatePickerModule, TableModule, TagModule, TooltipModule, ToastModule, RadioButtonModule],
  providers: [MessageService],
  template: `
    <p-toast />
    <p-dialog header="Import Quotation from Excel" [(visible)]="visible" [modal]="true" [style]="{width:'90vw', maxWidth:'1100px'}"
      [dismissableMask]="true" (onHide)="onClose()" appendTo="body">

      <!-- Step 1: Vendor, Mode, File -->
      @if (step() === 1) {
        <div class="grid grid-cols-2 gap-6 mb-6">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Vendor <span class="text-red-500">*</span></label>
            <p-select appendTo="body" [options]="vendors()" [(ngModel)]="selectedVendorId" optionLabel="name" optionValue="id"
              placeholder="Select vendor..." [filter]="true" filterBy="name" styleClass="w-full" (onChange)="onVendorChange()" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Price Date <span class="text-red-500">*</span></label>
            <p-datepicker [(ngModel)]="priceDate" dateFormat="dd-M-yy" [showIcon]="true" styleClass="w-full" appendTo="body" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Default GST %</label>
            <p-inputNumber [(ngModel)]="defaultGstPct" [min]="0" [max]="50" [minFractionDigits]="0" [maxFractionDigits]="2" suffix="%" styleClass="w-full" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Import Mode</label>
            <div class="flex gap-4 mt-2">
              <div class="flex items-center gap-2">
                <p-radioButton name="importMode" value="create" [(ngModel)]="importMode" inputId="modeCreate" />
                <label for="modeCreate" class="text-sm">Create new quotation</label>
              </div>
              <div class="flex items-center gap-2">
                <p-radioButton name="importMode" value="update" [(ngModel)]="importMode" inputId="modeUpdate"
                  [disabled]="vendorQuotations().length === 0" />
                <label for="modeUpdate" class="text-sm" [class.text-gray-400]="vendorQuotations().length === 0">Update existing</label>
              </div>
            </div>
          </div>
        </div>

        @if (importMode === 'update' && vendorQuotations().length > 0) {
          <div class="mb-6">
            <label class="block text-sm font-medium text-gray-700 mb-1">Select Quotation to Update</label>
            <p-select appendTo="body" [options]="vendorQuotations()" [(ngModel)]="selectedQuotationId"
              optionValue="id" styleClass="w-full" placeholder="Select quotation...">
              <ng-template pTemplate="item" let-q>
                <div class="flex justify-between w-full gap-4">
                  <span class="font-mono font-semibold text-sm">{{ q.quotationNo }}</span>
                  <span class="text-xs text-gray-500">{{ q.quotationDate | date:'dd-MMM-yyyy' }}</span>
                  <span class="text-xs text-gray-500">{{ q.lineCount }} lines</span>
                </div>
              </ng-template>
              <ng-template pTemplate="selectedItem" let-q>
                <span class="font-mono font-semibold text-sm">{{ q.quotationNo }}</span>
                <span class="text-xs text-gray-500 ml-2">{{ q.quotationDate | date:'dd-MMM-yyyy' }} · {{ q.lineCount }} lines</span>
              </ng-template>
            </p-select>
          </div>
        }

        <div class="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center mb-4"
          (dragover)="$event.preventDefault(); dragOver = true" (dragleave)="dragOver = false"
          (drop)="onFileDrop($event)" [class.border-indigo-400]="dragOver" [class.bg-indigo-50]="dragOver">
          @if (!uploadedFile) {
            <i class="pi pi-file-excel text-4xl text-gray-400 mb-3"></i>
            <p class="text-gray-600 mb-2">Drag & drop an Excel file here, or</p>
            <label class="cursor-pointer text-indigo-600 font-medium hover:underline">
              Browse files
              <input type="file" accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.webp" class="hidden" (change)="onFileSelect($event)" />
            </label>
            <p class="text-xs text-gray-400 mt-2">Supports .xlsx, .xls, .csv</p>
          } @else {
            <div class="flex items-center justify-center gap-3">
              <i class="pi pi-file-excel text-2xl text-green-600"></i>
              <span class="font-medium">{{ uploadedFile.name }}</span>
              <span class="text-xs text-gray-400">({{ (uploadedFile.size / 1024).toFixed(0) }} KB)</span>
              <button class="text-red-500 hover:text-red-700" (click)="clearFile()"><i class="pi pi-times"></i></button>
            </div>
          }
        </div>

        @if (uploading()) {
          <div class="flex items-center gap-2 text-gray-500 py-4 justify-center"><i class="pi pi-spin pi-spinner"></i> Parsing file...</div>
        }

        <div class="flex justify-end gap-3 mt-4">
          <p-button label="Cancel" severity="secondary" (onClick)="onClose()" />
          <p-button label="Next: Map Columns" icon="pi pi-arrow-right" iconPos="right"
            [disabled]="!canProceedStep1()"
            (onClick)="goToMapping()" />
        </div>
      }

      <!-- Step 2: Column Mapping + Defaults -->
      @if (step() === 2) {
        @if (sheets().length > 1) {
          <div class="flex items-center gap-3 mb-3">
            <label class="text-sm font-medium text-gray-700">Sheet:</label>
            <p-select appendTo="body" [options]="sheets()" [(ngModel)]="selectedSheetIdx" optionLabel="name"
              [optionValue]="'_idx'" styleClass="w-56" (onChange)="onSheetChange()" />
          </div>
        }
        <p class="text-sm text-gray-500 mb-3">{{ activeSheet()?.totalRows }} rows in "{{ activeSheet()?.name }}"</p>

        <div class="overflow-x-auto border border-gray-200 rounded-lg mb-4">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-gray-50 border-b">
                <th class="px-3 py-2 text-left font-semibold" style="width:170px">System Field</th>
                <th class="px-3 py-2 text-left font-semibold" style="width:220px">Excel Column</th>
                <th class="px-3 py-2 text-left font-semibold">Sample Values</th>
                <th class="px-3 py-2 text-left font-semibold" style="width:160px">Default Value</th>
              </tr>
            </thead>
            <tbody>
              @for (field of mappableFields; track field.key) {
                <tr class="border-b border-gray-100" [class.bg-indigo-50]="fieldMap[field.key] >= 0">
                  <td class="px-3 py-2 font-medium text-gray-700">
                    {{ field.label }}
                    @if (field.required) { <span class="text-red-500">*</span> }
                  </td>
                  <td class="px-3 py-2">
                    <p-select appendTo="body" [options]="excelColumnOptions()" [(ngModel)]="fieldMap[field.key]"
                      optionLabel="label" optionValue="value" placeholder="— Not mapped —" styleClass="w-full" [showClear]="true" />
                  </td>
                  <td class="px-3 py-2 text-xs text-gray-500">
                    @if (fieldMap[field.key] >= 0) {
                      @for (row of activeSheet()?.sampleRows?.slice(0, 3) ?? []; track $index) {
                        <span class="inline-block bg-gray-100 rounded px-1.5 py-0.5 mr-1 mb-0.5">{{ $any(row)[fieldMap[field.key]] ?? '' }}</span>
                      }
                    } @else {
                      <span class="text-gray-300 italic">No column selected</span>
                    }
                  </td>
                  <td class="px-3 py-2">
                    @if (fieldMap[field.key] < 0) {
                      <input pInputText [(ngModel)]="defaults[field.key]" class="w-full text-sm p-1" placeholder="Default..." />
                    } @else {
                      <span class="text-xs text-gray-300">—</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        @if (mappingError) {
          <div class="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2"><i class="pi pi-exclamation-triangle mr-1"></i> {{ mappingError }}</div>
        }

        <div class="flex justify-between mt-4">
          <p-button label="Back" icon="pi pi-arrow-left" severity="secondary" (onClick)="step.set(1)" />
          <p-button label="Next: Preview" icon="pi pi-arrow-right" iconPos="right" (onClick)="generatePreview()" />
        </div>
      }

      <!-- Step 3: Preview & Import -->
      @if (step() === 3) {
        <div class="mb-3 flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-600">
              <span class="font-semibold text-green-700">{{ validCount() }}</span> valid lines,
              @if (invalidCount() > 0) {
                <span class="font-semibold text-red-600">{{ invalidCount() }}</span> invalid (will be skipped)
              }
              out of {{ previewLines().length }} total
            </p>
          </div>
          <div class="flex items-center gap-2">
            <p-tag [value]="vendorName()" severity="info" />
            <p-tag [value]="importMode === 'update' ? 'Update' : 'New'" [severity]="importMode === 'update' ? 'warn' : 'success'" />
          </div>
        </div>

        <div class="overflow-x-auto border border-gray-200 rounded-lg" style="max-height:400px; overflow-y:auto">
          <table class="w-full text-sm">
            <thead class="sticky top-0 z-10">
              <tr class="bg-gray-50 border-b">
                <th class="px-2 py-2 w-8">#</th>
                <th class="px-2 py-2 text-left">Description</th>
                <th class="px-2 py-2">UOM</th>
                <th class="px-2 py-2 text-right">Qty</th>
                <th class="px-2 py-2 text-right">Rate (₹)</th>
                <th class="px-2 py-2 text-right">Disc %</th>
                <th class="px-2 py-2 text-right">GST %</th>
                <th class="px-2 py-2">HSN</th>
                <th class="px-2 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              @for (line of previewLines(); track $index) {
                <tr class="border-b border-gray-100" [class.bg-red-50]="!line._valid" [class.text-red-400]="!line._valid">
                  <td class="px-2 py-1.5 text-gray-400 text-xs">{{ $index + 1 }}</td>
                  <td class="px-2 py-1.5 max-w-xs truncate" [pTooltip]="line.description" tooltipPosition="top">{{ line.description }}</td>
                  <td class="px-2 py-1.5 text-center">{{ line.uom }}</td>
                  <td class="px-2 py-1.5 text-right font-mono">{{ line.qty }}</td>
                  <td class="px-2 py-1.5 text-right font-mono">{{ line.rate | number:'1.2-2' }}</td>
                  <td class="px-2 py-1.5 text-right">{{ line.discountPct || '' }}</td>
                  <td class="px-2 py-1.5 text-right">{{ line.gstRatePct != null ? line.gstRatePct + '%' : '—' }}</td>
                  <td class="px-2 py-1.5">{{ line.hsnSacCode }}</td>
                  <td class="px-2 py-1.5">
                    @if (!line._valid) {
                      <i class="pi pi-exclamation-circle text-red-500" pTooltip="Missing description or rate" tooltipPosition="left"></i>
                    } @else {
                      <i class="pi pi-check-circle text-green-500"></i>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div class="flex justify-between mt-4">
          <p-button label="Back" icon="pi pi-arrow-left" severity="secondary" (onClick)="step.set(2)" />
          <p-button [label]="importMode === 'update' ? 'Update Quotation (' + validCount() + ' lines)' : 'Create Quotation (' + validCount() + ' lines)'"
            icon="pi pi-check" [disabled]="validCount() === 0 || importing()"
            [loading]="importing()" (onClick)="doImport()" />
        </div>
      }
    </p-dialog>
  `,
})
export class QuotationImportComponent {
  private http = inject(HttpClient);
  private router = inject(Router);
  private msg = inject(MessageService);

  visible = false;
  step = signal(1);
  vendors = signal<VendorOption[]>([]);
  vendorQuotations = signal<QuotationOption[]>([]);
  sheets = signal<(SheetData & { _idx: number })[]>([]);
  previewLines = signal<MappedLine[]>([]);
  uploading = signal(false);
  importing = signal(false);

  imported = output<string>();

  // Step 1
  selectedVendorId = '';
  priceDate: Date | null = new Date();
  defaultGstPct = 18;
  importMode: 'create' | 'update' = 'create';
  selectedQuotationId = '';
  uploadedFile: File | null = null;
  dragOver = false;

  // Step 2
  selectedSheetIdx = 0;
  mappingError = '';

  mappableFields = [
    { key: 'description', label: 'Description / Item Name', required: true },
    { key: 'uom', label: 'Unit of Measure (UOM)', required: false },
    { key: 'qty', label: 'Quantity', required: false },
    { key: 'rate', label: 'Rate (₹)', required: true },
    { key: 'discountPct', label: 'Discount %', required: false },
    { key: 'gstRatePct', label: 'GST Rate %', required: false },
    { key: 'hsnSacCode', label: 'HSN / SAC Code', required: false },
  ];

  fieldMap: Record<string, number> = {};
  defaults: Record<string, string> = {};
  excelColumnOptions = signal<Array<{ label: string; value: number }>>([]);

  // Helpers
  validCount = () => this.previewLines().filter(l => l._valid).length;
  invalidCount = () => this.previewLines().filter(l => !l._valid).length;
  vendorName = () => this.vendors().find(v => v.id === this.selectedVendorId)?.name ?? '';
  activeSheet = () => this.sheets().find(s => s._idx === this.selectedSheetIdx) ?? this.sheets()[0];

  isMapped(field: string): boolean {
    return (this.fieldMap[field] ?? -1) >= 0;
  }

  canProceedStep1(): boolean {
    if (!this.selectedVendorId || !this.priceDate || !this.uploadedFile || !this.sheets().length) return false;
    if (this.importMode === 'update' && !this.selectedQuotationId) return false;
    return true;
  }

  open(): void {
    this.visible = true;
    this.step.set(1);
    this.sheets.set([]);
    this.previewLines.set([]);
    this.uploadedFile = null;
    this.fieldMap = {};
    this.defaults = { qty: '1', uom: 'NOS', rate: '0', discountPct: '0', gstRatePct: '18' };
    for (const f of this.mappableFields) this.fieldMap[f.key] = -1;
    this.mappingError = '';
    this.selectedVendorId = '';
    this.selectedQuotationId = '';
    this.priceDate = new Date();
    this.importMode = 'create';
    this.loadVendors();
  }

  onClose(): void {
    this.visible = false;
  }

  private loadVendors(): void {
    this.http.get<{ data: VendorOption[] }>(`${environment.apiBaseUrl}/vendors?limit=200`).subscribe({
      next: (r) => this.vendors.set(r.data),
    });
  }

  onVendorChange(): void {
    this.selectedQuotationId = '';
    this.vendorQuotations.set([]);
    if (!this.selectedVendorId) return;
    this.http.get<{ data: QuotationOption[] }>(`${environment.apiBaseUrl}/quotations?vendorId=${this.selectedVendorId}&limit=50`).subscribe({
      next: (r) => this.vendorQuotations.set(r.data),
    });
  }

  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.uploadedFile = input.files[0]!;
      this.parseFile();
    }
  }

  onFileDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver = false;
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      this.uploadedFile = file;
      this.parseFile();
    }
  }

  clearFile(): void {
    this.uploadedFile = null;
    this.sheets.set([]);
    for (const f of this.mappableFields) this.fieldMap[f.key] = -1;
  }

  isAiSource = false;

  private parseFile(): void {
    if (!this.uploadedFile) return;
    this.uploading.set(true);
    const formData = new FormData();
    formData.append('file', this.uploadedFile);

    const ext = this.uploadedFile.name.split('.').pop()?.toLowerCase() ?? '';
    const isImage = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tiff'].includes(ext);
    this.isAiSource = isImage;

    const endpoint = isImage
      ? `${environment.apiBaseUrl}/quotations/import/extract`
      : `${environment.apiBaseUrl}/quotations/import/preview`;

    this.http.post<{ data: { sheets: SheetData[] } }>(endpoint, formData).subscribe({
      next: (r) => {
        this.sheets.set(r.data.sheets.map((s, i) => ({ ...s, _idx: i })));
        this.selectedSheetIdx = 0;
        this.autoMapColumns();
        this.uploading.set(false);
        if (isImage) {
          this.msg.add({ severity: 'info', summary: 'AI Extracted', detail: `${r.data.sheets[0]?.totalRows ?? 0} rows extracted via AI` });
        }
      },
      error: (err) => {
        this.msg.add({ severity: 'error', summary: 'Parse Error', detail: err.error?.error?.message || 'Failed to parse file' });
        this.uploading.set(false);
      },
    });
  }

  private autoMapColumns(): void {
    const sheet = this.activeSheet();
    if (!sheet) return;

    this.excelColumnOptions.set(
      sheet.headers.map((h, i) => ({ label: h || `Column ${i + 1}`, value: i }))
    );

    for (const f of this.mappableFields) this.fieldMap[f.key] = -1;

    const matchers: Array<{ key: string; pattern: RegExp }> = [
      { key: 'description', pattern: /desc|item\s*name|particular|material|product\s*name/i },
      { key: 'uom', pattern: /^uom$|unit\s*of\s*measure|^unit$/i },
      { key: 'qty', pattern: /^qty$|quantity|^nos$/i },
      { key: 'rate', pattern: /rate|price|unit\s*price|unit\s*rate|mrp/i },
      { key: 'discountPct', pattern: /disc|discount/i },
      { key: 'gstRatePct', pattern: /gst|tax\s*%|tax\s*rate/i },
      { key: 'hsnSacCode', pattern: /hsn|sac/i },
    ];

    const usedCols = new Set<number>();
    for (const m of matchers) {
      for (let i = 0; i < sheet.headers.length; i++) {
        if (usedCols.has(i)) continue;
        if (m.pattern.test(sheet.headers[i]!.toLowerCase().trim())) {
          this.fieldMap[m.key] = i;
          usedCols.add(i);
          break;
        }
      }
    }
  }

  goToMapping(): void {
    if (!this.sheets().length) return;
    this.step.set(2);
  }

  onSheetChange(): void {
    this.autoMapColumns();
  }

  generatePreview(): void {
    if (this.fieldMap['description'] < 0) { this.mappingError = 'Map an Excel column to "Description / Item Name"'; return; }
    if (this.fieldMap['rate'] < 0 && !this.defaults['rate']) { this.mappingError = 'Map an Excel column to "Rate" or set a default'; return; }
    this.mappingError = '';

    const sheet = this.activeSheet();
    if (!sheet) return;

    this.buildPreviewFromSheet(sheet);
    this.step.set(3);
  }

  private buildPreviewFromSheet(sheet: SheetData): void {
    const lines: MappedLine[] = [];

    for (const row of sheet.sampleRows) {
      const arr = row as unknown[];
      const line = this.mapSingleRow(arr);
      if (line) lines.push(line);
    }

    this.previewLines.set(lines);
  }

  private getField(arr: unknown[], field: string): string {
    const idx = this.fieldMap[field] ?? -1;
    if (idx >= 0 && idx < arr.length) return String(arr[idx] ?? '').trim();
    return this.defaults[field] ?? '';
  }

  private mapSingleRow(arr: unknown[]): MappedLine | null {
    const desc = this.getField(arr, 'description');
    if (!desc) return null;

    const rate = parseFloat(this.getField(arr, 'rate') || '0') || 0;
    const qty = parseFloat(this.getField(arr, 'qty') || '1') || 1;
    const uom = this.getField(arr, 'uom') || 'NOS';
    const discountPct = parseFloat(this.getField(arr, 'discountPct') || '0') || 0;
    const gstStr = this.getField(arr, 'gstRatePct');
    const gstRatePct = gstStr ? (parseFloat(gstStr) || null) : null;
    const hsnSacCode = this.getField(arr, 'hsnSacCode');

    return { description: desc, uom, qty, rate, discountPct, gstRatePct, hsnSacCode, _valid: desc.length > 0 && rate > 0 };
  }

  doImport(): void {
    if (!this.uploadedFile || !this.selectedVendorId || !this.priceDate) return;
    this.importing.set(true);

    // Get ALL rows from server
    const formData = new FormData();
    formData.append('file', this.uploadedFile);

    const fullEndpoint = this.isAiSource
      ? `${environment.apiBaseUrl}/quotations/import/extract?full=true`
      : `${environment.apiBaseUrl}/quotations/import/preview?full=true`;

    this.http.post<{ data: { sheets: (SheetData & { allRows?: unknown[][] })[] } }>(fullEndpoint, formData).subscribe({
      next: (r) => {
        const sheet = r.data.sheets[this.selectedSheetIdx] ?? r.data.sheets[0];
        if (!sheet) { this.importing.set(false); return; }

        const allRows = (sheet as { allRows?: unknown[][] }).allRows ?? sheet.sampleRows;
        const lines = this.mapAllRows(allRows);

        if (lines.length === 0) {
          this.msg.add({ severity: 'warn', summary: 'No Data', detail: 'No valid lines to import' });
          this.importing.set(false);
          return;
        }

        const body = {
          vendorId: this.selectedVendorId,
          quotationDate: this.formatDate(this.priceDate!),
          defaultGstRateBps: Math.round(parseFloat(this.defaults['gstRatePct'] || '18') * 100),
          lines,
          ...(this.importMode === 'update' ? { quotationId: this.selectedQuotationId } : {}),
        };

        const url = this.importMode === 'update'
          ? `${environment.apiBaseUrl}/quotations/import?mode=update`
          : `${environment.apiBaseUrl}/quotations/import`;

        this.http.post<{ data: { id: string; quotationNo: string; linesImported: number } }>(url, body).subscribe({
          next: (result) => {
            const action = this.importMode === 'update' ? 'Updated' : 'Created';
            this.msg.add({ severity: 'success', summary: action, detail: `Quotation ${result.data.quotationNo} — ${result.data.linesImported} lines` });
            this.importing.set(false);
            this.visible = false;
            this.imported.emit(result.data.id);
            this.router.navigate(['/procurement/quotations', result.data.id]);
          },
          error: (err) => {
            this.msg.add({ severity: 'error', summary: 'Import Failed', detail: err.error?.error?.message || 'Server error' });
            this.importing.set(false);
          },
        });
      },
      error: () => {
        this.msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to parse file' });
        this.importing.set(false);
      },
    });
  }

  private mapAllRows(rows: unknown[][]): Array<{ description: string; uom: string; qty: number; ratePaise: number; discountPct: number; gstRateBps?: number; hsnSacCode?: string }> {
    const lines: Array<{ description: string; uom: string; qty: number; ratePaise: number; discountPct: number; gstRateBps?: number; hsnSacCode?: string }> = [];

    for (const row of rows) {
      const arr = row as unknown[];
      const mapped = this.mapSingleRow(arr);
      if (!mapped || !mapped._valid) continue;

      lines.push({
        description: mapped.description,
        uom: mapped.uom,
        qty: mapped.qty,
        ratePaise: Math.round(mapped.rate * 100),
        discountPct: mapped.discountPct,
        gstRateBps: mapped.gstRatePct != null ? Math.round(mapped.gstRatePct * 100) : undefined,
        hsnSacCode: mapped.hsnSacCode || undefined,
      });
    }

    return lines;
  }

  private formatDate(d: Date): string {
    return d.toISOString().slice(0, 10);
  }
}
