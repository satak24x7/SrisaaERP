# Module 4 — Expense Management

**Purpose:** Formal, auditable workflow for capturing, approving and paying expenses — Pre-Project (against Opportunity's Cost of Sale) and During-Project (against Project budget line).

**Primary users:** All employees (claimants), PM, BU Head, Admin Head, Finance.

## Sheet types

| Type | Linked to | Budget source | Approval chain |
|---|---|---|---|
| Pre-Project | Opportunity / Managed Tender | Cost of Sale budget | Sales Lead → BU Head (if > threshold) → Finance |
| During-Project | Project + Milestone | Project budget line | PM → BU Head (if > threshold) → Finance |
| Admin / General | Cost Centre / Dept | Dept operating budget | Admin Head / Dept Head → Finance |
| Reimbursement | Employee payable | Matching project/BU/CC | Reporting Manager → BU Head (if > threshold) → Finance |

## Lifecycle states

`Draft` → `Submitted` → `Under Review` → `Returned for Clarification` → `Approved` → `Payment Pending` → `Paid`  
(plus terminal `Rejected`)

State transitions are event-sourced in `expense_sheet_event` — every change captures actor, timestamp, comment.

## Core entities

| Entity | Notes |
|---|---|
| `ExpenseSheet` | Claimant, type, cost-context (opp/project/CC), BU, period, total, status |
| `ExpenseLine` | Date, category, vendor, amount (paise), GST split, payment mode, bill file |
| `ApprovalStep` | Sheet ref, step no., approver role, approver user, action, comment, at |
| `Payment` | Sheet ref, mode, bank account, UTR, paid at, paid by |
| `ExpenseCategory` | Name, cap, reimbursable flag, GST input credit eligible |
| `PolicyRule` | Per-diem, travel class by grade, mileage rate, effective dates |
| `PolicyException` | Sheet line ref, rule, override reason, override by |

## Functional requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-4.1 | Expense Sheet with claimant, period, cost context, lines, totals, status | P0 |
| FR-4.2 | 4 sheet types: Pre-Project, During-Project, Admin/General, Reimbursement | P0 |
| FR-4.3 | Lifecycle: Draft → Submitted → Under Review → Returned → Approved → Payment Pending → Paid / Rejected | P0 |
| FR-4.4 | Multi-level approval chain configurable per BU and threshold | P0 |
| FR-4.5 | Expense lines with date, category, vendor, GST split, payment mode, bill | P0 |
| FR-4.6 | Policy engine (per-diem, travel class, caps); exceptions flagged | P1 |
| FR-4.7 | Budget availability check at approval step | P0 |
| FR-4.8 | Mobile-first submission with photo-capture + OCR-assist | P0 |
| FR-4.9 | Return-for-clarification; sheet returns to editable state | P0 |
| FR-4.10 | Auto-escalation on SLA breach (N business days) | P1 |
| FR-4.11 | Bulk approval and filters for approvers | P1 |
| FR-4.12 | Payment batching into payout runs; UTR capture | P0 |
| FR-4.13 | Reimbursable vs non-reimbursable; advance adjustment | P1 |
| FR-4.14 | Pre-Project sheets post to Cost of Sale of linked Opportunity / Managed Tender | P0 |
| FR-4.15 | During-Project sheets post to corresponding Project budget line | P0 |
| FR-4.16 | GL posting to accounting system on "Paid" | P1 |
| FR-4.17 | Expense Workbench dashboard (pending, SLA, exceptions) | P1 |
| FR-4.18 | Reimbursement-turnaround metric | P2 |

## Approval chain configuration

`business_unit.approval_thresholds` is a JSON column like:

```json
{
  "expense_sheet": {
    "pre_project": [
      { "limit_paise": 2500000, "approvers": ["SALES_LEAD"] },
      { "limit_paise": 10000000, "approvers": ["SALES_LEAD", "BU_HEAD"] },
      { "limit_paise": null, "approvers": ["SALES_LEAD", "BU_HEAD", "CFO"] }
    ],
    "during_project": [
      { "limit_paise": 1500000, "approvers": ["PM"] },
      { "limit_paise": 7500000, "approvers": ["PM", "BU_HEAD"] },
      { "limit_paise": null, "approvers": ["PM", "BU_HEAD", "CFO"] }
    ]
  }
}
```

The service resolves the chain based on sheet total on `submit`.

## Key API endpoints

```
GET    /api/v1/expense-sheets?status=...&bu_id=...&claimant_id=...
POST   /api/v1/expense-sheets
GET    /api/v1/expense-sheets/:id
PATCH  /api/v1/expense-sheets/:id                    # only in Draft/Returned
POST   /api/v1/expense-sheets/:id/lines
DELETE /api/v1/expense-sheets/:id/lines/:lineId
POST   /api/v1/expense-sheets/:id/submit
POST   /api/v1/expense-sheets/:id/approve            # current approver
POST   /api/v1/expense-sheets/:id/return             # with comment
POST   /api/v1/expense-sheets/:id/reject
POST   /api/v1/expense-sheets/:id/pay                # Finance; captures UTR

# Approval inbox
GET    /api/v1/approvals?scope=expense-sheet

# Workbench
GET    /api/v1/expense-workbench?bu_id=...
```

## Business rules to preserve

- A sheet cannot be edited after `Submitted` unless `Returned` is triggered.
- "Budget availability" at approval step: `budget_available - sum(pending_approvals_against_this_budget) >= sheet_total`. On insufficient funds, require explicit `override=true` + reason and notify CFO.
- A line's `reimbursable=true` sums into `payable_to_employee`; `false` posts to vendor payment.
- On `Paid`, the sheet is immutable; corrections require a reversing sheet, never edits.
- Timestamps on every event; audit log never pruned.
