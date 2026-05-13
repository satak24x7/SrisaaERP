import { Component, OnInit, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { environment } from '../../../environments/environment';

interface PoLine {
  description: string; uom: string; hsnSacCode: string | null;
  qty: number; ratePaise: number; discountPct: number;
  gstRateBps: number; cgstPaise: number; sgstPaise: number; igstPaise: number;
  lineTotalPaise: number; deliveryDate: string | null;
}

interface PoData {
  id: string; poNo: string; poType: string; status: string;
  poDate: string; expectedDelivery: string | null;
  deliveryAddress: string | null;
  paymentTermsDays: number | null; notes: string | null;
  paymentTerms: Array<{ id: string; description: string }>;
  termConditions: Array<{ id: string; description: string }>;
  vendor: { name: string; gstin: string | null; address: string | null; city: string | null; state: string | null };
  project: { name: string; projectCode: string | null } | null;
  businessUnit: { name: string } | null;
  subTotalPaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number;
  freightPaise: number; grandTotalPaise: number;
  lines: PoLine[];
}

interface CompanyData {
  legalName: string; cin: string | null;
  registeredAddress: string | null; corporateAddress: string | null;
  pan: string | null; tan: string | null; gstin: string | null;
}

@Component({
  selector: 'app-po-print',
  standalone: true,
  imports: [CommonModule, ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    @media print {
      .no-print { display: none !important; }
      .print-page { padding: 0; margin: 0; }
    }
    .print-page { max-width: 800px; margin: 0 auto; padding: 24px; font-family: 'Segoe UI', sans-serif; font-size: 13px; color: #222; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 16px; }
    .company-name { font-size: 20px; font-weight: 700; color: #1a1a2e; }
    .company-details { font-size: 11px; color: #555; margin-top: 4px; }
    .po-title { text-align: center; font-size: 16px; font-weight: 700; text-transform: uppercase; margin: 12px 0; letter-spacing: 1px; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
    .meta-box { border: 1px solid #ddd; padding: 10px 12px; border-radius: 4px; }
    .meta-box h4 { margin: 0 0 6px 0; font-size: 12px; text-transform: uppercase; color: #666; letter-spacing: 0.5px; }
    .meta-row { display: flex; justify-content: space-between; margin: 3px 0; }
    .meta-label { color: #666; }
    .meta-value { font-weight: 500; }
    table.items { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 12px; }
    table.items th { background: #f0f0f0; border: 1px solid #ccc; padding: 6px 8px; text-align: left; font-weight: 600; }
    table.items td { border: 1px solid #ccc; padding: 5px 8px; }
    table.items td.num { text-align: right; }
    .totals { width: 300px; margin-left: auto; margin-top: 8px; }
    .totals .row { display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid #eee; }
    .totals .row.grand { font-weight: 700; font-size: 14px; border-top: 2px solid #333; border-bottom: 2px solid #333; padding: 6px 0; }
    .terms { margin-top: 24px; font-size: 11px; border-top: 1px solid #ddd; padding-top: 12px; }
    .terms h4 { margin: 0 0 6px 0; font-size: 12px; }
    .signature { display: flex; justify-content: space-between; margin-top: 60px; }
    .sig-block { text-align: center; width: 200px; }
    .sig-line { border-top: 1px solid #333; margin-top: 40px; padding-top: 4px; font-size: 11px; }
  `],
  template: `
    <div class="no-print" style="text-align: center; padding: 16px; background: #f8f9fa; border-bottom: 1px solid #ddd;">
      <p-button label="Print" icon="pi pi-print" (click)="print()" class="mr-2" />
      <p-button label="Back" icon="pi pi-arrow-left" severity="secondary" (click)="goBack()" />
    </div>

    @if (po()) {
      <div class="print-page">
        <!-- Company Header -->
        <div class="header">
          <div>
            <div class="company-name">{{ company()?.legalName || 'Company Name' }}</div>
            @if (company()?.corporateAddress || company()?.registeredAddress) {
              <div class="company-details">{{ company()!.corporateAddress || company()!.registeredAddress }}</div>
            }
            @if (company()?.gstin || company()?.pan) {
              <div class="company-details" style="margin-top: 2px;">
                @if (company()?.gstin) { <strong>GSTIN:</strong> {{ company()!.gstin }} }
                @if (company()?.gstin && company()?.pan) { &nbsp;|&nbsp; }
                @if (company()?.pan) { <strong>PAN:</strong> {{ company()!.pan }} }
                @if (company()?.cin) { &nbsp;|&nbsp; <strong>CIN:</strong> {{ company()!.cin }} }
              </div>
            }
          </div>
          <div style="text-align: right; font-size: 11px; color: #888;">
            {{ po()!.poType }} Purchase Order
          </div>
        </div>

        <div class="po-title">Purchase Order</div>

        <!-- Meta Grid -->
        <div class="meta-grid">
          <div class="meta-box">
            <h4>Order Details</h4>
            <div class="meta-row"><span class="meta-label">PO Number:</span><span class="meta-value">{{ po()!.poNo }}</span></div>
            <div class="meta-row"><span class="meta-label">Date:</span><span class="meta-value">{{ po()!.poDate }}</span></div>
            @if (po()!.expectedDelivery) {
              <div class="meta-row"><span class="meta-label">Expected Delivery:</span><span class="meta-value">{{ po()!.expectedDelivery }}</span></div>
            }
            @if (po()!.paymentTermsDays) {
              <div class="meta-row"><span class="meta-label">Payment Terms:</span><span class="meta-value">{{ po()!.paymentTermsDays }} days</span></div>
            } @else if (po()!.paymentTermsDays) {
              <div class="meta-row"><span class="meta-label">Payment Terms:</span><span class="meta-value">{{ po()!.paymentTermsDays }} days</span></div>
            }
          </div>
          <div class="meta-box">
            <h4>Vendor / Supplier</h4>
            <div style="font-weight: 600; font-size: 13px;">{{ po()!.vendor.name }}</div>
            @if (po()!.vendor.address) { <div style="color: #555; font-size: 11px; margin-top: 2px;">{{ po()!.vendor.address }}</div> }
            @if (po()!.vendor.city || po()!.vendor.state) { <div style="color: #555; font-size: 11px;">{{ po()!.vendor.city }}{{ po()!.vendor.state ? ', ' + po()!.vendor.state : '' }}</div> }
            @if (po()!.vendor.gstin) { <div class="meta-row" style="margin-top: 4px;"><span class="meta-label"><strong>GSTIN:</strong></span><span class="meta-value">{{ po()!.vendor.gstin }}</span></div> }
          </div>
        </div>

        @if (po()!.deliveryAddress) {
          <div class="meta-box" style="margin-bottom: 16px;">
            <h4>Delivery Address</h4>
            <div>{{ po()!.deliveryAddress }}</div>
          </div>
        }

        <!-- Line Items Table -->
        <table class="items">
          <thead>
            <tr>
              <th style="width: 30px">#</th>
              <th>Description</th>
              <th style="width: 50px">UoM</th>
              <th style="width: 60px">HSN/SAC</th>
              <th style="width: 50px" class="num">Qty</th>
              <th style="width: 80px" class="num">Rate (₹)</th>
              <th style="width: 50px" class="num">Disc%</th>
              <th style="width: 50px" class="num">GST%</th>
              <th style="width: 80px">Delivery</th>
              <th style="width: 80px" class="num">CGST</th>
              <th style="width: 80px" class="num">SGST/IGST</th>
              <th style="width: 90px" class="num">Total (₹)</th>
            </tr>
          </thead>
          <tbody>
            @for (line of po()!.lines; track line.description; let i = $index) {
              <tr>
                <td>{{ i + 1 }}</td>
                <td>{{ line.description }}</td>
                <td>{{ line.uom }}</td>
                <td>{{ line.hsnSacCode || '-' }}</td>
                <td class="num">{{ line.qty }}</td>
                <td class="num">{{ fmt(line.ratePaise) }}</td>
                <td class="num">{{ line.discountPct > 0 ? line.discountPct + '%' : '-' }}</td>
                <td class="num">{{ line.gstRateBps / 100 }}%</td>
                <td>{{ line.deliveryDate || '—' }}</td>
                <td class="num">{{ fmt(line.cgstPaise) }}</td>
                <td class="num">{{ line.igstPaise > 0 ? fmt(line.igstPaise) : fmt(line.sgstPaise) }}</td>
                <td class="num" style="font-weight: 500;">{{ fmt(line.lineTotalPaise) }}</td>
              </tr>
            }
          </tbody>
        </table>

        <!-- Totals -->
        <div class="totals">
          <div class="row"><span>Sub Total:</span><span>{{ fmt(po()!.subTotalPaise) }}</span></div>
          @if (po()!.cgstPaise > 0) { <div class="row"><span>CGST:</span><span>{{ fmt(po()!.cgstPaise) }}</span></div> }
          @if (po()!.sgstPaise > 0) { <div class="row"><span>SGST:</span><span>{{ fmt(po()!.sgstPaise) }}</span></div> }
          @if (po()!.igstPaise > 0) { <div class="row"><span>IGST:</span><span>{{ fmt(po()!.igstPaise) }}</span></div> }
          @if (po()!.freightPaise > 0) { <div class="row"><span>Freight:</span><span>{{ fmt(po()!.freightPaise) }}</span></div> }
          <div class="row grand"><span>Grand Total:</span><span>₹ {{ fmt(po()!.grandTotalPaise) }}</span></div>
        </div>

        @if (po()!.paymentTerms?.length) {
          <div class="terms">
            <h4>Payment Terms</h4>
            <ol style="padding-left: 20px; margin: 4px 0;">
              @for (t of po()!.paymentTerms; track t.id) { <li>{{ t.description }}</li> }
            </ol>
          </div>
        }

        @if (po()!.notes) {
          <div class="terms"><h4>Notes</h4><div style="white-space: pre-wrap;">{{ po()!.notes }}</div></div>
        }

        @if (po()!.termConditions?.length) {
          <div class="terms">
            <h4>Terms & Conditions</h4>
            <ol style="padding-left: 20px; margin: 4px 0;">
              @for (t of po()!.termConditions; track t.id) { <li>{{ t.description }}</li> }
            </ol>
          </div>
        }

        <!-- Signature Blocks -->
        <div class="signature">
          <div class="sig-block">
            <div class="sig-line">Prepared By</div>
          </div>
          <div class="sig-block">
            <div class="sig-line">Authorized Signatory</div>
          </div>
        </div>
      </div>
    }
  `,
})
export class PoPrintComponent implements OnInit {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);

  po = signal<PoData | null>(null);
  company = signal<CompanyData | null>(null);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;

    this.http.get<{ data: PoData }>(`${environment.apiBaseUrl}/purchase-orders/${id}`).subscribe({
      next: (r) => this.po.set(r.data),
    });

    this.http.get<{ data: CompanyData }>(`${environment.apiBaseUrl}/company`).subscribe({
      next: (r) => this.company.set(r.data),
    });
  }

  fmt(paise: number): string {
    return (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 });
  }

  print(): void {
    window.print();
  }

  goBack(): void {
    window.history.back();
  }
}
