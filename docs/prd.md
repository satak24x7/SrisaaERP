# Product Requirements Document (PRD) — Summary for Engineering

> This is a condensed, engineering-facing view of the PRD. The full PRD with business context, personas, risks and go-to-market lives in the separate Word document. Everything you need to build is here.

## What we're building

An integrated platform to run the end-to-end business of a company that executes government projects — from upstream department engagement, through bidding and evaluation, into project execution, expense management and material procurement.

## Personas (who will use it)

| Persona | Key actions in the product |
|---|---|
| Priya — Compliance Officer | Maintain org profile, certifications, DSC validity |
| Rajesh — Sales / BD Head | Pipeline, go/no-go, cost-of-sale |
| Meera — Bid Manager | Bid prep, EMD, compliance matrix, submission |
| **Vikram — BU Head** | BU portfolio, approvals above threshold across modules |
| Arjun — Project Manager | Plans, tasks, budget, first-level approvals |
| Kiran — Task Owner | Task updates, time log, expense, MR from site |
| **Neha — Admin / Procurement** | Indents, vendors, POs, GRN |
| **Ravi — Stores** | GRN, issue, returns, stock ledger |
| Suresh — CFO | Cash flow, payments, PBG, budget controls |
| Deepa — CEO | Portfolio dashboards |

## Goals & target metrics

| Goal | Target |
|---|---|
| Improve win rate | +20% rolling 12-month |
| Reduce cost-per-win | −15% |
| Compress bid prep | −30% days go-decision → submission |
| Projects within +5% budget | ≥ 80% |
| DSO on govt invoices | −15 days |
| Avoidable bid disqualifications | Zero |
| Adoption | ≥ 95% of active opps & projects in system by month 6 |

## Non-goals (out of scope)

- Statutory accounting / GL / TDS filing (integrate, don't replace)
- Payroll / HRMS
- Non-government CRM (B2B / B2C)
- BIM / CAD for construction
- Automated competitor pricing intelligence
- Digital signature / e-Sign integration — users sign bid packs externally and upload

## Modules

1. **Organization Details** — see `modules/01-organization-details.md`
2. **Sales** — see `modules/02-sales.md`
3. **Project Execution** — see `modules/03-project-execution.md`
4. **Expense Management** — see `modules/04-expense-management.md`
5. **Material & Procurement** — see `modules/05-material-procurement.md`

Every opportunity, project, expense sheet and material request is tagged to a **Business Unit**. The BU Head is the default second-level approver.

## User stories

The full list of 22 user stories (US-01 … US-22) is in `docs/user-stories.md`. Each FR in the module docs references the user stories it satisfies.

## Release plan (engineering view)

| Release | Scope | Status |
|---|---|---|
| R1 Foundation | Company profile (org + statutory + docs + bank accounts), Statutory Registrations (password-protected), BU CRUD (BU Head dropdown), Users (multi-role), Roles, Configuration, Keycloak OIDC auth, Angular shell | **Shipped** |
| R2 Sales Core | **CRM**: Account, Contact, Lead (convert), Opportunity (detail page, multi-contact, multi-influencer, owner, lookups), Government, Influencer, Lookup Lists. **Cost of Sale** (8 categories, spent/committed/projected). **Pipeline Dashboard** (weighted value, stage/BU charts). **Work Area**: Activities (Event/Task, calendar, polymorphic associations), Travel Plans (3-role workflow, inline expenses, reimbursement tracking, calendar integration), Password Manager (AES-256-GCM encrypted, personal/role/all sharing). | **Shipped** |
| R3 Execution Core | Project CRUD (9-tab detail: Health, Overview, Activities, Work Items, Milestones, Budget, Bank Guarantees, Risks & Issues, Documents). Milestones with Deliverables (auto-complete). Work Items (renamed from Tasks in UI). Kanban Board (standalone + in-project). Budget line-items. Cash Flow (standalone page). Bank Guarantees (renamed from PBG). Risks & Issues. Health Dashboard (RAG). Project Dashboard. | **Shipped** |
| R3.1 Execution Enhancements | 12 deferred items: auto-create from Opportunity, kanban swim-lanes/WIP, baseline schedule, resource plan, commitment accounting, EAC recompute, expense capture (needs R6), budget validation (needs R6), post-approval actuals (needs R6), variance alerts, board analytics, mobile updates (needs R10) | **Deferred** |
| R4 Evaluation & Award | Bid evaluation 3 sub-stages, clarification log, award workflow + auto-handover, loss capture | |
| R5 Financial Layer | Budget, Inflow, Cash Flow, Bank Guarantees shipped in R3. Only Commitment Accounting pending (moved to R3.1). | **Mostly Shipped** |
| R6 Expense Management | Full expense sheet lifecycle | |
| R7 Material & Procurement | MR → PO → GRN → Issue | |
| R8 Intelligence | BU portfolio, procurement, cash-flow dashboards | |
| R9 Integrations | Accounting, banking, HRMS, SSO | |
| R10 Org Masters & Hardening | Certifications, DSCs, Empanelments, Turnover, Past Projects, Employees, Expiry Dashboard, RBAC enforcement, Infra bootstrap, Dashboard page | |
| R4.5 Bid Management | Tender object (Indian standards, 35+ fields), Tender list + detail pages under Bid Management menu, tender documents (RFP/Corrigendum/BOQ/etc.), AI-powered RFP analysis via Gemini (GO/NO-GO recommendation), Opportunity closedStatus (WON/LOST/CANCELLED/ON_HOLD), Orders Booked charts on Pipeline, Weighted Pipeline by BU pie chart | **Shipped** |
| R11 Tender Workflows | Managed Tenders (M1-M7), Go/No-Go Workflow, Bid Submission, DPR repository, Consortium tracker, Active Tender import | |
| Mobile App | Ionic 8 + Capacitor 6. 4 tabs: Activities, Calendar, Travel Plans, Notifications. Direct login (email/password). Usage tracking with 2-min heartbeat. Android APK. | **Shipped** |
| Platform | In-app notifications (web bell + mobile tab), reminder worker (1hr before events), mobile usage tracking (admin page), Keycloak auto-sync (users + roles from app), Gemini AI config in System → Configuration | **Shipped** |

MVP = R1 + R2 + R3 (Execution Core) + R4 (Evaluation & Award). Expense and Procurement are **fast-follows**, not optional. R10 items can be pulled into any release as needed.

## Priority scale

- **P0** — MVP must-have; no launch without it
- **P1** — next release after MVP
- **P2** — nice-to-have; scheduled opportunistically

## Non-functional summary

See `architecture/overview.md` for the full list. Highlights:
- 99.5% uptime, p95 dashboard ≤ 3s, India hosting, WCAG 2.1 AA, MFA for finance roles.
