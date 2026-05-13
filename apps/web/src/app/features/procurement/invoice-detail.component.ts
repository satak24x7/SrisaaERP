import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
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
import { FileUploadModule } from 'primeng/fileupload';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';

interface PoOption { id: string; poNumber: string; vendorId: string; vendorName: string; totalPaise: number; }
interface GrnOption { id: string; grnNo: string; totalValuePaise: number; }
interface Payment {
  id: string; paymentDate: string; amountPaise: number;
  paymentMode: string; utrReference: string | null; remarks: string | null;
  createdAt: string;
}
interface VendorInvoice {
  id: string; invoiceNo: string; vendorInvoiceNo: string;
  vendorId: string; vendorName: string;
  poId: string; poNumber: string; poTotalPaise: number;
  grnId: string | null; grnNo: string | null; grnValuePaise: number | null;
  invoiceDate: string; dueDate: string;
  invoiceAmountPaise: number; gstAmountPaise: number;
  tdsRateBps: number; tdsAmountPaise: number;
  netPayablePaise: number;
  paidAmountPaise: number; balancePaise: number;
  matchStatus: string; status: string;
  notes: string | null;
  attachmentUrl: string | null; attachmentName: string | null;
  payments: Payment[];
  createdAt: string;
}

const PAYMENT_MODES = [
  { label: 'NEFT', value: 'NEFT' },
  { label: 'RTGS', value: 'RTGS' },
  { label: 'IMPS', value: 'IMPS' },
  { label: 'UPI', value: 'UPI' },
  { label: 'Cheque', value: 'CHEQUE' },
  { label: 'Cash', value: 'CASH' },
  { label: 'DD', value: 'DD' },
];

@Component({
  selector: 'app-invoice-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, TableModule, TagModule, ButtonModule, InputTextModule, InputNumberModule, SelectModule, DatePickerModule, TextareaModule, DialogModule, FileUploadModule, ToastModule],
  providers: [MessageService],
  template: `
    <p-toast />
    <div class="flex items-center gap-3 mb-6">
      <p-button icon="pi pi-arrow-left" [rounded]="true" [text]="true" (onClick)="router.navigate(['/procurement/invoices'])" />
      <div>
        <h2 class="text-2xl font-semibold text-gray-800">
          {{ isNew() ? 'Record Vendor Invoice' : ('Invoice ' + invoice()?.invoiceNo) }}
        </h2>
        @if (!isNew() && invoice()) {
          <p class="text-sm text-gray-500 mt-1">Vendor: {{ invoice()!.vendorName }} &middot; PO: {{ invoice()!.poNumber }}</p>
        }
      </div>
    </div>

    @if (loading()) {
      <div class="flex items-center gap-2 text-gray-500 py-12 justify-center"><i class="pi pi-spin pi-spinner text-2xl"></i> Loading...</div>
    } @else if (isNew()) {
      <!-- CREATE MODE -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <form [formGroup]="createForm">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Purchase Order *</label>
              <p-select formControlName="poId" [options]="poOptions()" optionLabel="label" optionValue="value"
                placeholder="Select PO" [filter]="true" filterBy="label" styleClass="w-full" (onChange)="onPoSelected()" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">GRN</label>
              <p-select formControlName="grnId" [options]="grnOptions()" optionLabel="label" optionValue="value"
                placeholder="Select GRN (optional)" [showClear]="true" styleClass="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Vendor</label>
              <input pInputText [value]="selectedVendorName()" class="w-full" [disabled]="true" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Vendor Invoice No *</label>
              <input pInputText formControlName="vendorInvoiceNo" class="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Invoice Date *</label>
              <p-datepicker formControlName="invoiceDate" dateFormat="dd-M-yy" styleClass="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Due Date *</label>
              <p-datepicker formControlName="dueDate" dateFormat="dd-M-yy" styleClass="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Invoice Amount (₹) *</label>
              <p-inputNumber formControlName="invoiceAmountRupees" [min]="0" [minFractionDigits]="2" [maxFractionDigits]="2" mode="decimal" styleClass="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">GST Amount (₹)</label>
              <p-inputNumber formControlName="gstAmountRupees" [min]="0" [minFractionDigits]="2" [maxFractionDigits]="2" mode="decimal" styleClass="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">TDS Rate (%)</label>
              <p-inputNumber formControlName="tdsRatePct" [min]="0" [max]="100" [minFractionDigits]="2" [maxFractionDigits]="2" mode="decimal" styleClass="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">TDS Amount (₹)</label>
              <p-inputNumber formControlName="tdsAmountRupees" [min]="0" [minFractionDigits]="2" [maxFractionDigits]="2" mode="decimal" styleClass="w-full" />
            </div>
            <div class="flex flex-col gap-1 md:col-span-2">
              <label class="text-sm font-medium text-gray-700">Notes</label>
              <textarea pTextarea formControlName="notes" rows="2" class="w-full"></textarea>
            </div>
          </div>

          <p-button label="Submit Invoice" icon="pi pi-check" (onClick)="submitInvoice()" [loading]="saving()"
            [disabled]="createForm.invalid" />
        </form>
      </div>
    } @else if (invoice()) {
      <!-- VIEW MODE -->
      <div class="space-y-6">
        <!-- Invoice Details -->
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div><span class="text-xs text-gray-500 block">Invoice No</span><span class="font-mono font-semibold">{{ invoice()!.invoiceNo }}</span></div>
            <div><span class="text-xs text-gray-500 block">Vendor Invoice No</span><span>{{ invoice()!.vendorInvoiceNo }}</span></div>
            <div><span class="text-xs text-gray-500 block">Invoice Date</span><span>{{ invoice()!.invoiceDate | date:'dd-MMM-yyyy' }}</span></div>
            <div><span class="text-xs text-gray-500 block">Due Date</span><span>{{ invoice()!.dueDate | date:'dd-MMM-yyyy' }}</span></div>
            <div><span class="text-xs text-gray-500 block">Invoice Amount</span><span class="font-mono font-semibold">{{ formatRupees(invoice()!.invoiceAmountPaise) }}</span></div>
            <div><span class="text-xs text-gray-500 block">GST</span><span class="font-mono">{{ formatRupees(invoice()!.gstAmountPaise) }}</span></div>
            <div><span class="text-xs text-gray-500 block">TDS</span><span class="font-mono">{{ formatRupees(invoice()!.tdsAmountPaise) }} ({{ (invoice()!.tdsRateBps / 100) }}%)</span></div>
            <div><span class="text-xs text-gray-500 block">Net Payable</span><span class="font-mono font-bold text-lg">{{ formatRupees(invoice()!.netPayablePaise) }}</span></div>
            <div><span class="text-xs text-gray-500 block">Status</span><p-tag [value]="invoice()!.status" [severity]="statusSeverity(invoice()!.status)" /></div>
            <div><span class="text-xs text-gray-500 block">Match Status</span><p-tag [value]="invoice()!.matchStatus" [severity]="matchSeverity(invoice()!.matchStatus)" /></div>
          </div>
          @if (invoice()!.notes) {
            <p class="text-sm text-gray-600"><strong>Notes:</strong> {{ invoice()!.notes }}</p>
          }
          @if (invoice()!.attachmentUrl) {
            <a [href]="invoice()!.attachmentUrl" target="_blank" class="text-blue-600 hover:underline flex items-center gap-1 mt-2">
              <i class="pi pi-download"></i> {{ invoice()!.attachmentName || 'Download' }}
            </a>
          }
        </div>

        <!-- 3-Way Match Visual -->
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 class="text-lg font-semibold text-gray-700 mb-4">3-Way Match</h3>
          <div class="flex items-center justify-center gap-4 flex-wrap">
            <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center min-w-[160px]">
              <div class="text-xs text-blue-600 font-semibold mb-1">PO Total</div>
              <div class="text-lg font-mono font-bold">{{ formatRupees(invoice()!.poTotalPaise) }}</div>
            </div>
            <div class="text-2xl" [class.text-green-500]="matchIcon('po-grn') === 'check'" [class.text-red-500]="matchIcon('po-grn') === 'times'">
              <i [class]="'pi pi-' + matchIcon('po-grn')"></i>
            </div>
            <div class="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center min-w-[160px]">
              <div class="text-xs text-amber-600 font-semibold mb-1">GRN Value</div>
              <div class="text-lg font-mono font-bold">{{ invoice()!.grnValuePaise != null ? formatRupees(invoice()!.grnValuePaise!) : 'N/A' }}</div>
            </div>
            <div class="text-2xl" [class.text-green-500]="matchIcon('grn-inv') === 'check'" [class.text-red-500]="matchIcon('grn-inv') === 'times'">
              <i [class]="'pi pi-' + matchIcon('grn-inv')"></i>
            </div>
            <div class="bg-green-50 border border-green-200 rounded-lg p-4 text-center min-w-[160px]">
              <div class="text-xs text-green-600 font-semibold mb-1">Invoice Amount</div>
              <div class="text-lg font-mono font-bold">{{ formatRupees(invoice()!.invoiceAmountPaise) }}</div>
            </div>
          </div>
        </div>

        <!-- Payment History -->
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-gray-700">Payment History</h3>
            @if (invoice()!.balancePaise > 0) {
              <p-button label="Record Payment" icon="pi pi-indian-rupee" size="small" (onClick)="showPaymentDialog = true" />
            }
          </div>

          <div class="grid grid-cols-3 gap-4 mb-4">
            <div class="bg-gray-50 rounded p-3 text-center">
              <div class="text-xs text-gray-500">Total Payable</div>
              <div class="font-mono font-bold">{{ formatRupees(invoice()!.netPayablePaise) }}</div>
            </div>
            <div class="bg-green-50 rounded p-3 text-center">
              <div class="text-xs text-green-600">Paid</div>
              <div class="font-mono font-bold text-green-700">{{ formatRupees(invoice()!.paidAmountPaise) }}</div>
            </div>
            <div class="rounded p-3 text-center" [class.bg-red-50]="invoice()!.balancePaise > 0" [class.bg-gray-50]="invoice()!.balancePaise === 0">
              <div class="text-xs" [class.text-red-600]="invoice()!.balancePaise > 0">Balance</div>
              <div class="font-mono font-bold" [class.text-red-700]="invoice()!.balancePaise > 0">{{ formatRupees(invoice()!.balancePaise) }}</div>
            </div>
          </div>

          @if (invoice()!.payments.length > 0) {
            <p-table [value]="invoice()!.payments" styleClass="p-datatable-sm p-datatable-striped">
              <ng-template pTemplate="header">
                <tr>
                  <th class="font-semibold">#</th>
                  <th class="font-semibold">Date</th>
                  <th class="font-semibold text-right">Amount</th>
                  <th class="font-semibold">Mode</th>
                  <th class="font-semibold">UTR / Reference</th>
                  <th class="font-semibold">Remarks</th>
                </tr>
              </ng-template>
              <ng-template pTemplate="body" let-p let-i="rowIndex">
                <tr>
                  <td>{{ i + 1 }}</td>
                  <td>{{ p.paymentDate | date:'dd-MMM-yyyy' }}</td>
                  <td class="text-right font-mono font-semibold">{{ formatRupees(p.amountPaise) }}</td>
                  <td><p-tag [value]="p.paymentMode" severity="info" [style]="{'font-size':'0.65rem'}" /></td>
                  <td>{{ p.utrReference || '—' }}</td>
                  <td>{{ p.remarks || '—' }}</td>
                </tr>
              </ng-template>
            </p-table>
          } @else {
            <p class="text-sm text-gray-500 text-center py-4">No payments recorded yet.</p>
          }
        </div>
      </div>

      <!-- Record Payment Dialog -->
      <p-dialog header="Record Payment" [(visible)]="showPaymentDialog" [modal]="true" [style]="{ width: '480px' }">
        <form [formGroup]="paymentForm" class="flex flex-col gap-4 pt-2">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Payment Date *</label>
            <p-datepicker formControlName="paymentDate" dateFormat="dd-M-yy" styleClass="w-full" appendTo="body" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Amount (₹) *</label>
            <p-inputNumber formControlName="amountRupees" [min]="0.01" [minFractionDigits]="2" [maxFractionDigits]="2" mode="decimal" styleClass="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Payment Mode *</label>
            <p-select formControlName="paymentMode" [options]="paymentModes" optionLabel="label" optionValue="value"
              placeholder="Select mode" styleClass="w-full" appendTo="body" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">UTR / Reference</label>
            <input pInputText formControlName="utrReference" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Remarks</label>
            <textarea pTextarea formControlName="remarks" rows="2" class="w-full"></textarea>
          </div>
        </form>
        <ng-template pTemplate="footer">
          <p-button label="Cancel" [text]="true" severity="secondary" (onClick)="showPaymentDialog = false" />
          <p-button label="Record Payment" icon="pi pi-check" (onClick)="submitPayment()" [loading]="savingPayment()"
            [disabled]="paymentForm.invalid" />
        </ng-template>
      </p-dialog>
    }
  `,
  styles: [`:host { display: block; padding: 1.5rem; }`],
})
export class InvoiceDetailComponent implements OnInit {
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  router = inject(Router);
  private msg = inject(MessageService);
  private readonly cdr = inject(ChangeDetectorRef);
  environment = environment;

  invoice = signal<VendorInvoice | null>(null);
  poOptions = signal<{ label: string; value: string }[]>([]);
  grnOptions = signal<{ label: string; value: string }[]>([]);
  selectedVendorName = signal('');
  loading = signal(false);
  saving = signal(false);
  savingPayment = signal(false);
  isNew = signal(true);
  showPaymentDialog = false;
  paymentModes = PAYMENT_MODES;

  private poList: PoOption[] = [];

  createForm = this.fb.group({
    poId: ['', Validators.required],
    grnId: [''],
    vendorInvoiceNo: ['', Validators.required],
    invoiceDate: [new Date(), Validators.required],
    dueDate: [null as Date | null, Validators.required],
    invoiceAmountRupees: [0, [Validators.required, Validators.min(0.01)]],
    gstAmountRupees: [0],
    tdsRatePct: [0],
    tdsAmountRupees: [0],
    notes: [''],
  });

  paymentForm = this.fb.group({
    paymentDate: [new Date(), Validators.required],
    amountRupees: [0, [Validators.required, Validators.min(0.01)]],
    paymentMode: ['NEFT', Validators.required],
    utrReference: [''],
    remarks: [''],
  });

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new') {
      this.isNew.set(false);
      this.loadInvoice(id);
    } else {
      this.loadPoOptions();
    }
  }

  loadPoOptions() {
    this.http.get<{ data: PoOption[] }>(`${environment.apiBaseUrl}/purchase-orders?status=ISSUED,PARTIALLY_RECEIVED,COMPLETED&limit=200`).subscribe({
      next: (r) => {
        this.poList = r.data;
        this.poOptions.set(r.data.map(po => ({
          label: `${po.poNumber} — ${po.vendorName} (${this.formatRupees(po.totalPaise)})`,
          value: po.id,
        })));
      },
    });
  }

  onPoSelected() {
    const poId = this.createForm.get('poId')?.value;
    const po = this.poList.find(p => p.id === poId);
    if (po) {
      this.selectedVendorName.set(po.vendorName);
      // Load GRNs for this PO
      this.http.get<{ data: GrnOption[] }>(`${environment.apiBaseUrl}/grns?poId=${poId}&limit=50`).subscribe({
        next: (r) => {
          this.grnOptions.set(r.data.map(g => ({
            label: `${g.grnNo} (${this.formatRupees(g.totalValuePaise)})`,
            value: g.id,
          })));
        },
      });
    } else {
      this.selectedVendorName.set('');
      this.grnOptions.set([]);
    }
  }

  loadInvoice(id: string) {
    this.loading.set(true);
    this.http.get<{ data: VendorInvoice }>(`${environment.apiBaseUrl}/vendor-invoices/${id}`).subscribe({
      next: (r) => { this.invoice.set(r.data); this.loading.set(false); },
      error: () => { this.msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to load invoice' }); this.loading.set(false); },
    });
  }

  submitInvoice() {
    if (this.createForm.invalid) return;
    this.saving.set(true);
    const v = this.createForm.getRawValue();
    const po = this.poList.find(p => p.id === v.poId);
    this.http.post<{ data: VendorInvoice }>(`${environment.apiBaseUrl}/vendor-invoices`, {
      poId: v.poId,
      grnId: v.grnId || null,
      vendorId: po?.vendorId || null,
      vendorInvoiceNo: v.vendorInvoiceNo,
      invoiceDate: v.invoiceDate ? (v.invoiceDate as Date).toISOString().slice(0, 10) : null,
      dueDate: v.dueDate ? (v.dueDate as Date).toISOString().slice(0, 10) : null,
      invoiceAmountPaise: Math.round((v.invoiceAmountRupees || 0) * 100),
      gstAmountPaise: Math.round((v.gstAmountRupees || 0) * 100),
      tdsRateBps: Math.round((v.tdsRatePct || 0) * 100),
      tdsAmountPaise: Math.round((v.tdsAmountRupees || 0) * 100),
      notes: v.notes || null,
    }).subscribe({
      next: (r) => {
        this.msg.add({ severity: 'success', summary: 'Created', detail: `Invoice ${r.data.invoiceNo} recorded` });
        this.saving.set(false);
        this.router.navigate(['/procurement/invoices', r.data.id]);
      },
      error: () => { this.msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to create invoice' }); this.saving.set(false); },
    });
  }

  submitPayment() {
    if (this.paymentForm.invalid || !this.invoice()) return;
    this.savingPayment.set(true);
    const v = this.paymentForm.getRawValue();
    this.http.post<{ data: VendorInvoice }>(`${environment.apiBaseUrl}/vendor-invoices/${this.invoice()!.id}/payments`, {
      paymentDate: v.paymentDate ? (v.paymentDate as Date).toISOString().slice(0, 10) : null,
      amountPaise: Math.round((v.amountRupees || 0) * 100),
      paymentMode: v.paymentMode,
      utrReference: v.utrReference || null,
      remarks: v.remarks || null,
    }).subscribe({
      next: (r) => {
        this.invoice.set(r.data);
        this.msg.add({ severity: 'success', summary: 'Recorded', detail: 'Payment recorded successfully' });
        this.savingPayment.set(false);
        this.showPaymentDialog = false;
        this.paymentForm.reset({ paymentDate: new Date(), amountRupees: 0, paymentMode: 'NEFT', utrReference: '', remarks: '' });
        this.cdr.markForCheck();
      },
      error: () => { this.msg.add({ severity: 'error', summary: 'Error', detail: 'Failed to record payment' }); this.savingPayment.set(false); this.cdr.markForCheck(); },
    });
  }

  matchIcon(pair: string): string {
    const inv = this.invoice();
    if (!inv) return 'times';
    if (inv.matchStatus === 'MATCHED') return 'check';
    if (inv.matchStatus === 'MISMATCH') return 'times';
    // Partial logic
    if (pair === 'po-grn') {
      return inv.grnValuePaise != null && inv.grnValuePaise <= inv.poTotalPaise ? 'check' : 'times';
    }
    if (pair === 'grn-inv') {
      if (inv.grnValuePaise == null) return 'minus';
      return inv.invoiceAmountPaise <= inv.grnValuePaise ? 'check' : 'times';
    }
    return 'minus';
  }

  formatRupees(paise: number) { return '\u20B9' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 }); }

  matchSeverity(s: string): 'success' | 'warn' | 'danger' | 'info' | 'secondary' {
    switch (s) {
      case 'MATCHED': return 'success';
      case 'PARTIAL_MATCH': return 'warn';
      case 'MISMATCH': return 'danger';
      case 'PENDING': return 'secondary';
      default: return 'info';
    }
  }

  statusSeverity(s: string): 'success' | 'warn' | 'danger' | 'info' | 'secondary' {
    switch (s) {
      case 'PAID': return 'success';
      case 'PARTIALLY_PAID': return 'warn';
      case 'PENDING': return 'secondary';
      case 'CANCELLED': return 'danger';
      default: return 'info';
    }
  }
}
