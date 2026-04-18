# Module 5 — Material & Procurement

**Purpose:** End-to-end procurement-to-issue cycle: Material Request from project teams, Indenting and Purchase by Admin, Issue back to project with full traceability. Costs flow automatically to the project's material line.

**Primary users:** Project Team (MR raisers), PM, BU Head (approvals), Admin / Procurement Officer, Stores / Inventory Officer, Finance.

## The 8-stage flow

1. **Material Request (MR)** — Project Team
2. **PM Approval** — within project budget
3. **BU Head Approval** — above threshold
4. **Indenting** — Admin consolidates approved MRs, runs RFQ if needed
5. **Purchase Order (PO)** — Admin raises PO; commitment posts against project budget
6. **Goods Receipt Note (GRN)** — Stores; accepted/rejected qty + quality
7. **Material Issue** — Stores → Project Team; digital acknowledgement
8. **Consumption & Return** — Project Team; excess/defective returned with Return Note

## Core entities

| Entity | Notes |
|---|---|
| `Item` | SKU, description, UoM, category, specs, make/model, HSN, last-purchased rate |
| `Vendor` | Name, GSTIN, PAN, category, bank details, rate card, performance metrics |
| `MaterialRequest` | MR no., project, requester, BU, required-by, priority, justification, status |
| `MaterialRequestLine` | Item ref, qty requested, qty approved, remarks |
| `Indent` | Consolidated MR lines, RFQ refs, selected vendor, approval trail |
| `RFQ` | Indent ref, vendors invited, due date |
| `Quotation` | RFQ ref, vendor, rates, validity, comparison notes |
| `PurchaseOrder` | PO no., vendor, items, rates, GST, delivery, payment terms, project tag, status |
| `POLine` | PO ref, item, qty, rate, tax, delivered qty, pending qty |
| `GRN` | PO ref, received qty, accepted qty, rejected qty, quality notes, photos |
| `MaterialIssue` | MR ref, items, qty issued, receiver, acknowledgement, date |
| `MaterialReturn` | Issue ref (or MR ref), reason, qty, restocking decision |
| `StockLedger` | Item, location, opening, inward, outward, returns, closing (per period) |
| `StoreLocation` | Central / project-site, custodian |

## Functional requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-5.1 | Item Master with SKU, UoM, specs, HSN, last-purchased rate | P0 |
| FR-5.2 | Vendor Master with GSTIN, bank, rate card, performance | P0 |
| FR-5.3 | MR raised by Project Team with items, qty, required-by, priority, justification | P0 |
| FR-5.4 | MR priority: Normal / Urgent / Emergency with SLA per level | P1 |
| FR-5.5 | PM approval within project budget; BU Head above threshold | P0 |
| FR-5.6 | Admin consolidates approved MRs into an Indent | P0 |
| FR-5.7 | RFQ capture with comparison and vendor selection reason | P1 |
| FR-5.8 | PO with items, rates, GST, delivery, payment terms; digital approval matrix | P0 |
| FR-5.9 | PO issue posts commitment against project budget line | P0 |
| FR-5.10 | GRN with accepted/rejected qty, quality notes, photo evidence | P0 |
| FR-5.11 | Material Issue Slip with digital acknowledgement | P0 |
| FR-5.12 | Material Trace view (MR → Indent → PO → GRN → Issue → Consumption) | P1 |
| FR-5.13 | Multi-location stock ledger | P0 |
| FR-5.14 | Min-stock / reorder alerts per item per location | P1 |
| FR-5.15 | Material Return Note with restocking decision | P1 |
| FR-5.16 | Vendor Scorecard (OTIF %, quality reject %, dispute rate, payment cycle) | P1 |
| FR-5.17 | Mobile approvals for PM and BU Head on MR and PO | P0 |
| FR-5.18 | Barcode / QR support on Issue Slip acknowledgement | P2 |
| FR-5.19 | On Issue, cost posts automatically to project material line | P0 |
| FR-5.20 | Accounting integration: PO commitment, inventory valuation, cost posting | P1 |
| FR-5.21 | Procurement Pipeline dashboard (open MRs, indents, PO vs GRN vs Issue) | P1 |
| FR-5.22 | Exception report for MRs aged beyond SLA | P1 |

## Key API endpoints

```
# Item / Vendor masters
GET    /api/v1/items
POST   /api/v1/items
GET    /api/v1/vendors
POST   /api/v1/vendors
GET    /api/v1/vendors/:id/scorecard

# Material Request
GET    /api/v1/material-requests?project_id=...&status=...
POST   /api/v1/material-requests
GET    /api/v1/material-requests/:id
POST   /api/v1/material-requests/:id/submit
POST   /api/v1/material-requests/:id/approve         # PM or BU Head (current step)
POST   /api/v1/material-requests/:id/reject

# Indent / RFQ
POST   /api/v1/indents                               # takes list of MR line IDs
GET    /api/v1/indents/:id
POST   /api/v1/indents/:id/rfq
POST   /api/v1/rfqs/:id/quotations
POST   /api/v1/indents/:id/select-vendor

# Purchase Order
POST   /api/v1/purchase-orders                       # from indent
GET    /api/v1/purchase-orders?project_id=...
POST   /api/v1/purchase-orders/:id/approve
POST   /api/v1/purchase-orders/:id/issue             # sends to vendor

# GRN & Issue
POST   /api/v1/grns                                  # against a PO
POST   /api/v1/material-issues                       # against an MR
POST   /api/v1/material-returns

# Trace & dashboards
GET    /api/v1/material-trace?mr_id=...              # or po_id / item_id
GET    /api/v1/stock-ledger?item_id=...&location_id=...
GET    /api/v1/procurement-pipeline?bu_id=...
```

## Business rules to preserve

- MR cannot progress past PM without project budget check: `sum(approved_MR_lines * item.last_rate)` must fit in material line's available budget (or require `override`).
- A PO can consolidate lines from multiple MRs, but every PO line retains back-reference to its MR line for trace.
- GRN can be partial — `received_qty <= ordered_qty`. On full receipt, PO line closes; on partial, PO remains open.
- Issue can happen only against a line where stock exists AND an approved MR line is open. Issuing zeroes the MR line's `pending_qty`.
- On Issue, cost = `issued_qty * issue_rate` posts to the project's material budget actual.
- Return: `restock=true` returns to stock ledger; `restock=false` (defective) does not.
- Vendor scorecard is rolling 12-month:  
  - **OTIF %** = count(PO lines delivered on/before date AND qty full) / total PO lines  
  - **Quality reject %** = rejected qty / received qty across GRNs  
  - **Payment cycle** = avg days from GRN to payment
