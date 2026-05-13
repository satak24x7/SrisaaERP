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
import { AutoCompleteModule } from 'primeng/autocomplete';
import { MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';

interface VendorOption { id: string; name: string; }
interface MasterItemOption { id: string; sku: string; name: string; category: string | null; }
interface SheetData { name: string; headers: string[]; sampleRows: unknown[][]; totalRows: number; allRows?: unknown[][]; }


interface MappedRow {
  modelName: string; oemPartNo: string; brand: string; description: string;
  unitPrice: number; uom: string; hsn: string; gstPct: number | null;
  warranty: string; moq: number; leadTimeDays: number | null;
  masterItem: MasterItemOption | null;
  _valid: boolean;
}

@Component({
  selector: 'app-price-list-import',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, DialogModule, ButtonModule, SelectModule, InputTextModule,
    InputNumberModule, DatePickerModule, TableModule, TagModule, TooltipModule, ToastModule, AutoCompleteModule],
  providers: [MessageService],
  template: `
    <p-toast />
    <p-dialog header="Import Price List from Excel" [(visible)]="visible" [modal]="true" [style]="{width:'95vw', maxWidth:'1200px'}"
      [dismissableMask]="true" (onHide)="onClose()" appendTo="body">

      <!-- Step 1: Vendor + File -->
      @if (step() === 1) {
        <div class="grid grid-cols-3 gap-6 mb-6">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Vendor <span class="text-red-500">*</span></label>
            <p-select appendTo="body" [options]="vendors()" [(ngModel)]="selectedVendorId" optionLabel="name" optionValue="id"
              placeholder="Select vendor..." [filter]="true" filterBy="name" styleClass="w-full" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Price List Name <span class="text-red-500">*</span></label>
            <input pInputText [(ngModel)]="priceListName" class="w-full" placeholder="e.g. Hikvision Q2 2026" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Price Date <span class="text-red-500">*</span></label>
            <p-datepicker [(ngModel)]="priceDate" dateFormat="dd-M-yy" [showIcon]="true" styleClass="w-full" appendTo="body" />
          </div>
        </div>

        <div class="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center mb-4"
          (dragover)="$event.preventDefault(); dragOver = true" (dragleave)="dragOver = false"
          (drop)="onFileDrop($event)" [class.border-indigo-400]="dragOver" [class.bg-indigo-50]="dragOver">
          @if (!uploadedFile) {
            <i class="pi pi-file-excel text-4xl text-gray-400 mb-3"></i>
            <p class="text-gray-600 mb-2">Drag & drop an Excel, PDF or image file, or</p>
            <label class="cursor-pointer text-indigo-600 font-medium hover:underline">
              Browse files
              <input type="file" accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.webp" class="hidden" (change)="onFileSelect($event)" />
            </label>
            <p class="text-xs text-gray-400 mt-2">Excel (.xlsx, .csv) parsed directly · PDF/images extracted via AI</p>
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
          <div class="flex items-center gap-2 text-gray-500 py-4 justify-center"><i class="pi pi-spin pi-spinner"></i> Parsing...</div>
        }
        <div class="flex justify-end gap-3 mt-4">
          <p-button label="Cancel" severity="secondary" (onClick)="onClose()" />
          <p-button label="Next: Map Columns" icon="pi pi-arrow-right" iconPos="right"
            [disabled]="!selectedVendorId || !priceListName || !priceDate || !sheets().length" (onClick)="step.set(2)" />
        </div>
      }

      <!-- Step 2: Column Mapping + Defaults -->
      @if (step() === 2) {
        @if (sheets().length > 1) {
          <div class="flex items-center gap-3 mb-3">
            <label class="text-sm font-medium text-gray-700">Sheet:</label>
            <p-select appendTo="body" [options]="sheets()" [(ngModel)]="selectedSheetIdx" optionLabel="name"
              [optionValue]="'_idx'" styleClass="w-56" (onChange)="autoMapColumns()" />
          </div>
        }
        <p class="text-sm text-gray-500 mb-3">{{ activeSheet()?.totalRows }} rows in "{{ activeSheet()?.name }}"</p>

        <div class="overflow-x-auto border border-gray-200 rounded-lg mb-4">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-gray-50 border-b">
                <th class="px-3 py-2 text-left font-semibold" style="width:180px">System Field</th>
                <th class="px-3 py-2 text-left font-semibold" style="width:220px">Excel Column</th>
                <th class="px-3 py-2 text-left font-semibold">Sample Values</th>
                <th class="px-3 py-2 text-left font-semibold" style="width:180px">Default Value</th>
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
                      optionLabel="label" optionValue="value" placeholder="— Not mapped —" styleClass="w-full" [showClear]="true"
                      (onChange)="onFieldMapChange(field.key)" />
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
          <div class="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2 mb-3"><i class="pi pi-exclamation-triangle mr-1"></i> {{ mappingError }}</div>
        }
        <div class="flex justify-between mt-4">
          <p-button label="Back" icon="pi pi-arrow-left" severity="secondary" (onClick)="step.set(1)" />
          <p-button label="Next: Link Master Items" icon="pi pi-arrow-right" iconPos="right" (onClick)="goToLinking()" />
        </div>
      }

      <!-- Step 3: Master Item Linking -->
      @if (step() === 3) {
        <p class="text-sm text-gray-500 mb-3">
          Link each row to a Master Item. Rows without a master item will be skipped.
          <span class="font-semibold text-green-700 ml-2">{{ linkedCount() }}</span> linked,
          <span class="text-gray-400">{{ mappedRows().length - linkedCount() }} unlinked</span>
        </p>

        <div class="overflow-x-auto border border-gray-200 rounded-lg" style="max-height:450px; overflow-y:auto">
          <table class="w-full text-sm">
            <thead class="sticky top-0 z-10">
              <tr class="bg-gray-50 border-b">
                <th class="px-2 py-2 w-8">#</th>
                <th class="px-2 py-2 text-left">Model</th>
                <th class="px-2 py-2">Part No</th>
                <th class="px-2 py-2">Brand</th>
                <th class="px-2 py-2 text-right">Price (₹)</th>
                <th class="px-2 py-2 text-left" style="min-width:250px">Master Item</th>
              </tr>
            </thead>
            <tbody>
              @for (row of mappedRows(); track $index) {
                <tr class="border-b border-gray-100" [class.bg-green-50]="row.masterItem">
                  <td class="px-2 py-1.5 text-gray-400 text-xs">{{ $index + 1 }}</td>
                  <td class="px-2 py-1.5 max-w-xs truncate" [pTooltip]="row.modelName" tooltipPosition="top">{{ row.modelName }}</td>
                  <td class="px-2 py-1.5 text-center font-mono text-xs">{{ row.oemPartNo || '—' }}</td>
                  <td class="px-2 py-1.5 text-center">{{ row.brand || '—' }}</td>
                  <td class="px-2 py-1.5 text-right font-mono">{{ row.unitPrice | number:'1.2-2' }}</td>
                  <td class="px-2 py-1.5">
                    <div class="flex gap-1 items-center">
                      <p-autoComplete [(ngModel)]="row.masterItem" [suggestions]="masterItemSuggestions()"
                        (completeMethod)="searchMasterItems($event)" field="name" [forceSelection]="true"
                        placeholder="Search item..." styleClass="flex-1" [inputStyleClass]="'text-sm p-1 w-full'" appendTo="body">
                        <ng-template let-item pTemplate="item">
                          <div class="flex justify-between gap-2 w-full">
                            <span class="text-sm">{{ item.name }}</span>
                            <span class="text-xs text-gray-400 font-mono">{{ item.sku }}</span>
                          </div>
                        </ng-template>
                      </p-autoComplete>
                      @if (!row.masterItem) {
                        <button class="p-1 text-indigo-600 hover:text-indigo-800 shrink-0" (click)="createMasterItem(row)"
                          pTooltip="Create as new master item" tooltipPosition="top">
                          <i class="pi pi-plus-circle text-sm"></i>
                        </button>
                      }
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div class="flex justify-between mt-4">
          <p-button label="Back" icon="pi pi-arrow-left" severity="secondary" (onClick)="step.set(2)" />
          <div class="flex gap-2">
            <p-button label="Auto-Link by Name" icon="pi pi-bolt" severity="secondary" (onClick)="autoLinkByName()" [loading]="autoLinking()" pTooltip="Match rows to existing master items by name" tooltipPosition="top" />
            <p-button label="Create All Unlinked" icon="pi pi-plus" severity="secondary" (onClick)="createAllUnlinked()" [loading]="creatingItems()"
              [disabled]="mappedRows().length === linkedCount()" pTooltip="Create new master items for all unlinked rows" tooltipPosition="top" />
            <p-button label="Next: Preview" icon="pi pi-arrow-right" iconPos="right" [disabled]="linkedCount() === 0" (onClick)="step.set(4)" />
          </div>
        </div>
      }

      <!-- Step 4: Preview & Import -->
      @if (step() === 4) {
        <div class="mb-3 flex items-center justify-between">
          <p class="text-sm text-gray-600">
            <span class="font-semibold text-green-700">{{ linkedCount() }}</span> items will be imported.
            @if (mappedRows().length - linkedCount() > 0) {
              <span class="text-gray-400 ml-1">({{ mappedRows().length - linkedCount() }} skipped — no master item)</span>
            }
          </p>
          <p-tag [value]="vendorName()" severity="info" />
        </div>

        <div class="overflow-x-auto border border-gray-200 rounded-lg" style="max-height:400px; overflow-y:auto">
          <table class="w-full text-sm">
            <thead class="sticky top-0 z-10">
              <tr class="bg-gray-50 border-b">
                <th class="px-2 py-2 w-8">#</th>
                <th class="px-2 py-2 text-left">Model</th>
                <th class="px-2 py-2">Part No</th>
                <th class="px-2 py-2">Brand</th>
                <th class="px-2 py-2 text-right">Price (₹)</th>
                <th class="px-2 py-2">UOM</th>
                <th class="px-2 py-2 text-right">GST</th>
                <th class="px-2 py-2 text-left">Master Item</th>
              </tr>
            </thead>
            <tbody>
              @for (row of linkedRows(); track $index) {
                <tr class="border-b border-gray-100">
                  <td class="px-2 py-1.5 text-gray-400 text-xs">{{ $index + 1 }}</td>
                  <td class="px-2 py-1.5 max-w-xs truncate">{{ row.modelName }}</td>
                  <td class="px-2 py-1.5 text-center font-mono text-xs">{{ row.oemPartNo || '—' }}</td>
                  <td class="px-2 py-1.5 text-center">{{ row.brand || '—' }}</td>
                  <td class="px-2 py-1.5 text-right font-mono">{{ row.unitPrice | number:'1.2-2' }}</td>
                  <td class="px-2 py-1.5 text-center">{{ row.uom }}</td>
                  <td class="px-2 py-1.5 text-right">{{ row.gstPct != null ? row.gstPct + '%' : '—' }}</td>
                  <td class="px-2 py-1.5">
                    <span class="text-xs">{{ row.masterItem?.name }}</span>
                    <span class="text-xs text-gray-400 ml-1 font-mono">{{ row.masterItem?.sku }}</span>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div class="flex justify-between mt-4">
          <p-button label="Back" icon="pi pi-arrow-left" severity="secondary" (onClick)="step.set(3)" />
          <p-button label="Import {{ linkedCount() }} Items" icon="pi pi-check" [disabled]="linkedCount() === 0 || importing()"
            [loading]="importing()" (onClick)="doImport()" />
        </div>
      }
    </p-dialog>
  `,
})
export class PriceListImportComponent {
  private http = inject(HttpClient);
  private router = inject(Router);
  private msg = inject(MessageService);

  visible = false;
  step = signal(1);
  vendors = signal<VendorOption[]>([]);
  sheets = signal<(SheetData & { _idx: number })[]>([]);
  mappedRows = signal<MappedRow[]>([]);
  masterItemSuggestions = signal<MasterItemOption[]>([]);
  uploading = signal(false);
  importing = signal(false);
  autoLinking = signal(false);
  creatingItems = signal(false);

  imported = output<void>();

  // Step 1
  selectedVendorId = '';
  priceListName = '';
  priceDate: Date | null = new Date();
  uploadedFile: File | null = null;
  dragOver = false;

  // Step 2
  selectedSheetIdx = 0;
  mappingError = '';

  mappableFields = [
    { key: 'modelName', label: 'Model / Product Name', required: true },
    { key: 'oemPartNo', label: 'OEM Part Number', required: false },
    { key: 'brand', label: 'Brand', required: false },
    { key: 'description', label: 'Description', required: false },
    { key: 'unitPrice', label: 'Unit Price (₹)', required: true },
    { key: 'uom', label: 'UOM', required: false },
    { key: 'hsn', label: 'HSN Code', required: false },
    { key: 'gstPct', label: 'GST %', required: false },
    { key: 'warranty', label: 'Warranty', required: false },
    { key: 'moq', label: 'Min Order Qty', required: false },
    { key: 'leadTimeDays', label: 'Lead Time (Days)', required: false },
  ];

  fieldMap: Record<string, number> = {};  // system field key → Excel column index (-1 = unmapped)
  defaults: Record<string, string> = {};  // system field key → default value string
  excelColumnOptions = signal<Array<{ label: string; value: number }>>([]);

  onFieldMapChange(_key: string): void {
    // no-op, template binding handles it
  }

  // Helpers
  vendorName = () => this.vendors().find(v => v.id === this.selectedVendorId)?.name ?? '';
  activeSheet = () => this.sheets().find(s => s._idx === this.selectedSheetIdx) ?? this.sheets()[0];
  linkedCount = () => this.mappedRows().filter(r => r.masterItem).length;
  linkedRows = () => this.mappedRows().filter(r => r.masterItem);

  isMapped(field: string): boolean { return (this.fieldMap[field] ?? -1) >= 0; }

  open(): void {
    this.visible = true;
    this.step.set(1);
    this.sheets.set([]);
    this.mappedRows.set([]);
    this.uploadedFile = null;
    this.fieldMap = {};
    this.defaults = { uom: 'NOS', gstPct: '18', moq: '1' };
    for (const f of this.mappableFields) this.fieldMap[f.key] = -1;
    this.selectedVendorId = '';
    this.priceListName = '';
    this.priceDate = new Date();
    this.loadVendors();
  }

  onClose(): void { this.visible = false; }

  private loadVendors(): void {
    this.http.get<{ data: VendorOption[] }>(`${environment.apiBaseUrl}/vendors?limit=200`).subscribe({
      next: (r) => this.vendors.set(r.data),
    });
  }

  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) { this.uploadedFile = input.files[0]!; this.parseFile(); }
  }

  onFileDrop(event: DragEvent): void {
    event.preventDefault(); this.dragOver = false;
    const file = event.dataTransfer?.files?.[0];
    if (file) { this.uploadedFile = file; this.parseFile(); }
  }

  clearFile(): void { this.uploadedFile = null; this.sheets.set([]); for (const f of this.mappableFields) this.fieldMap[f.key] = -1; }

  isAiSource = false;

  private parseFile(): void {
    if (!this.uploadedFile) return;
    this.uploading.set(true);
    const fd = new FormData();
    fd.append('file', this.uploadedFile);

    // Determine endpoint based on file type
    const ext = this.uploadedFile.name.split('.').pop()?.toLowerCase() ?? '';
    const isImage = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tiff'].includes(ext);
    const endpoint = isImage
      ? `${environment.apiBaseUrl}/price-lists/import/extract`
      : `${environment.apiBaseUrl}/price-lists/import/preview`;

    this.isAiSource = isImage;

    this.http.post<{ data: { sheets: SheetData[]; source?: string } }>(endpoint, fd).subscribe({
      next: (r) => {
        this.sheets.set(r.data.sheets.map((s, i) => ({ ...s, _idx: i })));
        this.selectedSheetIdx = 0;
        this.autoMapColumns();
        this.uploading.set(false);
        if (isImage) {
          this.msg.add({ severity: 'info', summary: 'AI Extracted', detail: `${r.data.sheets[0]?.totalRows ?? 0} rows extracted via Gemini` });
        }
      },
      error: (err) => {
        this.msg.add({ severity: 'error', summary: 'Parse Error', detail: err.error?.error?.message || 'Failed to parse' });
        this.uploading.set(false);
      },
    });
  }

  autoMapColumns(): void {
    const sheet = this.activeSheet();
    if (!sheet) return;

    // Build Excel column dropdown options
    this.excelColumnOptions.set(
      sheet.headers.map((h, i) => ({ label: h || `Column ${i + 1}`, value: i }))
    );

    // Reset all mappings
    for (const f of this.mappableFields) this.fieldMap[f.key] = -1;

    // Auto-match by header name
    const matchers: Array<{ key: string; pattern: RegExp }> = [
      { key: 'modelName', pattern: /model|product\s*name|item\s*name|particular/i },
      { key: 'oemPartNo', pattern: /part\s*no|part\s*number|oem\s*part|sku|code/i },
      { key: 'brand', pattern: /brand|make|manufacturer/i },
      { key: 'description', pattern: /desc/i },
      { key: 'unitPrice', pattern: /price|rate|mrp|unit\s*price/i },
      { key: 'uom', pattern: /^uom$|unit\s*of\s*measure|^unit$/i },
      { key: 'hsn', pattern: /hsn|sac/i },
      { key: 'gstPct', pattern: /gst|tax/i },
      { key: 'warranty', pattern: /warranty/i },
      { key: 'moq', pattern: /moq|min.*order|minimum.*qty/i },
      { key: 'leadTimeDays', pattern: /lead\s*time|delivery\s*days/i },
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

  goToLinking(): void {
    if (this.fieldMap['modelName'] < 0 && this.fieldMap['description'] < 0) {
      this.mappingError = 'Map at least one Excel column to "Model / Product Name" or "Description"';
      return;
    }
    if (this.fieldMap['unitPrice'] < 0 && !this.defaults['unitPrice']) {
      this.mappingError = 'Map an Excel column to "Unit Price" or provide a default';
      return;
    }
    this.mappingError = '';

    if (!this.uploadedFile) return;
    this.uploading.set(true);

    // Fetch ALL rows from server
    const fd = new FormData();
    fd.append('file', this.uploadedFile);
    const fullEndpoint = this.isAiSource
      ? `${environment.apiBaseUrl}/price-lists/import/extract?full=true`
      : `${environment.apiBaseUrl}/price-lists/import/preview?full=true`;

    this.http.post<{ data: { sheets: (SheetData & { allRows?: unknown[][] })[] } }>(fullEndpoint, fd).subscribe({
      next: (r) => {
        const sheet = r.data.sheets[this.selectedSheetIdx] ?? r.data.sheets[0];
        if (!sheet) { this.uploading.set(false); return; }

        const allRows = (sheet as { allRows?: unknown[][] }).allRows ?? sheet.sampleRows;
        const rows: MappedRow[] = [];
        for (const row of allRows) {
          const mapped = this.mapSingleRow(row as unknown[]);
          if (mapped) rows.push(mapped);
        }
        this.mappedRows.set(rows);
        this.uploading.set(false);
        this.step.set(3);

        // Auto-link from existing OEM catalog
        this.autoLinkFromCatalog();
      },
      error: () => {
        this.msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to parse full file' });
        this.uploading.set(false);
      },
    });
  }

  /** Auto-link rows to master items via existing OEM catalog entries (by part number or model name) */
  private autoLinkFromCatalog(): void {
    const vendorId = this.selectedVendorId;
    // Fetch existing OEM catalog items for this vendor
    this.http.get<{ data: Array<{ oemPartNo: string | null; modelName: string; masterItemId: string; masterItem: MasterItemOption }> }>(
      `${environment.apiBaseUrl}/oem-catalog?vendorId=${vendorId}&limit=200&status=ACTIVE`
    ).subscribe({
      next: (r) => {
        if (!r.data.length) return;

        // Build lookup maps
        const byPartNo = new Map<string, MasterItemOption>();
        const byModel = new Map<string, MasterItemOption>();
        for (const item of r.data) {
          if (item.oemPartNo) byPartNo.set(item.oemPartNo.toLowerCase(), item.masterItem);
          byModel.set(item.modelName.toLowerCase(), item.masterItem);
        }

        let linked = 0;
        const rows = this.mappedRows();
        for (const row of rows) {
          if (row.masterItem) continue;
          // Match by part number first, then model name
          const mi = (row.oemPartNo ? byPartNo.get(row.oemPartNo.toLowerCase()) : undefined)
            ?? byModel.get(row.modelName.toLowerCase());
          if (mi) { row.masterItem = mi; linked++; }
        }

        if (linked > 0) {
          this.mappedRows.set([...rows]);
          this.msg.add({ severity: 'info', summary: 'Auto-Linked', detail: `${linked} items linked from existing catalog` });
        }
      },
    });
  }

  private getField(arr: unknown[], field: string): string {
    const idx = this.fieldMap[field] ?? -1;
    if (idx >= 0 && idx < arr.length) return String(arr[idx] ?? '').trim();
    return this.defaults[field] ?? '';
  }

  private mapSingleRow(arr: unknown[]): MappedRow | null {
    const modelName = this.getField(arr, 'modelName') || this.getField(arr, 'description');
    if (!modelName) return null;

    const unitPrice = parseFloat(this.getField(arr, 'unitPrice') || '0') || 0;
    if (unitPrice <= 0) return null;

    const gstStr = this.getField(arr, 'gstPct');
    const moqStr = this.getField(arr, 'moq');
    const leadStr = this.getField(arr, 'leadTimeDays');

    return {
      modelName,
      oemPartNo: this.getField(arr, 'oemPartNo'),
      brand: this.getField(arr, 'brand'),
      description: this.getField(arr, 'description'),
      unitPrice,
      uom: this.getField(arr, 'uom') || 'NOS',
      hsn: this.getField(arr, 'hsn'),
      gstPct: gstStr ? (parseFloat(gstStr) || null) : null,
      warranty: this.getField(arr, 'warranty'),
      moq: moqStr ? (parseInt(moqStr, 10) || 1) : 1,
      leadTimeDays: leadStr ? (parseInt(leadStr, 10) || null) : null,
      masterItem: null,
      _valid: true,
    };
  }

  searchMasterItems(event: { query: string }): void {
    this.http.get<{ data: MasterItemOption[] }>(`${environment.apiBaseUrl}/items?q=${encodeURIComponent(event.query)}&limit=20`).subscribe({
      next: (r) => this.masterItemSuggestions.set(r.data),
    });
  }

  createMasterItem(row: MappedRow): void {
    // Create a new master item from the row's model name
    const name = row.modelName;
    const sku = (row.oemPartNo || name.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 40)).toUpperCase();
    const body = {
      sku, name, description: row.description || name, uom: row.uom || (this.defaults['uom'] || 'NOS'),
      hsn: row.hsn || undefined, defaultGstRateBps: row.gstPct != null ? Math.round(row.gstPct * 100) : Math.round(parseFloat(this.defaults['gstPct'] || '18') * 100),
    };
    this.http.post<{ data: { id: string; sku: string; name: string } }>(`${environment.apiBaseUrl}/items`, body).subscribe({
      next: (r) => {
        row.masterItem = { id: r.data.id, sku: r.data.sku, name: r.data.name, category: null };
        this.mappedRows.set([...this.mappedRows()]);
        this.msg.add({ severity: 'success', summary: 'Created', detail: `Master item "${r.data.name}" created` });
      },
      error: (err) => {
        this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message || 'Failed to create item' });
      },
    });
  }

  createAllUnlinked(): void {
    const unlinked = this.mappedRows().filter(r => !r.masterItem);
    if (unlinked.length === 0) return;
    this.creatingItems.set(true);
    let completed = 0;
    let failed = 0;
    for (const row of unlinked) {
      this.createMasterItemSilent(row, () => {
        completed++;
        if (completed + failed >= unlinked.length) {
          this.creatingItems.set(false);
          this.mappedRows.set([...this.mappedRows()]);
          this.msg.add({ severity: 'success', summary: 'Done', detail: `${completed} items created${failed ? `, ${failed} failed` : ''}` });
        }
      }, () => {
        failed++; completed++;
        if (completed >= unlinked.length) {
          this.creatingItems.set(false);
          this.mappedRows.set([...this.mappedRows()]);
        }
      });
    }
  }

  private createMasterItemSilent(row: MappedRow, onSuccess: () => void, onError: () => void): void {
    const name = row.modelName;
    const sku = (row.oemPartNo || name.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 40)).toUpperCase();
    const body = {
      sku, name, description: row.description || name, uom: row.uom || (this.defaults['uom'] || 'NOS'),
      hsn: row.hsn || undefined, defaultGstRateBps: row.gstPct != null ? Math.round(row.gstPct * 100) : Math.round(parseFloat(this.defaults['gstPct'] || '18') * 100),
    };
    this.http.post<{ data: { id: string; sku: string; name: string } }>(`${environment.apiBaseUrl}/items`, body).subscribe({
      next: (r) => { row.masterItem = { id: r.data.id, sku: r.data.sku, name: r.data.name, category: null }; onSuccess(); },
      error: () => onError(),
    });
  }

  autoLinkByName(): void {
    this.autoLinking.set(true);
    // Fetch all master items and fuzzy match by name
    this.http.get<{ data: MasterItemOption[] }>(`${environment.apiBaseUrl}/items?limit=200`).subscribe({
      next: (r) => {
        const items = r.data;
        const rows = this.mappedRows();
        let linked = 0;
        for (const row of rows) {
          if (row.masterItem) continue;
          const lower = row.modelName.toLowerCase();
          // Try exact name match, then contains match
          const match = items.find(i => i.name.toLowerCase() === lower)
            || items.find(i => lower.includes(i.name.toLowerCase()) || i.name.toLowerCase().includes(lower));
          if (match) { row.masterItem = match; linked++; }
        }
        this.mappedRows.set([...rows]);
        this.autoLinking.set(false);
        this.msg.add({ severity: 'info', summary: 'Auto-Link', detail: `${linked} items linked by name match` });
      },
      error: () => { this.autoLinking.set(false); },
    });
  }

  doImport(): void {
    if (!this.selectedVendorId || !this.priceDate) return;
    this.importing.set(true);

    // Build import payload from mapped rows (already has all rows from goToLinking)
    const items: Array<{
      masterItemId: string; oemPartNo?: string; modelName: string; brand?: string;
      description?: string; unitPricePaise: number; uom?: string; hsn?: string;
      gstRateBps?: number; warranty?: string; moq?: number; leadTimeDays?: number;
    }> = [];

    for (const row of this.mappedRows()) {
      if (!row.masterItem) continue;
      items.push({
        masterItemId: row.masterItem.id,
        oemPartNo: row.oemPartNo || undefined,
        modelName: row.modelName,
        brand: row.brand || undefined,
        description: row.description || undefined,
        unitPricePaise: Math.round(row.unitPrice * 100),
        uom: row.uom || undefined,
        hsn: row.hsn || undefined,
        gstRateBps: row.gstPct != null ? Math.round(row.gstPct * 100) : undefined,
        warranty: row.warranty || undefined,
        moq: row.moq,
        leadTimeDays: row.leadTimeDays ?? undefined,
      });
    }

    if (items.length === 0) {
      this.msg.add({ severity: 'warn', summary: 'No Data', detail: 'No linked items to import' });
      this.importing.set(false);
      return;
        }

        const body = {
      vendorId: this.selectedVendorId,
      priceListName: this.priceListName,
      priceDate: this.priceDate!.toISOString().slice(0, 10),
      defaultGstRateBps: Math.round(parseFloat(this.defaults['gstPct'] || '18') * 100),
      defaultUom: this.defaults['uom'] || 'NOS',
      defaultMoq: parseInt(this.defaults['moq'] || '1', 10),
      items,
    };

    this.http.post<{ data: { priceListId: string; created: number; updated: number; total: number } }>(
      `${environment.apiBaseUrl}/price-lists/import`, body
    ).subscribe({
      next: (result) => {
        const d = result.data;
        this.msg.add({ severity: 'success', summary: 'Imported',
          detail: `${d.created} created, ${d.updated} updated out of ${d.total} items` });
        this.importing.set(false);
        this.visible = false;
        this.imported.emit();
      },
      error: (err) => {
        this.msg.add({ severity: 'error', summary: 'Import Failed', detail: err.error?.error?.message || 'Server error' });
        this.importing.set(false);
      },
    });
  }
}
