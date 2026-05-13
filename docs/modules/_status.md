# Module Status

Tracks what's shipped, in progress, and queued. Claude Code should update this at the end of each feature.

_Last updated: 2026-05-13 — Session 15: OEM Catalog, Price Lists, Bid Eval Fixes, Excel/AI Import_

## Status legend

- 🔲 Not started
- 🟡 In progress
- 🟢 Shipped (in QA / UAT / prod)

## R1 — Foundation (Months 1–2)

| Component | Status | Notes |
|---|---|---|
| Monorepo bootstrap (pnpm + Turborepo) | 🟢 | `pnpm-workspace.yaml` + `turbo.json` in place; `pnpm install` exercised on win-x86 (Node 20.11.1, pnpm 9.15.9); native build of `msgpackr-extract` falls back to JS (no VS C++ toolchain — expected) |
| Docker Compose dev infra | 🟢 | All 7 services up and healthy: mysql (3307 on host via `docker-compose.override.yml`, native MySQL84 still on 3306), redis, rabbitmq, keycloak, minio, opensearch, mailhog. Override file is gitignored. |
| Prisma schema — common + org + BU | 🟢 | `prisma migrate dev --name init` applied against MySQL; 25 tables created. `engineType = "binary"` kept for 32-bit Node. `govprojects` DB user granted `ALL PRIVILEGES ON *.*` for shadow-db support. |
| Express API skeleton + middleware | 🟢 | correlation ✅, **auth (real JWKS via jose)** ✅, validate ✅, audit + recordAudit ✅, error-handler ✅, not-found ✅, /api/v1/health + /api/v1/ready (real DB + Redis probe, 200/503) ✅; `pnpm --filter @govprojects/api typecheck` ✅; `pnpm --filter @govprojects/api test` ✅ (**19/19**); live verified: real Keycloak JWT → 200, no/fake/expired token → 401 |
| `libs/shared-types` package | 🟢 | `UlidSchema`, `PaginationParams`, `PaginationMeta`, `ErrorEnvelope`, `ErrorDetail` exported from `@govprojects/shared-types` |
| Angular app shell + auth | 🟢 | Angular 19, Tailwind + PrimeNG, Keycloak OIDC, shell layout with sidebar nav, build passes |
| Ionic app shell + auth | 🔲 | Shares auth with web → moved to **R10** |
| Company profile (org + statutory + docs + bank accounts) | 🟢 | FR-1.1 — two-column layout (org details + statutory info with CIN/PAN/TAN/GSTIN), bank accounts as separate section, company documents with drag-reorder card grid, 8 integration tests |
| Statutory Registrations (password-protected) | 🟢 | CRUD with password gate (from Configuration), public list always visible, sensitive fields + Add/Edit/Delete behind unlock |
| Business Unit CRUD | 🟢 | FR-1.15 — BU Head as dropdown (filtered by configured role name), BU Head name in list, refs-guard on delete, 20 integration tests |
| Role CRUD | 🟢 | Full CRUD, name uniqueness, system-role guard, refs-guard on delete, 18 integration tests |
| User CRUD + multi-role | 🟢 | Full CRUD, email uniqueness, multi-role assignment via user_role join table, roles shown as chips in list, 21 integration tests |
| Configuration page | 🟢 | BU Head role name + statutory reveal password, stored in app_config table |

## R2 — Sales Core

| Component | Status | Notes |
|---|---|---|
| Account CRUD + UI | 🟢 | Code, name, type (from lookup `account_type`), government link, hierarchy, GSTIN. No BU scope. |
| Contact CRUD + UI | 🟢 | Many-to-many with Account via `account_contact`. First/last name, designation, influence level. |
| Lead CRUD + Convert | 🟢 | BU required. Source, status tracking. Convert to Opportunity (any active status). |
| Opportunity CRUD + Detail Page | 🟢 | Dedicated detail page. Stage + Entry Path from lookup lists. Multiple contacts, multiple influencers, owner. Account + End Client. |
| Government (Admin) | 🟢 | Code, name, type (NATIONAL/STATE), country. Linked to Accounts + Influencers. |
| Influencer (Sales) | 🟢 | Type (POLITICAL/BUREAUCRAT/OTHER), government link, party name, qualifier, 5-star rating. Many-to-many with Opportunity. |
| Lookup Lists (Admin) | 🟢 | Generic configurable dropdowns. Master-detail UI. Used for account_type, opportunity_stage, entry_path. |
| Cost of Sale tracking | 🟢 | FR-2.18 — 8 categories, spent/committed/projected, summary on Opportunity detail |
| Activities (Event/Task) | 🟢 | Cross-cutting. Event (start/end/allDay) + Task (due/status). Polymorphic associations. Calendar + list views. Embeddable panel component. |
| Pipeline Dashboard | 🟢 | US-02 — weighted pipeline, stage/BU charts, filterable opportunity table |
| Travel Plans | 🟢 | 3-role workflow (Requester→Approver→Admin). Tickets, Hotels, Expenses (inline). Reimbursement tracking. Calendar integration. Polymorphic linked objects with per-object cost share. |
| Password Manager | 🟢 | AES-256-GCM encrypted credentials. Personal/Role/All visibility. Security questions. Copy-to-clipboard. |

## R3 — Execution Core

| Component | Status | Notes |
|---|---|---|
| Project CRUD + detail page | 🟢 | FR-3.1, 3.2, 3.23 — charter, BU-scoped, 9-tab detail page (Health, Overview, Activities, Work Items, Milestones, Budget, Bank Guarantees, Risks & Issues, Documents) |
| Milestones + Deliverables | 🟢 | FR-3.3 — deliverables with auto-complete, original planned date, % of contract |
| Work Items (WBS) | 🟢 | FR-3.4, 3.6 — hierarchical, priority, milestone-required, effort logging |
| Kanban board | 🟢 | FR-3.5 — 6 fixed columns, CDK drag-drop, standalone page + in-project |
| Budget | 🟢 | FR-3.10 — line-items: Estimated/Committed/Actual/Variance |
| Inflow Plan + Cash Flow | 🟢 | FR-3.12, 3.13 — standalone Cash Flow page with project selector |
| Bank Guarantees | 🟢 | FR-3.18 — PBG/Retention records with expiry tracking |
| Risks & Issues | 🟢 | FR-3.19 — risk register + issue register |
| Health Dashboard | 🟢 | FR-3.20 — RAG status (schedule/budget/scope/overall) |
| Project Documents | 🟢 | Upload, card view, drag-reorder |
| Activities tab | 🟢 | Embedded activity panel on project detail |
| Project Dashboard | 🟢 | Summary cards, contract value, filterable table |

## R3.1 — Execution Enhancements (deferred from R3)

| Component | Status | Notes |
|---|---|---|
| Auto-create Project from Opportunity | 🔲 | FR-3.1 — wire Award → Project creation (needs R4 Award) |
| Kanban swim-lanes & WIP limits | 🔲 | FR-3.5 — configurable columns, swim-lanes |
| Baseline schedule & variance | 🔲 | FR-3.8 — baseline-vs-current variance tracking |
| Resource plan + over-allocation | 🔲 | FR-3.9 — resource allocation with warnings |
| Commitment accounting | 🔲 | FR-3.11 — POs reduce available budget before invoice |
| Estimate-at-Completion recompute | 🔲 | FR-3.14 — weekly EAC recalculation |
| Expense capture (project-level) | 🔲 | FR-3.15 — delegates to Module 4 (needs R6) |
| Budget validation on expenses | 🔲 | FR-3.16 — block over-budget submissions (needs R6) |
| Post-approval actuals + cash-flow | 🔲 | FR-3.17 — auto-update on expense approval (needs R6) |
| Variance alerts (80%/100%) | 🔲 | FR-3.21 — threshold notifications |
| Board analytics (cycle/lead time) | 🔲 | FR-3.7 — kanban metrics |
| Mobile work item updates | 🔲 | FR-3.22 — task + expense ≤ 60s (needs R10 Ionic) |

## R4 — Evaluation & Award

| Component | Status | Notes |
|---|---|---|
| Bid Evaluation sub-stages (6a/6b/6c) | 🔲 | FR-2.13, 2.14 |
| Clarification log | 🔲 | FR-2.15 |
| Award workflow + auto-handover | 🔲 | FR-2.16 |
| Loss capture | 🔲 | FR-2.17 |

## R5 — Financial Layer

| Component | Status | Notes |
|---|---|---|
| Budget / line-items | 🟢 | Shipped in R3 |
| Inflow plan | 🟢 | Shipped in R3 |
| Cash-flow periods | 🟢 | Shipped in R3 |
| PBG / retention registers | 🟢 | Shipped in R3 (renamed Bank Guarantees) |
| Commitment accounting | 🔲 | FR-3.11 — moved to R3.1 |

## R6 — Expense Management

| Component | Status | Notes |
|---|---|---|
| Expense Sheet types + lifecycle | 🔲 | FR-4.1–4.4 |
| Multi-level approval engine | 🔲 | FR-4.4 |
| Mobile submission + OCR assist | 🔲 | FR-4.8 |
| Policy engine | 🔲 | FR-4.6 |
| Payment batching + UTR | 🔲 | FR-4.12 |
| Expense Workbench | 🔲 | FR-4.17 |

## R7 — Material & Procurement

| Component | Status | Notes |
|---|---|---|
| Item master (Master Items) | 🟢 | CRUD with SKU, name, UoM, category (from lookup list `item_category`), HSN/SAC, default GST rate, make/model. OEM Options count column. |
| OEM Catalog | 🟢 | Two-tier: Master Item → OemCatalogItem (vendor-specific: model, part no, brand, price, specs, warranty, MOQ, lead time). CRUD API `/oem-catalog`. Browse page with vendor/master item/brand/search filters. OEM picker in PO + quotation line dialogs. |
| Vendor Price Lists | 🟢 | `VendorPriceList` model (vendor, name, date, status, attachment). CRUD + list page. 4-step Excel/AI import wizard: upload → map fields (inverted: system fields as rows) with inline defaults → link to master items (auto-link from existing catalog + by name + bulk create) → preview + import. Upserts by vendor+partNo. Supports image/PDF via Gemini AI extraction. |
| Vendor master | 🟢 | CRUD with KYC lifecycle (DRAFT→KYC_PENDING→ACTIVE→BLOCKED), vendorCode auto-gen, GSTIN/PAN validation, duplicate detection, MSME/TDS/OEM fields |
| Vendor KYC documents | 🟢 | Upload/delete typed docs (GST_CERT, PAN_CARD, MSME, etc.) via DMS storage |
| Vendor bank details (dual-control) | 🟢 | CRUD with dual-control verification (verifier ≠ creator), primary flag |
| Material Request | 🟢 | Full CRUD with lines, submit for approval (integrates with approval engine), approve/reject/return, line-level qty/rate tracking, auto-number MR-FY-XXXX |
| Vendor Quotation | 🟢 | CRUD with line-level GST (INTRA/INTER/EXEMPT), file attachment, auto-numbering. Excel/AI import with column mapping + defaults. |
| Rate Comparison | 🟢 | Link 2-5 quotations, auto-calculate L1 vendor, finalize with reason |
| Purchase Order + commitment | 🟢 | Full PO lifecycle (DRAFT→APPROVED→ISSUED→COMPLETED), budget commit/reverse, line CRUD with OEM catalog picker, payment terms, T&Cs, events, documents |
| GRN | 🟢 | Qty validation, auto quality status, auto PO transition, budget actuals, quality evidence docs |
| Vendor Invoice + 3-way match | 🟢 | Header-level PO vs GRN vs Invoice match (1₹ tolerance), TDS, aging report, payment tracking with UTR |
| Approval Engine (generic) | 🟢 | Multi-step configurable workflows, value-based routing, self-approval prevention, notifications. Serves MR, PO, future modules |
| Indent + RFQ | 🔲 | Phase 2: RFQ linking PRs to vendors, technical evaluation |
| Technical Evaluation | 🔲 | Phase 2: parameter-level Pass/Fail per quotation |
| Dispatch + Inspection | 🔲 | Phase 3: dispatch tracking, QA sign-off |
| Line-level 3-way match | 🔲 | Phase 3: per-line matching with configurable tolerances |
| Invoice exceptions + debit/credit notes | 🔲 | Phase 3: classified exceptions, resolution workflow |
| Advance Payment | 🔲 | Phase 3: proforma invoice, netting |
| TDS master | 🔲 | Phase 4: sections, rates, auto-calculation |
| PO closure checklist | 🔲 | Phase 4: mandatory document gate |
| Vendor Scorecard | 🔲 | Phase 4: computed from PO history |
| Procurement KPI dashboard | 🔲 | Phase 4: cycle time, on-time delivery, spend analysis |
| Material Issue + acknowledgement | 🔲 | Future |
| Stock ledger | 🔲 | Future |

## R4.5 — Bid Management (new)

| Component | Status | Notes |
|---|---|---|
| Tender object (Indian standards) | 🟢 | 35+ fields: identity, classification, portal, financial, dates, terms, eligibility. Linked 1:1 to Opportunity via `tenderReleased` toggle. |
| Tender list page | 🟢 | `/bid-management/tenders` — filters (status, type, BU, search), summary cards, sortable table with deadline highlighting |
| Tender detail page | 🟢 | 3-column layout (identity, financial, dates), linked opportunity card, notes/corrigendum |
| Tender documents | 🟢 | Upload/download/delete. Types: RFP, Corrigendum, Addendum, BOQ, Drawing, Pre-Bid Minutes, Clarification, Other. Grouped by type. |
| AI RFP Analysis (Gemini) | 🟢 | Upload RFP → "Analyze RFP" → Gemini extracts: summary, GO/NO-GO, scope, evaluation, eligibility, risks, special conditions, **PQ criteria**, **technical scoring**. Persisted in DB. Collapsible UI. Re-analyze only when docs change. GDrive-stored docs supported. |
| Bid Evaluation (PQ + Technical) | 🟢 | AI-extracted or manual PQ criteria table (meets/doesn't meet toggle per criterion). Technical scoring table with sections, sub-criteria, max marks, expected scores. Threshold banner (green/red). Go/No-Go decision. `bidEvaluation` JSON field on Tender. |
| Opportunity closedStatus | 🟢 | WON/LOST/CANCELLED/ON_HOLD. Pipeline filters to open only. |
| Orders Booked chart | 🟢 | Stacked bar (by BU, last 12 months) + Weighted Pipeline pie on Sales Pipeline page |

## R8 — Intelligence & Dashboards

## R9 — Integrations

## Platform Features (cross-cutting)

| Component | Status | Notes |
|---|---|---|
| In-app notifications | 🟢 | Bell icon (web header + mobile 4th tab), unread badge, mark read. Notification model + API. |
| Notification triggers | 🟢 | Travel approve/reject, activity assignment, event/task 1hr reminder (cron worker). |
| Mobile app usage tracking | 🟢 | Device registration, session tracking (2-min heartbeat), daily usage. Admin page under System. |
| Keycloak user auto-sync | 🟢 | User create/update/delete → auto-sync to Keycloak (account, name, email, roles). Email as username. |
| Gemini AI config | 🟢 | API key + model configurable via System → Configuration (app_config table). |
| Mobile auth (direct login) | 🟢 | Username/password login (no OIDC redirect). Token refresh. |
| Travel proof attachments | 🟢 | File upload on Tickets, Hotels, and Expenses. Download via authenticated blob. 10MB limit. |
| Finance — Travel Expenses | 🟢 | Advance disbursement + reimbursement payment recording. Sidebar: Finance > Travel Expenses. |
| Travel → Cost of Sale sync | 🟢 | On submit-expenses, per-object cost share auto-creates/updates CostOfSaleEntry (TRAVEL) on linked Opportunities. |
| Expense Sheets (MVP) | 🟢 | Work Area > Expenses. CRUD with line items, file attachments, status workflow (Draft→Submitted→Approved→Paid), summary totals. |
| Auth interceptor hardening | 🟢 | Redirects to Keycloak login when token missing; auto-re-auth on 401. |
| Activity tabs revamp | 🟢 | Current (today+past open) / Upcoming (tomorrow+day after) / Planned (future) / Completed / All. Default: Current. |
| Opportunity list filters | 🟢 | Open/Closed/All toggle (default: Open), BU filter, Account filter. Default stage: lowercase 'capture'. |
| Close & Add New (Activities) | 🟢 | Edit task → set Closed → "Close & Add New" button closes task and opens pre-filled create form (category, assignee, contacts, linked objects). |
| Initiative entity linking | 🟢 | Activities + Emails linkable to INITIATIVE. Activity list/calendar entity type dropdowns, mail API LINK_ENTITY_TYPES, mail-reader entity linking UI. |
| Mail: Move between folders | 🟡 | Code in place (API + UI) but not working correctly. On hold — needs IMAP move debugging. |
| Mail: AI Email Assistant | 🟢 | Collapsible AI section in email detail. Auto-summarize on expand via Gemini, cached in DB (ai_summary field). Draft reply with optional user prompt. "Use as Reply" opens compose. |
| Mail: Save attachment to DMS | 🟢 | "Save to Documents" button on each email attachment. Dialog: pick folder from DMS tree, optional entity link. API streams from IMAP → uploads to GDrive → creates Document record. |
| Google Drive DMS | 🟢 | All document storage migrated to Google Drive via OAuth. Folder structure: Shared/{Company,Tenders,Projects,Expenses,Travel}, Private/{User}. All upload/download routes use dms-storage layer. Migration script for existing files. |
| Document Browser enhancements | 🟢 | Wider folder tree (432px). View files in browser (not just download). Loading spinner on file fetch. Delete empty folders. Linked Entities panel close button. |
| Activity linked entity visibility | 🟢 | Fixed "Linked To" column invisible on dark theme — now uses PrimeNG p-tag with severity="secondary". |
| Generic Approval Engine | 🟢 | Multi-step configurable approval workflows. ApprovalWorkflow + steps + requests + actions. Self-approval prevention. Value-based step routing. Role or user-specific approvers. Notifications. Admin UI under System. Approval Inbox as top-level page. |
| IMAP error handling | 🟢 | ImapFlow client error handler prevents unhandled ECONNRESET from crashing API during mail sync. |

## R10 — Remaining Organization Masters & Platform Hardening

| Component | Status | Notes |
|---|---|---|
| Certifications CRUD + UI | 🔲 | FR-1.3 — validity, expiry alerts, certificate upload |
| DSC CRUD + UI | 🔲 | FR-1.5 — serial no, holder, validity, usage log |
| Empanelments CRUD + UI | 🔲 | FR-1.4 — agency, category, validity, rate contract |
| Turnover records CRUD + UI | 🔲 | FR-1.7 — FY, revenue, net-worth, auditor, certificate |
| Past projects CRUD + UI | 🔲 | FR-1.8 — title, client, value, completion cert |
| Employee master CRUD + UI | 🔲 | FR-1.9 — code, qualifications, skills, CV, availability |
| Expiry dashboard | 🔲 | FR-1.13 — traffic lights across all validity-bearing records |
| RBAC + BU-scope enforcement | 🔲 | Per-endpoint role gating via requireRole middleware |
| Ionic mobile app shell | 🟢 | Scaffolded at `apps/mobile/`. Angular 19 + Ionic 8 + Capacitor 6. 3 tabs: Activities, Calendar, Travel Plans. Keycloak OIDC auth. Android platform added, debug APK builds. Online only. |
| Infra bootstrap script | 🔲 | MinIO bucket + RabbitMQ exchange/queue setup |
| Dashboard page | 🔲 | Replace placeholder with actual stats/charts |

## R11 — Tender Workflows

| Component | Status | Notes |
|---|---|---|
| Managed Tenders (M1–M7) | 🔲 | FR-2.1, 2.5 — 7 upstream stages, auto-create Standard Opportunity on M7 |
| Stakeholder CRM | 🔲 | FR-2.2 — within Managed Tenders |
| DPR repository | 🔲 | FR-2.3 — version control |
| Consortium / Master SI tracker | 🔲 | FR-2.4 |
| Active Tender import | 🔲 | FR-2.7 — GeM/CPPP manual + scraper stub |
| Go / No-Go workflow | 🔲 | FR-2.9 — eligibility, conflict check |
| Solution & Proposal workspace | 🔲 | FR-2.11 — BoQ, pricing, compliance matrix |
| Bid Submission | 🔲 | FR-2.12 — EMD/BG, signed pack upload |

## Backlog (bugs / on-hold)

| Item | Status | Notes |
|---|---|---|
| Mail: Move between folders | 🟡 | Code in place (API POST /move-messages + UI "Move to" menu) but IMAP move not working. Needs debugging. |

## Next up (top of queue)

1. **R7 Phase 2** — RFQ module, Technical Evaluation, Quotation immutability + revision chain, Comparative Statement (weighted scoring, negotiation, PRN), PO enhancements (vendor ack, amendments, MR linkage)
2. **R7 Phase 3** — Dispatch tracking, Inspection Reports, Line-level 3-way match, Invoice exceptions + debit/credit notes, Advance Payment
3. **R7 Phase 4** — TDS master, PO closure checklist, Vendor scorecard, Procurement KPI dashboard, Audit bundle export
4. **R4 Evaluation & Award** — Bid evaluation sub-stages, clarification log, award + auto-handover
5. **R3.1 Execution Enhancements** — items deferred from R3

## Implementation plan

Full 4-phase procurement overhaul plan at `.claude/plans/cuddly-knitting-lemur.md`. Phase 1 (Approval Engine + Vendor KYC + MR) shipped 2026-05-09. Phases 2-4 pending.
