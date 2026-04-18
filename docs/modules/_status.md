# Module Status

Tracks what's shipped, in progress, and queued. Claude Code should update this at the end of each feature.

_Last updated: 2026-04-18 — R2 Sales Core shipped (Account/Contact/Lead/Opportunity CRM, Governments, Influencers, Lookup Lists, Opportunity detail page)_

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
| Item + Vendor masters | 🔲 | FR-5.1, 5.2 |
| Material Request | 🔲 | FR-5.3–5.5 |
| Indent + RFQ | 🔲 | FR-5.6, 5.7 |
| Purchase Order + commitment | 🔲 | FR-5.8, 5.9 |
| GRN | 🔲 | FR-5.10 |
| Material Issue + acknowledgement | 🔲 | FR-5.11 |
| Material Trace | 🔲 | FR-5.12 |
| Stock ledger | 🔲 | FR-5.13 |
| Vendor Scorecard | 🔲 | FR-5.16 |

## R8 — Intelligence & Dashboards

## R9 — Integrations

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
| Ionic mobile app shell | 🔲 | Shares auth + libs with web |
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

## Next up (top of queue)

1. **R4 Evaluation & Award** — Bid evaluation sub-stages, clarification log, award + auto-handover
2. **R6 Expense Management** — Expense sheets, approval engine, policy engine
3. **R3.1 Execution Enhancements** — items deferred from R3 (many depend on R4/R6)
4. Pick items from **R10** (Org masters, RBAC, Expiry dashboard, Ionic mobile)
5. **R11 Tender Workflows** — Managed Tenders, Go/No-Go, Bid Submission

## Pending decision

User to choose next release.
