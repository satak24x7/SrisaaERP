# Solution Specification — Engineering View

> Condensed for engineering. Full spec with business narrative is in the separate Word document. For per-module entities and FRs, see `modules/*.md`.

## System in one diagram (textual)

```
           ┌───────────────────────────────────────┐
           │             Web (Angular)             │
           │  Compliance · Sales · PM · Finance    │
           └──────────────────┬────────────────────┘
                              │
           ┌──────────────────┼────────────────────┐
           │         Mobile (Ionic + Capacitor)    │
           │   Task updates · Expenses · MRs       │
           └──────────────────┬────────────────────┘
                              │ HTTPS (JWT)
                              ▼
                  ┌───────────────────────┐
                  │   API Gateway (Kong)  │  auth, rate limit
                  └─────────┬─────────────┘
                            │
          ┌─────────────────┼─────────────────┐
          │ Node.js + Express API (modular)  │
          │                                   │
          │  organization · sales · execution │
          │  · expense · procurement          │
          │                                   │
          │  Middleware: correlation · auth · │
          │  zod-validate · audit · errors    │
          └────┬────────────────┬─────────┬───┘
               │                │         │
          ┌────▼────┐     ┌─────▼────┐    │
          │ MySQL 8 │     │  Redis   │    │
          │  (RDS)  │     │  BullMQ  │    │
          └─────────┘     └──────────┘    │
                                          │
          ┌────────────┐     ┌────────────▼───┐
          │ OpenSearch │     │    RabbitMQ    │
          │            │     │  (outbox evts) │
          └────────────┘     └────────────────┘
                  
          ┌────────────┐     ┌────────────────┐
          │ S3 / MinIO │     │    Keycloak    │
          │  (files)   │     │  OIDC · MFA    │
          └────────────┘     └────────────────┘

      ┌───────────────────────────────────────────┐
      │  Workflow: Camunda 8 (Zeebe)              │
      │  Stage-gated flows (Sales, Expense, MR)   │
      └───────────────────────────────────────────┘

      ┌───────────────────────────────────────────┐
      │  Observability: Prom/Loki/Tempo/Grafana   │
      │  + Sentry for errors                      │
      └───────────────────────────────────────────┘
```

## Cross-cutting: Business Units & P&L Tracking

- **Every domain entity is tagged to a Business Unit** — Sales (Accounts, Leads, Opportunities), Projects, Procurement (MRs, POs), and Expenses are all tracked against a BU
- The singleton `company` table is the only entity not BU-scoped
- **Each BU runs its own P&L** — revenue (from awarded opportunities/projects) and costs (expenses, procurement, cost-of-sale) roll up per BU for reporting
- BU Head (`business_unit.bu_head_user_id`) is resolved into approval chains; **the BU form filters this to users with the configured `bu_head` role**
- Reports can be filtered by BU; users see only the BUs they belong to
- `businessUnitId` is **mandatory** on: Lead, Opportunity, Project, ExpenseSheet, MaterialRequest
- **Account and Contact are NOT BU-scoped** — they are shared across the organization. A government department (Account) can be pursued by multiple BUs, and a Contact (officer) can be associated with multiple Accounts via the `account_contact` join table

## Cross-cutting: User-Role Model

- Users can have **multiple global roles** via the `user_role` join table (many-to-many)
- Roles are assigned in the Users management UI via a multi-select
- BU-specific role membership is separate (`business_unit_member` table)
- BU Head eligibility is determined by having the `bu_head` role assigned

## Cross-cutting: Company Documents

- The `company_document` table stores file metadata (name, fileName, mimeType, fileSize, storagePath, sortOrder)
- Files are stored on disk (`uploads/company-docs/`); migrateable to S3/MinIO for production
- Documents support drag-to-reorder; order persisted via `sort_order` column
- Card view in UI with file-type icons (Image, PDF, Word, PPT, Excel, Other)
- Authenticated file download via blob fetch (not direct URL — auth headers required)

## Cross-cutting: UI Patterns

- All `p-select` and `p-multiSelect` inside `p-dialog` must use `appendTo="body"` to prevent dropdown clipping
- Complex entities (>6 fields, multiple many-to-many) get dedicated detail pages (`/:id` routes) instead of inline dialogs
- File downloads use `HttpClient.get(url, { responseType: 'blob' })` + `URL.createObjectURL()` to include auth headers
- Lookup-based dropdowns fetch from `GET /api/v1/lookup-lists/by-code/:code/items`, filtering by `isActive`

## Cross-cutting: Lookup Lists

- The `lookup_list` + `lookup_item` tables provide **configurable dropdown options** managed via Administration → Lookup Lists
- Each list has a unique `code` (e.g. `account_type`, `opportunity_stage`, `entry_path`) and a display `name`
- Items have `label` (display), `value` (stored), `sortOrder`, and `isActive` flag
- API: `GET /api/v1/lookup-lists/by-code/:code/items` returns items for a given list code — used by all dropdown components
- Replaces hardcoded Prisma enums for: Account Type, Opportunity Stage, Entry Path
- New lists can be created at runtime without schema changes

## Cross-cutting: CRM Entity Model

- **Account** — Government departments, agencies, PSUs. Has optional `governmentId` link. NOT BU-scoped (shared org-wide). Code (1-5 chars, unique).
- **Contact** — Officers/people. Many-to-many with Account via `account_contact`. NOT BU-scoped.
- **Lead** — Early-stage interest. BU-scoped (required). Converts to Opportunity via `POST /leads/:id/convert`.
- **Opportunity** — Full sales pipeline entity. BU-scoped. Stage and Entry Path from lookup lists. Multiple contacts (`opportunity_contact`), multiple influencers (`opportunity_influencer`). Owner (user). Account + End Client (both from Account table).
- **Government** — National or State. Linked to Accounts and Influencers.
- **Influencer** — Political/Bureaucrat/Other. Linked to Government. 5-star rating. Many-to-many with Opportunity.

## Cross-cutting: Work Area (Activities, Travel Plans, Password Manager)

### Activities (Event/Task)
- **Activity** has `activityType`: EVENT or TASK. Category from lookup list `activity_category`.
- **Events** have `startDateTime`, `endDateTime`, `isAllDay`. **Tasks** have `dueDateTime`, `taskStatus` (OPEN/OVERDUE/CLOSED).
- **Polymorphic associations** via `activity_association` join table — an activity can link to multiple objects (Opportunity, Lead, Account, Contact, Influencer, Project) simultaneously.
- **Multiple contacts** per activity via `activity_contact` join table.
- **Embeddable panel** — `<app-activity-panel entityType="X" [entityId]="id" />` shows activities linked to any entity. Used on Opportunity detail page.
- **Calendar** — FullCalendar (day/week/month) shows events, tasks, and travel plans. Click to view/edit. Click date to create.
- API resolves entity names on associations (batch lookup across all entity types).

### Travel Plans
- **3-role workflow**: Requester creates + adds expenses; Approver approves plan + reimbursement; Admin books tickets/hotels.
- **Status flow**: `DRAFT → SUBMITTED → APPROVED → BOOKING → IN_PROGRESS → EXPENSE_SUBMITTED → COMPLETED` (with REJECTED → DRAFT for revision).
- **Cost split**: Tickets + Hotels = company-paid. Expenses = traveller-paid (reimbursable). Total cost shared equally across linked objects for Cost of Sale.
- **Reimbursement tracking**: Due = Expenses − Advance. Tracks paid amount + payment reference.
- **Polymorphic associations** (same pattern as Activities) — travel costs distributed equally across linked objects.
- **Calendar integration** — travel plans appear as purple all-day events spanning start→end dates.
- Ticket and Hotel records support attachment fields.

### Password Manager
- **AES-256-GCM encryption** at rest for passwords and security question answers. Key from `ENCRYPTION_KEY` env var.
- **Visibility model**: PERSONAL (owner only), ROLE (shared with users who have a specific role), ALL (everyone).
- **Security questions**: Each entry can have multiple Q&A pairs, answers encrypted independently.
- Passwords never returned in list view — only decrypted on individual GET.
- Only the **owner** can edit or delete entries.

## Cross-cutting: Execution Core Patterns

### Milestone Deliverables
- `MilestoneDeliverable` model: each milestone can have multiple deliverables (name, description, status, completedDate).
- **Auto-complete**: when all deliverables for a milestone are marked COMPLETED, the milestone status automatically transitions to COMPLETED.
- `Milestone.originalPlannedDate` — set once when the project transitions from DRAFT to ACTIVE. Enables baseline-vs-actual variance tracking.
- Milestones track `% of contract` for invoicing alignment.

### Work Items (WBS)
- "Task" renamed to "Work Item" in the project execution UI context. The API still uses `/projects/:id/tasks` for backward compatibility.
- Hierarchical (parent-child tree), milestone-required, priority (LOW/MEDIUM/HIGH/CRITICAL).
- Kanban column assignment with 6 fixed columns: Backlog, To Do, In Progress, Blocked, In Review, Done.
- Effort logging per work item per day via `TaskEffortLog`.

### Bank Guarantees
- Renamed from "PBG & Retention" to "Bank Guarantees" for clarity.
- Types: PBG (Performance Bank Guarantee) and RETENTION.
- Fields: bank name, BG number, amount, issued date, expiry date, status (ACTIVE/RELEASED/EXPIRED).
- API: `CRUD /projects/:id/pbg-records` (API path unchanged for backward compatibility).

### Project Documents
- `ProjectDocument` model: name, fileName, mimeType, fileSize, storagePath, sortOrder.
- Files stored on disk (`uploads/project-docs/:projectId/`); migrateable to S3/MinIO.
- Card view in UI with file-type icons, drag-to-reorder via CDK.
- Authenticated file download via blob fetch.

### Cash Flow (Standalone)
- Cash Flow moved from an in-project tab to a standalone page at `/execution/cash-flow`.
- Project selector dropdown to view cash flow for any project.
- Two sections: Inflow Plan (milestone-aligned invoices) + Cash Flow Periods (monthly balances).

## Cross-cutting: Mobile App Architecture

### Stack
- **Ionic 8** (UI framework) + **Capacitor 6** (native bridge) + **Angular 19** (app framework)
- Located at `apps/mobile/` in the monorepo
- Shares API endpoints with the web app (same Express backend)

### Authentication
- Keycloak OIDC via `angular-auth-oidc-client` (same library as web app)
- Token refresh handled automatically; secured routes via `AuthGuard`

### Tab Structure
1. **Activities** — list view with Open/Upcoming/Completed segment tabs, My Items toggle, create/edit/detail pages, swipe actions (complete, edit)
2. **Calendar** — custom month grid with colored dots per day (green=events, blue=tasks, purple=travel), day selection shows that day's events, multi-day event support
3. **Travel Plans** — list with status filter chips, detail page with 4 segments (Tickets, Hotels, Expenses, Summary), workflow transition buttons based on current status

### Platform Support
- Android platform configured, debug APK builds successfully
- iOS support available via Capacitor but not yet configured
- Online only (no offline/sync support yet)

## Sales workflow (quick map)

```
 Managed Tender path                  Standard Tender path
 ────────────────────                 ─────────────────────
 M1 Initiate department               1. Opportunity Capture
 M2 Identify stakeholders             2. Go / No-Go
 M3 Demo / Presentation               3. Pre-Bid
 M4 Identify Master SI                4. Solution & Proposal
 M5 Submit DPR & Proposal             5. Bid Submission
 M6 DPR Approved                      6. Bid Evaluation
 M7 RFP Prepared ─┐                       6a Pre-Qualification
                  │                       6b Technical
                  └─────── auto-link ─►   6c Financial
                                      7. Award → Project created
                                      8. Loss (alternate)
```

Five entry paths: Managed (full upstream) · Standard · Active Tender (imported) · Solution Proposal (direct) · Rate Contract / GeM Direct.

## Material & Procurement flow

```
 Project Team ─── MR ──► PM ──► BU Head ──► Admin
                                                 │
                                                 ▼
                                           Indent / RFQ
                                                 │
                                                 ▼
                                              PO (commitment)
                                                 │
                                                 ▼
                                         Vendor delivers
                                                 │
                                                 ▼
                                               GRN
                                                 │
                                                 ▼
                                      Stores ──► Issue ──► Project Team
                                                 │
                                                 ▼
                                         Consumption / Return
```

## Expense sheet flow

```
Draft ─► Submitted ─► Under Review ─► Approved ─► Payment Pending ─► Paid
              ▲             │
              │             ▼
              └── Returned for Clarification
                            │
                            ▼
                        Rejected (terminal)
```

## Event choreography (key async events)

| Event | Publisher | Consumer | Action |
|---|---|---|---|
| `sales.opportunity.awarded` | sales | execution | Create Project shell |
| `managed-tender.rfp-prepared` | sales | sales | Auto-create linked Standard Opportunity |
| `expense.sheet.paid` | expense | integrations | GL post + notify claimant |
| `procurement.po.issued` | procurement | execution | Post commitment to budget |
| `procurement.issue.done` | procurement | execution | Post actual to material line |
| `compliance.validity.expiring` | org | notifications | 90/60/30-day alerts |

## Role → module access matrix (high level)

| Role | Org | Sales | Exec | Expense | Procurement |
|---|---|---|---|---|---|
| Super Admin | Full | Full | Full | Full | Full |
| Compliance | Write | Read | Read | — | — |
| BU Head | Read | Approve (BU) | Approve (BU) | Approve (BU) | Approve (BU) |
| BD / Sales | Read | Full (BU) | Read | Submit | — |
| Bid Manager | Read | Full | Read | — | — |
| PM | Read | Read | Full (project) | Approve (project) | Approve (project MRs) |
| Task Owner | — | — | Own tasks | Submit | Raise MR |
| Admin / Procurement | Read | — | Read | Submit | Full |
| Stores | Read | — | Read | — | GRN + Issue |
| Finance | Read | Read | Read | Pay | Read |
| CXO | Read | Read | Read | Approve (high) | Read |

## What's deliberately minimal in v1

- No GeM / CPPP live APIs — Playwright scrapers + manual upload
- No digital signature integration (see PRD non-goals)
- No competitor-price intelligence
- No in-app GST filing
- No BIM / CAD for construction
