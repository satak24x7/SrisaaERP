# Module 2 — Sales

**Purpose:** Manage the complete pre-award lifecycle of government opportunities across proactive (Managed Tenders) and reactive (Standard Tenders) flows; quantify Cost of Sale for every pursuit.

**Primary users:** BD / Sales Head, Bid Manager, Pre-Sales, BU Head.

## Workflows supported

### Managed Tenders (upstream, 7 stages)
`M1 Initiate with Department` → `M2 Identify Stakeholders` → `M3 Demo/Presentation` → `M4 Identify Master SI` → `M5 Submit DPR & Proposal` → `M6 DPR Approved` → `M7 RFP Prepared`

On M7, auto-create a **Standard Opportunity** linked to the Managed-Tender record, carrying forward stakeholders, documents and costs.

### Standard Tenders (8 stages)
`1 Opportunity Capture` → `2 Go/No-Go` → `3 Pre-Bid` → `4 Solution & Proposal` → `5 Bid Submission` → `6 Bid Evaluation` → `7 Award` → `8 Loss/No-Award`

### Bid Evaluation sub-stages
- **6a Pre-Qualification** — envelope 1; eligibility check
- **6b Technical Evaluation** — TEC scoring
- **6c Financial Evaluation** — BoQ opening, QCBS / L1

### Five entry paths
A: Managed Tender (full upstream) · B: Standard Tender · C: Active Tender (imported) · D: Solution Proposal (unsolicited/nomination) · E: Rate Contract / GeM Direct

## Core entities

| Entity | Status | Notes |
|---|---|---|
| `Account` | **Shipped** | Code (1-5), name, type (lookup `account_type`), government link, address, GSTIN. Not BU-scoped. |
| `Contact` | **Shipped** | Many-to-many with Account. First/last name, designation, influence level. |
| `Lead` | **Shipped** | BU-scoped. Source (lookup), status tracking, convert to Opportunity. |
| `Opportunity` | **Shipped** | Detail page. Stage + Entry Path from lookups. Multiple contacts + influencers. Owner (user). Account + End Client. Probability 0-100. |
| `Government` | **Shipped** | Admin module. NATIONAL/STATE, country, linked to Accounts + Influencers. |
| `Influencer` | **Shipped** | POLITICAL/BUREAUCRAT/OTHER, government link, 5-star rating, party name, qualifier. |
| `LookupList` + `LookupItem` | **Shipped** | Configurable dropdown system. Used for account_type, opportunity_stage, entry_path. |
| `ManagedTender` | Schema only | Stages M1–M7, department, theme, estimated value, expected RFP date |
| `ManagedTenderStakeholder` | Not started | Name, designation, organisation, influence, sentiment, interactions |
| `DPR` | Not started | Title, version, status, author, file, review comments |
| `Consortium` | Not started | Master SI, members, role split, revenue share |
| `ActiveTender` | Not started | Imported tender metadata from GeM / CPPP / manual |
| `GoNoGo` | Not started | Eligibility check results, conflict, sign-off |
| `Proposal` | Not started | Solution doc, BoQ, pricing model, compliance matrix |
| `BidSubmission` | Not started | EMD/BG ref, signed pack file, submission ack |
| `BidEvaluationResult` | Not started | Sub-stage results, scores, clarifications |
| `Award` | Not started | LoI/WO, PBG, agreement, kick-off date |
| `CostOfSale` | Not started | Opportunity ref, expense entries (links to Module 4) |

## Functional requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-2.1 | Managed-Tender records through 7 upstream stages | P0 |
| FR-2.2 | Stakeholder CRM within Managed Tenders | P0 |
| FR-2.3 | DPR repository with version control | P0 |
| FR-2.4 | Master SI / Consortium tracker | P1 |
| FR-2.5 | On M7 completion, auto-create linked Standard Opportunity | P0 |
| FR-2.6 | Opportunities across 8 Standard stages with entry/exit criteria | P0 |
| FR-2.7 | Import Active Tenders from GeM/CPPP; manual upload | P0 |
| FR-2.8 | All 5 entry paths | P0 |
| FR-2.9 | Go/No-Go workflow with eligibility and conflict check | P0 |
| FR-2.10 | Pre-bid activity tracker | P1 |
| FR-2.11 | Solution & Proposal workspace (BoQ, pricing, compliance matrix) | P0 |
| FR-2.12 | Bid Submission support: EMD/BG, signed-document upload, checklist | P0 |
| FR-2.13 | Bid Evaluation module with 3 sub-stages | P0 |
| FR-2.14 | Stage-gating between sub-stages | P1 |
| FR-2.15 | Clarification log per sub-stage | P1 |
| FR-2.16 | Award workflow with LoI/WO, PBG, auto-handover to Execution | P0 |
| FR-2.17 | Loss capture with structured reasons | P1 |
| FR-2.18 | Cost of Sale tracking per opportunity (8 categories, upstream costs included) | P0 |
| FR-2.19 | Timesheet-based effort costing posted nightly | P1 |
| FR-2.20 | EMD / Bid-Bond register | P0 |
| FR-2.21 | Opportunity-level P&L view | P1 |
| FR-2.22 | Managed-Tender ROI metric | P2 |

## Key API endpoints (indicative)

```
# Managed tenders
GET    /api/v1/managed-tenders
POST   /api/v1/managed-tenders
PATCH  /api/v1/managed-tenders/:id
POST   /api/v1/managed-tenders/:id/advance        # move to next stage
POST   /api/v1/managed-tenders/:id/publish-rfp    # triggers opportunity auto-creation

# Stakeholders
GET    /api/v1/managed-tenders/:id/stakeholders
POST   /api/v1/managed-tenders/:id/stakeholders

# Active tenders (imported)
GET    /api/v1/active-tenders
POST   /api/v1/active-tenders/:id/convert-to-opportunity

# Opportunities
GET    /api/v1/opportunities?bu_id=...&stage=...
POST   /api/v1/opportunities
POST   /api/v1/opportunities/:id/go-no-go
POST   /api/v1/opportunities/:id/submit-bid
POST   /api/v1/opportunities/:id/evaluation/pre-qualification
POST   /api/v1/opportunities/:id/evaluation/technical
POST   /api/v1/opportunities/:id/evaluation/financial
POST   /api/v1/opportunities/:id/award
POST   /api/v1/opportunities/:id/lose

# Cost of sale
GET    /api/v1/opportunities/:id/cost-of-sale
```

## Business rules to preserve

- Sub-stages of Bid Evaluation are strictly sequential; cannot record 6b until 6a is closed.
- On `POST /award`, a Project shell is created in Module 3 with contract value, milestones, documents and cost baseline copied forward.
- On loss, pursuit expenses remain linked; no refund from Cost of Sale.
- Managed Tender costs (travel, demos, DPR consulting) post to the Managed Tender's Cost of Sale bucket; on opportunity creation they are carried forward, not duplicated.
- An opportunity can have at most one upstream Managed Tender link but many downstream projects (for multi-work-order awards).
