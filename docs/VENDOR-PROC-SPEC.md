# Procurement Module — Technical Specification

**Document version:** 2.0
**Status:** Draft for implementation
**Source:** Internal Vendor Procurement Process Flow (Requirement → Vendor Payment)
**Audience:** Claude Code (implementation agent) and engineering reviewers
**Scope:** A procurement module that plugs into an existing ERP. **No external vendor portal.** All vendor interactions are by email; documents from vendors are uploaded into the system by procurement / AP / warehouse staff on the vendor's behalf.

---

## 0. How to read this document

Every functional requirement has a stable ID (`FR-<MODULE>-<NUM>`). Non-functional: `NFR-<NUM>`. Entities: `E-<NAME>`. State machines: `SM-<NAME>`. Host ERP integration contracts: `HC-<NUM>`.

When implementing, treat every requirement as MUST unless explicitly marked SHOULD or MAY. Where assumptions are made they are flagged as `ASSUMPTION:`.

---

## 1. Product summary

Build the **Procurement Module** of an ERP. It digitises the procurement lifecycle from internal requirement through vendor selection, purchase order, goods receipt, three-way invoice matching, vendor payment trigger, PO closure, and audit archival.

The module owns: vendor master, purchase requisitions, RFQs, quotations, technical evaluations, comparative statements, negotiations, purchase orders, GRNs, vendor invoices, three-way matching, and PO closure. It **consumes** the host ERP for: identity & access management, organisation hierarchy, item master, cost centers and budgets, general ledger / accounts payable posting, inventory and asset registers, document storage, notifications, and report distribution.

### 1.1 Goals
1. Enforce approval workflows and segregation of duties for every purchase.
2. Make 3-way matching (PO ↔ GRN ↔ Invoice) automatic and exception-driven.
3. Maintain an immutable audit trail covering every state transition and document.
4. Enforce vendor KYC and de-duplication to prevent fake-vendor fraud.
5. Surface procurement KPIs in real time alongside the ERP's other module dashboards.
6. Be operable by non-technical procurement / AP / warehouse staff inside the ERP shell.

### 1.2 Non-goals
- **No external vendor portal.** Vendors do not log in. They communicate by email; their documents are uploaded by procurement/AP/warehouse with provenance captured.
- No public e-tendering / reverse auction (out of scope for this module).
- No sub-contractor / labour procurement workflows.
- No treasury, FX hedging, or banking integration beyond NEFT/RTGS payment file generation.
- No re-implementation of inventory, GL, item master, or IAM — those are host ERP responsibilities (see §3.2).
- No mobile-native apps; the module renders inside the ERP's existing web shell.

---

## 2. Roles and permissions

All roles are internal. There is no external (vendor) user.

| Role ID | Role | Primary scope |
|---|---|---|
| `R-REQ` | Requestor | Raises PRs for own department |
| `R-DH` | Department Head | Approves PRs from own department |
| `R-TECH` | Technical Reviewer | Performs technical evaluation of quotations |
| `R-FIN` | Finance / AP | Verifies budgets, runs 3-way match, triggers payment |
| `R-PROC` | Procurement Officer | Runs RFQ, manages quotations, drafts PO, uploads vendor docs on behalf |
| `R-PROCH` | Procurement Head | Approves PRs and POs up to ₹1 Lakh |
| `R-CFO` | CFO | Approves POs ₹1–10 Lakhs |
| `R-CEO` | CEO / Board signatory | Approves POs > ₹10 Lakhs |
| `R-WH` | Warehouse / Stores | Records GRN, posts inventory |
| `R-QA` | QA / Inspector | Performs and signs inspection reports |
| `R-AUD` | Auditor | Read-only access to all records and audit trail |
| `R-ADMIN` | Module Admin | Procurement masters, approval matrix, number series |

A user MAY hold multiple roles. The system MUST prevent self-approval: the same user cannot raise and approve, or approve at two consecutive levels of the same workflow instance. Roles are mapped to host-ERP groups via the host's IAM (see `HC-01`).

The full permission matrix is in §13.

`ASSUMPTION:` Approval thresholds are configurable. Defaults match the source document (see §6.4 `FR-WF-02`).

---

## 3. Architecture as an ERP module

### 3.1 Module boundary

```
┌────────────────────────────────────────────────────────────────────────┐
│                          ERP HOST (existing)                           │
│                                                                        │
│   IAM  │ Org/Dept │ Item   │ Cost Center │ GL/AP   │ Inventory │ DMS  │
│        │   /User  │ Master │  & Budget   │ Posting │  & Assets │ Notif│
└────┬───┴────┬─────┴───┬────┴──────┬──────┴────┬────┴─────┬─────┴──┬───┘
     │ HC-01  │ HC-02   │ HC-03     │ HC-04     │ HC-05    │ HC-06  │ HC-07 / HC-09
     │        │         │           │           │          │        │
┌────┴────────┴─────────┴───────────┴───────────┴──────────┴────────┴───┐
│                       PROCUREMENT MODULE                               │
│                                                                        │
│  Vendor Master │ PR │ RFQ │ Quotation │ Tech Eval │ Commercial Eval   │
│  Negotiation   │ PO │ GRN │ Invoice & 3WM │ Payment Trigger │ Closure │
│                                                                        │
│  Workflow Engine │ Audit Log │ Procurement Reports                     │
└─────────────────────────┬──────────────────────────────────────────────┘
                          │
                          │ Email gateway (HC-08): outbound RFQ, PO release;
                          │ inbound parsing of vendor replies (optional v2)
                          ▼
                    Vendors (email only)
```

The module renders its UI as a set of pages inside the ERP's existing SPA shell (route prefix `/procurement/*`). It does not ship its own login screen, top nav, or user-management UI.

### 3.2 Host ERP integration contracts

These are the services the procurement module REQUIRES from the host ERP. If the host ERP exposes them differently, build a thin adapter at the module boundary so the rest of the codebase remains host-agnostic.

| ID | Contract | Direction | Notes |
|---|---|---|---|
| `HC-01` | IAM: authenticate user, return user id + roles + org + dept; SSO via OIDC/SAML | Module ← Host | Module never stores passwords. Roles in §2 map to host groups. |
| `HC-02` | Org tree: orgs/companies, departments, employees | Module ← Host | Read-only from module's perspective. |
| `HC-03` | Item master: lookup, search, code → details (UoM, HSN/SAC, default GST, category) | Module ← Host | Module MAY add a "preferred vendors" attribute as a procurement-owned extension table keyed by item id. |
| `HC-04` | Cost centers + budget: read remaining budget, post commitments and actuals | Bi-directional | Module commits budget on PR approval; converts commitment → actual on GRN posting; releases on PO cancellation. |
| `HC-05` | GL/AP posting: post journal vouchers and AP entries | Module → Host | On advance payment, GRN, invoice booking, payment release, debit/credit notes. |
| `HC-06` | Inventory & asset register: post stock receipt with serial / batch / warranty | Module → Host | On GRN acceptance. Module does not maintain its own stock ledger. |
| `HC-07` | DMS: object storage with presigned URLs, hashing, retention policies | Module ↔ Host | All procurement documents in the host DMS, tagged with a `procurement` namespace. |
| `HC-08` | Email gateway: outbound transactional email + DSN handling; (v2) inbound mailbox per RFQ | Module → Host (out); Host → Module (in, v2) | Used for RFQ send, PO release, reminders. |
| `HC-09` | Notification service: in-app + email notifications, user preferences | Module → Host | |
| `HC-10` | Number series: org-scoped, fiscal-year sequences for PR / RFQ / PO / GRN / Invoice / Payment numbers | Module ← Host | If host has none, module ships its own. |
| `HC-11` | Audit log: write append-only audit entries; export | Module → Host | If host has none, module ships its own per `FR-AUD-01`. |
| `HC-12` | Reporting: register procurement KPI cubes/datasets with the host's reporting layer | Module → Host | |

If `HC-10` and `HC-11` are not provided by the host, the module's fallback implementations apply for the rest of this spec.

### 3.3 Tech stack

The module follows the host ERP's stack. In the absence of a confirmed host stack, the recommendation is:

- **Backend:** TypeScript + NestJS (or Python + FastAPI) as a module/service inside the ERP monorepo, exposing both REST (for the SPA) and an internal RPC/event interface (for cross-module calls per `HC-04` / `HC-05` / `HC-06`).
- **Frontend:** React + TypeScript pages plugged into the ERP's existing SPA shell using its established routing, layout, and design system. No standalone bundle.
- **DB:** Same Postgres instance as the host ERP, in a dedicated `procurement` schema. References to host tables (users, items, cost centers) are logical FKs validated at the service layer; cross-schema FKs may be used where host conventions allow.
- **Workflow:** Either the host ERP's workflow engine if available, or a procurement-owned state-table-driven workflow service. Approvals MUST NOT be modelled as ad-hoc booleans.
- **Background jobs:** The host ERP's job runner; otherwise BullMQ / Celery on the ERP's Redis.
- **PDF rendering:** Server-side using the host's templating service, or a headless renderer (Playwright + HTML template) if not provided.

`ASSUMPTION:` Single-tenant per ERP installation. If the host ERP is multi-tenant, the module inherits its tenancy model via `org_id`.

> **Open question:** which ERP is the host (in-house, SAP, Oracle EBS / Fusion, Odoo, Microsoft Dynamics, Tally, NetSuite, custom)? The integration contracts in §3.2 will be mapped to concrete host APIs once this is confirmed. See §17.

---

## 4. Domain model (entities)

All entities have: `id` (UUID v7), `created_at`, `updated_at`, `created_by`, `updated_by`, `org_id`, soft-delete `deleted_at`. Money fields are `numeric(18,2)` with explicit `currency` ISO code (default INR). Timestamps UTC. Document numbers use `HC-10`.

User, item, cost center, and department references are **logical FKs to host ERP tables**. The module does not duplicate these masters.

### 4.1 Entity list (module-owned)

| Entity ID | Name | Notes |
|---|---|---|
| `E-VEND` | Vendor | Master record |
| `E-VDOC` | VendorDocument | KYC documents |
| `E-VBANK` | VendorBankDetail | Verified bank accounts |
| `E-VCONTACT` | VendorContact | Email addresses, phones, OEM principals |
| `E-PR` | PurchaseRequisition | Indent header |
| `E-PRL` | PRLine | One row per requested item |
| `E-APR` | ApprovalRequest | Generic approval instance |
| `E-APRS` | ApprovalStep | Single approver action |
| `E-RFQ` | RFQ | Header |
| `E-RFQL` | RFQLine | |
| `E-RFQV` | RFQVendor | Vendor invited to RFQ + send/clarification log |
| `E-QUO` | Quotation | Vendor quotation header (uploaded by procurement) |
| `E-QUOL` | QuotationLine | |
| `E-QUOD` | QuotationDocument | Datasheets, compliance, OEM letter |
| `E-TEV` | TechnicalEvaluation | Per quotation |
| `E-CST` | ComparativeStatement | Tabulation of qualified quotations |
| `E-NEG` | NegotiationRound | One round per vendor |
| `E-PRN` | PurchaseRecommendationNote | Justification + recommended vendor |
| `E-PO` | PurchaseOrder | Header |
| `E-POL` | POLine | |
| `E-POAMD` | POAmendment | Tracked changes to a released PO |
| `E-PI` | ProformaInvoice | Vendor proforma for advance |
| `E-ADV` | AdvancePayment | |
| `E-DISP` | Dispatch | Vendor dispatch (uploaded by procurement/warehouse) |
| `E-GRN` | GoodsReceiptNote | Header |
| `E-GRNL` | GRNLine | |
| `E-INSP` | InspectionReport | QA outcome |
| `E-INV` | TaxInvoice | Vendor tax invoice (uploaded by AP) |
| `E-INVL` | InvoiceLine | |
| `E-3WM` | ThreeWayMatchResult | PO ↔ GRN ↔ Invoice |
| `E-PAY` | Payment | NEFT/RTGS/LC/Cheque |
| `E-DCN` | DebitOrCreditNote | |
| `E-AUD` | AuditEntry | Append-only (module-owned if `HC-11` not available) |
| `E-EMAIL` | EmailRecord | Outbound emails to vendors and inbound replies (provenance) |

### 4.2 Selected entity field detail

#### `E-VEND` Vendor
```
id (uuid)
vendor_code (string, unique per org, from HC-10)
legal_name (string)
display_name (string)
status (enum: draft, kyc_pending, active, blocked, blacklisted)
gstin (string, validated by checksum)
pan (string, validated)
msme_number (string, nullable)
msme_category (enum: micro, small, medium, none)
is_oem (bool)
oem_principals (string[])
default_payment_terms (string e.g. "Net 30")
default_tds_section (enum)
default_currency (iso code)
addresses (jsonb)
risk_rating (enum: low, medium, high)
performance_score (numeric, computed)
```
Constraints: `(org_id, gstin)` unique. Activation requires at least one `VendorDocument` of types `GST`, `PAN`, `BANK`, `CANCELLED_CHEQUE` AND one verified `VendorBankDetail`.

#### `E-VCONTACT` VendorContact
Stores per-vendor contact emails (RFQ contact, accounts contact, dispatch contact). Used as `To:` for outbound transactional emails. **No login is created for vendor contacts.**

#### `E-EMAIL` EmailRecord
```
id (uuid)
direction (enum: outbound, inbound)
linked_entity_type (enum: rfq, po, payment, invoice, dispatch, etc.)
linked_entity_id (uuid)
to_addresses (string[])
from_address (string)
subject (string)
body_text (text)
body_html (text)
attachments_doc_ids (uuid[])
sent_at / received_at (timestamp)
provider_message_id (string, nullable)
status (enum: sent, delivered, bounced, failed, received)
uploaded_by (fk user, nullable)  -- set when procurement uploads an email/PDF received offline
```
Inbound emails are recorded automatically only if `HC-08` v2 is available. In v1, vendor emails received outside the system are uploaded as `EmailRecord` rows by procurement with `direction='inbound'` and `uploaded_by` set, preserving provenance.

#### `E-PR`, `E-PO`, `E-3WM`
Same field shape as v1.0 of this spec; only the actor of vendor-touching transitions changes.

A complete DDL is part of the implementation deliverable.

---

## 5. State machines

Vendor-touching transitions are now performed by internal users uploading evidence:

- **PO acknowledgment** (`SM-PO`: `released → acknowledged`) — procurement uploads the vendor's signed PO copy or forwarded acknowledgment email; the system records the `EmailRecord` and the uploading user.
- **Quotation submission** — procurement uploads the vendor's quotation PDF, with the source email attached.
- **Dispatch** — procurement / warehouse uploads dispatch documents emailed by the vendor.
- **Invoice submission** — AP uploads the vendor's tax invoice email.

State machines themselves are unchanged in shape. Every transition records `acted_by` (internal user) and `evidence_doc_ids[]`.

### `SM-PR`
```
draft → submitted → dept_approved → tech_approved (skippable) →
  finance_approved → procurement_approved → in_procurement → po_issued
Any approver can return-to-previous or send-back-to-requestor with reason.
Terminal: rejected, cancelled, po_issued.
```

### `SM-PO`
```
draft → pending_approval → approved → released → acknowledged →
  in_progress → partially_received → fully_received → invoiced → paid → closed
Any non-terminal → cancelled (with approval; post-dispatch requires return + credit note).
```

### `SM-INVOICE`
```
received → matching → matched | exception → approved_for_payment → paid
exception → resolved → matching   (loop)
```

### `SM-PAYMENT`
```
pending → initiated → completed | failed
failed → retry → initiated
```

All state machines MUST be enforced server-side; UI drives transitions only through API calls that return the new state and updated `allowed_actions`.

---

## 6. Functional requirements by module

### 6.1 Vendor Master (`VM`) — Source stage 4.3
- `FR-VM-01` Create vendor in `draft` with minimum legal name, GSTIN, PAN, primary contact email.
- `FR-VM-02` Validate GSTIN checksum (15-char, state-code) and PAN format (`[A-Z]{5}[0-9]{4}[A-Z]`).
- `FR-VM-03` Block duplicate active vendor on (GSTIN) or (PAN); surface the existing record.
- `FR-VM-04` KYC document upload: GST cert, PAN card, MSME cert, cancelled cheque, company registration, NDA, ISO certs, OEM authorisation letter.
- `FR-VM-05` Bank details: dual-control (one user enters, a different user verifies) before vendor activation.
- `FR-VM-06` Activation transitions `kyc_pending → active` with audit entry naming the activator.
- `FR-VM-07` Block / blacklist with reason and approval; blacklisted vendors cannot be invited to new RFQs or used on new POs.
- `FR-VM-08` Performance score recomputed nightly over last N completed POs (default N=10): on-time delivery %, quality acceptance %, responsiveness (avg quote turnaround), price competitiveness (rank in CS), warranty support tickets.
- `FR-VM-09` Vendor contacts (`E-VCONTACT`) hold the email addresses used for outbound communication. **No login is provisioned for vendor contacts.**

### 6.2 Item Master (`IM`)
- `FR-IM-01` Use the host ERP item master via `HC-03`. The procurement module does not own item codes.
- `FR-IM-02` Allow free-text items on PR/RFQ/PO when item is not in the master, flagged `is_one_off`. Procurement may request a host-master entry through the host's normal item-creation flow.
- `FR-IM-03` Maintain an extension table `procurement_item_attrs` keyed by host item id, holding procurement-owned fields: preferred vendors, current rate-contract, last purchase price, reorder lead time.

### 6.3 Purchase Requisition (`PR`) — Source stages 1, 2
- `FR-PR-01` Any user with role `R-REQ` for a department can raise a PR for that department.
- `FR-PR-02` PR header captures: title, department, cost center, project reference, requirement source (sales order / project / low inventory / maintenance / emergency / annual plan / management directive), required-by date, justification.
- `FR-PR-03` Each PR line: item (master via `HC-03` or free-text), quantity, unit, specification, estimated unit rate, estimated total, supporting attachments (BOQ, inventory shortage report, forecast sheet, project approval, email).
- `FR-PR-04` System computes `total_estimated_amount` as sum of line totals.
- `FR-PR-05` On submit, the system creates an `E-APR` approval request following `SM-PR`. The approval chain is determined by department, value bucket, and whether technical evaluation is required (configurable per item category).
- `FR-PR-06` Approvers see budget availability for the PR's cost center via `HC-04`; if PR amount > remaining budget, approval is blocked with a "budget exceeded" error unless an override role (default `R-CFO`) intervenes.
- `FR-PR-07` Send-back from any approver returns the PR to the previous step with a mandatory reason; reasons appear in the PR audit trail.
- `FR-PR-08` Once `procurement_approved`, the module commits budget against the cost center via `HC-04`. The PR appears in the procurement officer's queue and can be linked to one or more RFQs.
- `FR-PR-09` A PR can be partially fulfilled across multiple POs; the PR header shows fulfillment % per line.

### 6.4 Approvals & Workflow (`WF`)
- `FR-WF-01` Approval matrix configurable per document type (PR, PO, payment) by value buckets.
- `FR-WF-02` Default approval matrix:

  | Procurement Value (INR) | Approver |
  |---|---|
  | < ₹1 Lakh | Procurement Head |
  | ₹1–10 Lakhs | CFO |
  | > ₹10 Lakhs | CEO / Board signatory |

- `FR-WF-03` Each approval step records approver, action (approve / reject / send-back), comment, timestamp, IP, user-agent. Digital approval is treated as a digital signature for audit purposes.
- `FR-WF-04` Out-of-office: a user can delegate to another user for a date range; the delegate inherits permissions for that period only and the audit log shows both `acted_by` and `acted_for`.
- `FR-WF-05` SLA timers: each step has a configurable SLA (default 48h). Breaches trigger reminder notifications via `HC-09` and surface on the KPI dashboard.

### 6.5 RFQ (`RFQ`) — Source stage 4
- `FR-RFQ-01` Procurement officer drafts an RFQ from one or more approved PRs.
- `FR-RFQ-02` RFQ header captures: title, items, delivery location, delivery timeline, commercial terms, mandatory warranty clauses, submission deadline, validity, currency.
- `FR-RFQ-03` Vendors are added from the AVL. Minimum vendor count per RFQ is configurable per value bucket (default: < ₹1L → 1, ₹1–10L → 3, > ₹10L → 5).
- `FR-RFQ-04` On send, the system emails the RFQ via `HC-08` to each invited vendor's RFQ contact email. Each send creates an `E-EMAIL` row with the RFQ PDF attached. Send timestamp captured per vendor on `E-RFQV.sent_at`. **No portal link in the email.**
- `FR-RFQ-05` Vendor clarifications arrive by email. Procurement uploads the email + reply as `E-EMAIL` rows linked to the RFQ; both become part of the audit file.
- `FR-RFQ-06` Revised RFQ creates a new version; the system re-emails all invited vendors with the new version.

### 6.6 Quotation (`QUO`) — Source stage 5
- `FR-QUO-01` Procurement officer creates a Quotation per vendor by uploading the vendor's quotation PDF and capturing structured data: header (validity, currency, payment terms, freight, delivery weeks, warranty) and line items (basic price, GST %, freight, discount). The original vendor email is attached as `E-EMAIL` (inbound).
- `FR-QUO-02` Each quote receives a system quote number, time stamp, and recorded `received_via` (email / courier / hand-delivered / vendor's own portal).
- `FR-QUO-03` Quotations are immutable once saved; corrections happen via a "revised quotation" with explicit link to the previous version.
- `FR-QUO-04` Late quotes: if received after the RFQ deadline, the procurement officer must mark `late_accepted` with a reason; the audit log captures it.

### 6.7 Technical Evaluation (`TEV`) — Source stage 6
- `FR-TEV-01` Per quotation, technical reviewer marks each parameter Pass / Fail / NA with a comment and an outcome at quotation level: `Technically Qualified`, `Partially Qualified` (clarifications needed), `Rejected`.
- `FR-TEV-02` Parameters derived from RFQ specification or manually added.
- `FR-TEV-03` Signed technical evaluation report rendered as PDF and stored in DMS via `HC-07`.
- `FR-TEV-04` Only `Technically Qualified` quotations advance to commercial comparison.

### 6.8 Commercial Evaluation & Vendor Selection (`CS`, `VS`) — Source stages 7, 8
- `FR-CS-01` Auto-generate Comparative Statement for technically qualified quotes: Vendor, Base Price, GST, Freight, Other, Delivery weeks, Warranty, **Final landed cost**, **Rank**.
- `FR-CS-02` Final landed cost = base + GST + freight + other charges, in RFQ currency, normalised per-unit and total.
- `FR-CS-03` Rank by total landed cost (L1, L2, …); ties broken by delivery weeks ascending, then warranty descending.
- `FR-CS-04` Procurement officer records evaluation factors beyond price (delivery, warranty, payment terms, vendor reputation/score, AMC support) — each with a weight; the system computes a weighted Best-Value score in addition to L1.
- `FR-NEG-01` Negotiation rounds against any qualified vendor; each round records: items negotiated (price / credit terms / freight / delivery / warranty / penalty clauses), email proof, MOM upload, revised quotation link, approval note.
- `FR-VS-01` Procurement officer selects winner with one of: L1, Best-value, Technical superiority, Strategic vendor, Emergency. Reason is mandatory; PRN attached.
- `FR-VS-02` PRN contains: requirement summary, comparison summary, recommended vendor, financial impact (savings vs estimate, vs L1 if non-L1), justification.
- `FR-VS-03` PRN goes through approval per `FR-WF-02`.
- `FR-VS-04` Approved PRN unlocks PO creation against the selected vendor; PO is pre-filled from PRN + winning quotation + linked PRs.

### 6.9 Purchase Order (`PO`) — Source stage 9
- `FR-PO-01` PO header per `E-PO`. Lines inherit from winning quotation; quantities can be split across multiple POs from the same PR.
- `FR-PO-02` PO MUST include LD clause, warranty, payment terms, delivery terms, contact persons (buyer + vendor).
- `FR-PO-03` PO rendered as PDF using a versioned template; stored in DMS via `HC-07`. Digital signature using the org's certificate where configured; otherwise typed signature block + audit record.
- `FR-PO-04` PO **released to the vendor by email** via `HC-08` to the vendor's RFQ/PO contact, with the signed PDF attached. An `E-EMAIL` row records the send. No portal link.
- `FR-PO-05` Vendor acknowledgment is captured by procurement uploading the vendor's signed PO copy or forwarded acknowledgment email; both become evidence on `E-PO.acknowledged_at` and `acknowledged_evidence_doc_ids`.
- `FR-PO-06` Amendments require a fresh approval and create an `E-POAMD` entry; amended PDF is emailed to the vendor as version 2; original retained.
- `FR-PO-07` Cancellation post-release requires the original approval level + reason; if material has been dispatched, cancellation requires a return-material flow and credit note.

### 6.10 Advance Payment (`ADV`) — Source stage 10
- `FR-ADV-01` Allowed only if PO `payment_terms` includes an advance % AND a Proforma Invoice (`E-PI`) is uploaded by procurement.
- `FR-ADV-02` AP verifies PO ↔ PI ↔ vendor bank details (must match verified `E-VBANK`) before approving advance.
- `FR-ADV-03` Module **does not move money**: it produces a payment instruction (NEFT/RTGS file via `FR-PAY-04`) and posts the AP entry via `HC-05`. Treasury / banking happens in the host or externally.
- `FR-ADV-04` Advance is recorded with method, UTR/reference, amount, payment voucher PDF, bank advice attachment (uploaded after the actual disbursement).
- `FR-ADV-05` Advance is netted off automatically against the first/subsequent vendor invoice during 3-way match.

### 6.11 Dispatch & Logistics (`DISP`) — Source stage 11
- `FR-DISP-01` Procurement / warehouse uploads dispatch documents received from the vendor by email: Tax Invoice, Delivery Challan, E-Way Bill, LR Copy, Packing List, Serial Number List. Source email attached as `E-EMAIL` (inbound).
- `FR-DISP-02` Each dispatch references one PO and may cover one or more PO lines, partial quantities allowed.
- `FR-DISP-03` System validates E-Way Bill number format and Tax Invoice number uniqueness per vendor per fiscal year.
- `FR-DISP-04` Logistics tracking number and POD captured.

### 6.12 Goods Receipt (`GRN`) — Source stages 12, 13
- `FR-GRN-01` Warehouse user creates a GRN against a dispatch / PO. Per line: ordered, dispatched, received, accepted, short, damaged, remarks.
- `FR-GRN-02` GRN starts as `pending_inspection` if any line requires QA, else `accepted` directly.
- `FR-GRN-03` QA Inspector creates `E-INSP` per GRN with per-line outcomes: Accepted / Rejected / Conditional Acceptance with observation note.
- `FR-GRN-04` Rejected qty triggers a Return-to-Vendor flow (return delivery challan, debit note, replacement schedule).
- `FR-GRN-05` Accepted qty is **posted to the host inventory / asset register via `HC-06`** with serial numbers, batch numbers, warranty start date. The module does not maintain its own stock ledger.
- `FR-GRN-06` Cumulative accepted qty drives `partially_received` → `fully_received` on the PO.
- `FR-GRN-07` GRN posting also converts the cost-center commitment to actuals via `HC-04`, and posts an inventory-receipt voucher to the GL via `HC-05`.

### 6.13 Invoice & 3-Way Match (`INV`, `3WM`) — Source stage 15
- `FR-INV-01` AP user creates an Invoice record by uploading the vendor's tax invoice PDF and source email (as `E-EMAIL` inbound). E-invoice IRN captured if applicable.
- `FR-INV-02` 3-way match runs automatically: PO line rate × accepted GRN qty × correct tax = invoice line amount, within tolerances (default qty 0%, rate 0.5%, tax 0%).
- `FR-INV-03` Outcomes: `matched` → routed for payment approval; `exception` → AP must resolve.
- `FR-INV-04` Exception types: quantity mismatch, tax mismatch, price mismatch, damaged goods, missing GRN, duplicate invoice number, vendor bank mismatch.
- `FR-INV-05` Resolution: debit note, credit note, request revised invoice from vendor (procurement emails the vendor; reply uploaded as `E-EMAIL`), return material, override-with-approval (CFO).
- `FR-INV-06` Duplicate invoice detection: block any invoice where (vendor + invoice number + fiscal year) already exists.
- `FR-INV-07` On `approved_for_payment`, post the AP voucher to the host GL via `HC-05`.

### 6.14 Vendor Payment Trigger (`PAY`) — Source stage 16
The module **prepares** payment; treasury/banking actually moves money. The module records the payment after disbursement is confirmed.

- `FR-PAY-01` Payment is processed only when invoice is `approved_for_payment` and PO is not on hold.
- `FR-PAY-02` Pre-payment checks: invoice approval state, GRN existence, PO match, TDS computation, GST compliance flag. (GST API verification is `ASSUMPTION:` v2; v1 uses a manual checkbox.)
- `FR-PAY-03` TDS section/rate from vendor's `default_tds_section` and section-rate master; user override requires a reason.
- `FR-PAY-04` Methods: NEFT, RTGS, LC, Cheque. The module generates a bank-format payment file (per bank template) for NEFT/RTGS; cheque-print template; LC capture form. Files / instructions are handed to the host's treasury process via `HC-05` or downloaded by the AP user.
- `FR-PAY-05` Payment record captures: amount, TDS withheld, net paid, UTR / cheque number / LC reference, bank advice attachment, payment voucher PDF, GL posting reference returned by `HC-05`.
- `FR-PAY-06` On confirmation, generate TDS certificate stub for quarterly Form 26Q.

### 6.15 PO Closure & Audit (`CLO`, `AUD`) — Source stage 17
- `FR-CLO-01` PO closes only on full receipt (or short-close approval), full payment, no pending claims, all mandatory documents present.
- `FR-CLO-02` Compile audit file as a single PDF/ZIP bundle: PR, approvals, RFQ, quotations, technical evaluation, comparative statement, negotiation, PO, PO acknowledgment, proforma invoice (if advance), tax invoice, e-way bill, LR copy, GRN, inspection report, payment proof, debit/credit notes — plus the full `E-EMAIL` correspondence trail with the vendor.
- `FR-CLO-03` Vendor performance evaluation form generated and stored against the vendor.
- `FR-AUD-01` Append-only audit entries via `HC-11` or in module-owned `E-AUD` with no UPDATE/DELETE permission for app users.
- `FR-AUD-02` Auditor (`R-AUD`) can view any record, search by PO/PR number, vendor, date range, and export the audit bundle.

---

## 7. API specification

REST + JSON, mounted at `/api/procurement/v1/*` inside the ERP's API surface. Auth and authorisation come from the host ERP (`HC-01`); the module never issues its own tokens. Errors follow RFC 7807 problem+json. Standard envelope: list endpoints return `{ items, page, total }`; action endpoints return `{ item, allowed_actions }`.

### 7.1 Endpoint inventory

```
# Vendors
GET    /vendors
POST   /vendors
GET    /vendors/{id}
PATCH  /vendors/{id}
POST   /vendors/{id}/submit-for-kyc
POST   /vendors/{id}/activate
POST   /vendors/{id}/block
POST   /vendors/{id}/blacklist
POST   /vendors/{id}/documents
POST   /vendors/{id}/banks
POST   /vendors/{id}/banks/{bank_id}/verify
POST   /vendors/{id}/contacts

# Purchase Requisitions
GET    /prs
POST   /prs
GET    /prs/{id}
PATCH  /prs/{id}
POST   /prs/{id}/submit
POST   /prs/{id}/approve
POST   /prs/{id}/reject
POST   /prs/{id}/send-back
POST   /prs/{id}/cancel

# RFQs
POST   /rfqs
GET    /rfqs/{id}
POST   /rfqs/{id}/send             # triggers email via HC-08 to all invited vendors
POST   /rfqs/{id}/clarifications   # upload received email + reply
POST   /rfqs/{id}/revise

# Quotations (uploaded by procurement on vendor's behalf)
POST   /rfqs/{rfq_id}/quotations
GET    /quotations/{id}
POST   /quotations/{id}/revise

# Technical Evaluation
POST   /rfqs/{rfq_id}/technical-evaluations
PATCH  /technical-evaluations/{id}

# Comparative Statement & Selection
GET    /rfqs/{rfq_id}/comparative-statement
POST   /rfqs/{rfq_id}/negotiations
POST   /rfqs/{rfq_id}/recommend
POST   /recommendations/{id}/approve

# Purchase Orders
POST   /pos
GET    /pos/{id}
POST   /pos/{id}/approve
POST   /pos/{id}/release           # emails signed PDF to vendor
POST   /pos/{id}/record-acknowledgment    # upload signed copy / forwarded email
POST   /pos/{id}/amend
POST   /pos/{id}/cancel

# Advance, Dispatch, GRN, Inspection
POST   /pos/{id}/proforma-invoices
POST   /advance-payments
POST   /pos/{id}/dispatches        # uploaded by procurement / warehouse
POST   /grns
PATCH  /grns/{id}
POST   /grns/{id}/inspect
POST   /grns/{id}/post-inventory   # calls HC-06

# Invoices, 3WM, Payments
POST   /pos/{id}/invoices          # uploaded by AP
GET    /invoices/{id}/three-way-match
POST   /invoices/{id}/resolve-exception
POST   /invoices/{id}/approve-for-payment
POST   /payments
POST   /payments/{id}/mark-completed

# Closure & Audit
POST   /pos/{id}/close
GET    /pos/{id}/audit-bundle      # presigned URL via HC-07
GET    /audit-log?<filters>

# Email correspondence
GET    /emails?linked_entity_type=&linked_entity_id=
POST   /emails                     # upload an inbound email + attachments

# Procurement masters (module-owned)
CRUD   /tds-sections
CRUD   /approval-matrices
CRUD   /procurement-item-attrs
```

A complete OpenAPI 3.1 document is part of the implementation deliverable.

---

## 8. UI / UX

The module's UI lives **inside the host ERP's existing SPA shell**. It does not own login, top nav, global search, or user/role admin screens.

### 8.1 Module pages (route prefix `/procurement/*`)
1. **Procurement home** — pending approvals, draft documents, SLA breaches, KPI tiles.
2. **PR list + detail** — list with filters (status, dept, value, date), detail with line items, attachments, approval history, linked RFQs/POs.
3. **RFQ workspace** — header, invited vendors with send/clarification status, quotation upload widget, side-by-side quote viewer, technical evaluation grid, comparative statement table, PRN drafting.
4. **PO list + detail** — PO PDF preview, amendments timeline, dispatches, GRNs, invoices, payments, audit trail tab, email correspondence tab.
5. **Vendor master** — vendor list, KYC checklist, document vault, contacts, performance scorecard, PO history.
6. **Warehouse / GRN workspace** — pending dispatches, GRN entry with serial / batch capture, inspection module.
7. **AP workspace** — invoice inbox (uploaded invoices awaiting match), 3WM exceptions queue, payment runs, TDS register.
8. **Audit explorer** — search across procurement records, audit log viewer, audit bundle export.
9. **Procurement admin** — approval matrices, TDS sections, number series (if module-owned), procurement-only item attributes, document templates.

User management, department management, item master CRUD, GL, and inventory views are accessed through the **existing host ERP screens**, not within this module.

### 8.2 UX principles
- Lists: server-side pagination, sortable columns, saved filter views (using the host shell's conventions).
- Detail pages: persistent right-side panel showing approval chain + audit log + email correspondence.
- Buttons driven by `allowed_actions` from the API, never hardcoded.
- Indian numbering for INR; ISO formatting otherwise.
- Forms validate against the same JSON schema served by the API.

---

## 9. Integrations

### 9.1 Host ERP (internal)
See §3.2: `HC-01` IAM, `HC-02` org, `HC-03` item master, `HC-04` cost center / budget, `HC-05` GL/AP, `HC-06` inventory & assets, `HC-07` DMS, `HC-08` email gateway, `HC-09` notifications, `HC-10` number series, `HC-11` audit log, `HC-12` reporting.

### 9.2 External

| Integration | Purpose | v1 / v2 |
|---|---|---|
| GST verification API (GSTN) | GSTIN validity + return filing status | v2 (manual checkbox in v1) |
| E-Invoice IRP | IRN validation | v2 |
| E-Way Bill API | E-way bill validity | v2 |
| Bank payment file formats | NEFT/RTGS templates per partner bank | v1 |
| Bank statement reconciliation | Match UTR with bank feed | v2 |
| Digital signature (DSC) | Server-side PO signing using PKCS#11 / HSM | v2 (typed sig + audit in v1) |

All inbound vendor communication is **email**; there is no inbound API from vendors.

---

## 10. Documents & file management

- All files live in the host DMS via `HC-07`, namespaced under `procurement/`.
- Each document entry stores `document_type`, `mime`, `size_bytes`, `sha256`, `dms_ref`, `original_filename`, `uploaded_by`, `linked_entity_type`, `linked_entity_id`, `is_locked` (true after entity is in a terminal state).
- SHA-256 generated on upload; downloads verify hash.
- Inline preview: PDF, PNG, JPEG; other types download-only.
- Mandatory document checklist enforced by `FR-CLO-02` before PO closure.

---

## 11. Notifications

Delivered via host notification service (`HC-09`) — both in-app and email.

Templates per event: PR submitted, PR approval pending, PR approved/rejected, RFQ ready to send, RFQ sent, quotation uploaded, PO released to vendor, PO acknowledgment recorded, dispatch uploaded, GRN posted, invoice uploaded, 3WM exception, payment released, PO closed.

User notification preferences are managed in the host ERP's user-preferences screen, not in this module.

---

## 12. Reports & KPIs

Registered as procurement datasets in the host reporting layer (`HC-12`), or rendered inline if no host reporting exists:

- Procurement Cycle Time (PR → PO, PR → delivery, PR → payment)
- On-Time Delivery % per vendor / item category
- Cost Savings (negotiated vs estimated; negotiated vs L1)
- GRN Delay (dispatch → GRN posting)
- Invoice Processing Time (invoice received → payment released)
- Spend by department / cost center / vendor / category
- Vendor performance scorecard
- Approval SLA breach report
- Audit bundle export per PO / per fiscal year

CSV and XLSX export.

---

## 13. Security & permissions matrix

### 13.1 Cross-cutting
- TLS 1.2+ inherited from host.
- Auth/authz inherited from host (`HC-01`); the module checks role membership server-side on every request.
- Sensitive PII (PAN, bank account number) encrypted at column level with envelope encryption (KMS-backed if host provides; otherwise a module-owned KMS adapter).
- Field-level audit captures before/after values for all updates (in `E-AUD` or `HC-11`).
- Rate limits inherited from host gateway.

### 13.2 Permission matrix (excerpt)

| Action | R-REQ | R-DH | R-TECH | R-FIN | R-PROC | R-PROCH | R-CFO | R-CEO | R-WH | R-QA | R-AUD | R-ADMIN |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Create PR (own dept) | ✓ |   |   |   |   |   |   |   |   |   |   |   |
| Approve PR (dept) |   | ✓ |   |   |   |   |   |   |   |   |   |   |
| Approve PR (technical) |   |   | ✓ |   |   |   |   |   |   |   |   |   |
| Approve PR (finance/budget) |   |   |   | ✓ |   |   |   |   |   |   |   |   |
| Approve PR (procurement) |   |   |   |   |   | ✓ |   |   |   |   |   |   |
| Create / send RFQ |   |   |   |   | ✓ |   |   |   |   |   |   |   |
| Upload quotation |   |   |   |   | ✓ |   |   |   |   |   |   |   |
| Run technical eval |   |   | ✓ |   |   |   |   |   |   |   |   |   |
| Recommend vendor |   |   |   |   | ✓ |   |   |   |   |   |   |   |
| Approve PO < ₹1L |   |   |   |   |   | ✓ |   |   |   |   |   |   |
| Approve PO ₹1–10L |   |   |   |   |   |   | ✓ |   |   |   |   |   |
| Approve PO > ₹10L |   |   |   |   |   |   |   | ✓ |   |   |   |   |
| Release PO (email vendor) |   |   |   |   | ✓ |   |   |   |   |   |   |   |
| Record PO acknowledgment |   |   |   |   | ✓ |   |   |   |   |   |   |   |
| Post GRN |   |   |   |   |   |   |   |   | ✓ |   |   |   |
| Inspect GRN |   |   |   |   |   |   |   |   |   | ✓ |   |   |
| Upload vendor invoice |   |   |   | ✓ |   |   |   |   |   |   |   |   |
| Resolve 3WM exception (≤ ₹1L) |   |   |   | ✓ |   |   |   |   |   |   |   |   |
| Resolve 3WM exception (> ₹1L override) |   |   |   |   |   |   | ✓ |   |   |   |   |   |
| Trigger payment |   |   |   | ✓ |   |   |   |   |   |   |   |   |
| Close PO |   |   |   |   | ✓ |   |   |   |   |   |   |   |
| Read everything |   |   |   |   |   |   |   |   |   |   | ✓ |   |
| Manage procurement masters |   |   |   |   |   |   |   |   |   |   |   | ✓ |

Self-approval and consecutive-step approval by the same user are forbidden by `FR-WF-04` regardless of role. User and host-master administration is performed in the host ERP, not here.

---

## 14. Non-functional requirements

- `NFR-01` p95 API latency < 400 ms read, < 800 ms write under 50 concurrent procurement users per org.
- `NFR-02` Module uptime tracks host ERP uptime (target 99.5% v1).
- `NFR-03` Audit data retained 8 years (Indian Companies Act + tax retention).
- `NFR-04` All times UTC, displayed in user's preferred timezone (default `Asia/Kolkata`).
- `NFR-05` Optimistic concurrency via `If-Match` / `version`.
- `NFR-06` Backups inherited from host; verify procurement schema is included.
- `NFR-07` i18n framework in place; en-IN default.
- `NFR-08` WCAG 2.1 AA.
- `NFR-09` Decimal arithmetic for all monetary computations (never float).

---

## 15. Phased implementation plan

**Phase 1 — Foundations & Vendor Master (3 weeks)**
- Module bootstrap inside ERP shell; routing, layout, design system integration.
- Wire up `HC-01` (auth), `HC-02` (org), `HC-07` (DMS), `HC-09` (notifications), `HC-11` (audit).
- Vendor master with KYC, contacts, bank verification (dual-control).
- Procurement-owned masters (TDS sections, approval matrices, procurement item attributes).

**Phase 2 — Requisition to PO (4 weeks)**
- PR module + approval workflow; budget commitment via `HC-04`.
- RFQ + email send via `HC-08`.
- Quotation upload + Technical Evaluation + Comparative Statement + Negotiation + Vendor Selection.
- PO creation, approval, release-by-email, acknowledgment-by-upload.

**Phase 3 — Receipt to Payment (4 weeks)**
- Dispatch upload, GRN + Inspection, inventory posting via `HC-06`, GL posting via `HC-05`.
- Vendor invoice upload, 3-way matching, exception handling.
- Advance payment + final payment, NEFT/RTGS file generation, TDS handling.

**Phase 4 — Closure, Audit, KPIs (2 weeks)**
- PO closure, audit bundle generation.
- Vendor performance scorecard.
- KPI datasets registered with host reporting (`HC-12`).

**Phase 5 — Hardening & UAT (2 weeks)**
- Performance, security review, data migration, UAT, go-live.

Total: ~15 weeks.

---

## 16. Acceptance criteria (sample test scenarios)

Each MUST be implemented as an automated end-to-end test, with stubs for each `HC-*` contract.

1. **Happy path PR → payment.** A `R-REQ` user raises a PR for ₹4,50,000. Approvals: DH → Tech → Finance → Procurement Head. RFQ emailed to 3 vendors via `HC-08`; 3 quotation PDFs uploaded by procurement; 2 technically qualified. CS shows L1 = Vendor B at ₹4,38,000. Negotiation reduces to ₹4,20,000 (revised quote PDF uploaded). PRN approved by CFO. PO released by email; signed PO copy received by email and uploaded to record acknowledgment. Dispatch docs emailed by vendor and uploaded; goods received in 2 GRNs, both inspected and accepted; inventory posted via `HC-06`. Invoice emailed by vendor and uploaded; 3WM matched; AP voucher posted via `HC-05`; payment file generated, UTR captured, voucher posted. PO closed; audit bundle contains all mandatory documents AND the full email correspondence trail.
2. **Budget exceedance.** PR exceeds cost-center remaining budget per `HC-04`. Finance approval blocked; CFO override succeeds with reason; audit log shows override.
3. **Self-approval prevention.** A user holds R-REQ and R-DH. The PR they raised does not appear in their own DH approval queue.
4. **Duplicate vendor.** Attempt to create a vendor with an active duplicate GSTIN — blocked, existing record surfaced.
5. **Late quotation.** Procurement uploads a quote received after the deadline. Default rejection; with `late_accepted=true` + reason, accepted and audit-logged.
6. **3WM quantity exception.** PO 100 units; GRN accepted 95; invoice billed 100. Exception raised. Procurement emails the vendor for revised invoice (email captured); revised invoice uploaded for 95 units; match clears; payment proceeds.
7. **Duplicate invoice.** AP attempts to upload invoice number `INV-2026-001` for a vendor that already has it — blocked.
8. **Partial deliveries.** PO with two lines delivered in three GRNs across two months; PO transitions through `partially_received` then `fully_received`.
9. **PO amendment.** Released PO has its delivery date amended. Amendment goes through original approver; amended PDF emailed to vendor as version 2; both versions accessible.
10. **Cancellation post-dispatch.** Buyer cancels post-dispatch. CFO approval, return delivery challan, and credit note required before `cancelled`.
11. **PO closure missing document.** Closure attempt without inspection report fails with a clear list of missing mandatory documents.
12. **Audit immutability.** Direct API/DB attempts to modify audit rows fail. Soft-delete on a source row writes a new audit entry; existing entries are untouched.
13. **Email send failure.** RFQ email send returns a bounce via `HC-08` DSN. The RFQ shows the bounced vendor in red; procurement officer can re-trigger send to a corrected address; original bounce remains in `E-EMAIL` history.
14. **Inventory posting failure.** GRN posted but `HC-06` returns an error. GRN remains `accepted_pending_inventory_post`; a retry job runs hourly; AP cannot run 3WM until inventory post succeeds.
15. **GL posting failure.** Payment voucher fails to post via `HC-05`. Payment is held in `posting_pending`; an alert raised; retry workflow runs.

---

## 17. Open questions for the product owner

1. **Which ERP is the host?** This determines concrete mappings for `HC-01` … `HC-12`. Options: in-house, SAP S/4 / ECC, Oracle EBS / Fusion, Microsoft Dynamics, Odoo, Tally, NetSuite, or other.
2. Does the host ERP already provide a workflow engine, or should the module ship its own?
3. Does the host ERP own vendor master? **Default assumption:** the procurement module owns vendor master and exposes it to AP via internal APIs. Confirm or specify the host's vendor master to integrate with.
4. Multi-org / multi-company: how does the host represent it? Where do POs raised in Org A for Org B's department go?
5. Foreign-currency POs in scope? FX rate source?
6. GST e-invoice IRN generation in v1 or v2? (current `ASSUMPTION:` v2)
7. Digital signature certificates available for PO signing in v1? (current `ASSUMPTION:` typed sig + audit in v1)
8. Default approval matrix thresholds — confirm the source-document defaults are correct for the target organisation.
9. Data migration: legacy vendors / open POs / open PRs to import? In what format?
10. Localisation: any language other than en-IN required at launch?
11. Government tender / GeM compliance flow — is it required, or out of scope?
12. Inbound email parsing (`HC-08` v2): is there an existing org mailbox that can be polled, or per-RFQ alias capability?

---

## 18. Deliverables

By end of implementation, Claude Code MUST produce:
- A procurement module integrated into the host ERP repo (or a clearly-bounded service in a polyrepo), following the host's conventions for code layout, naming, and CI.
- Adapter implementations for each `HC-*` contract, behind interfaces, so the host can be swapped or stubbed in tests.
- An OpenAPI 3.1 spec covering all endpoints in §7.
- A complete schema (Prisma / SQLAlchemy / equivalent) for all module-owned entities in §4 with migrations.
- Seed scripts: default approval matrix per `FR-WF-02`, default TDS sections, sample vendor data, demo end-to-end PO fixture.
- Automated tests covering every scenario in §16, with stubs for each `HC-*` contract.
- A `README.md` with local-dev setup including how to run with stubbed host adapters.
- A `RUNBOOK.md` with operational procedures: backup/restore of procurement schema, rotating secrets, regenerating audit bundles, retrying failed `HC-05` / `HC-06` posts, handling email bounces.

---

*End of specification.*
