# API Endpoints

Running catalog of shipped endpoints. Update on every PR that adds or changes a route. See `docs/api/conventions.md` for rules.

All endpoints are under `/api/v1`. Auth is Bearer JWT (Keycloak) unless marked **Public**.

## System

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness check. **Public.** |
| GET | `/ready` | Readiness check. **Public.** |
| GET | `/docs` | Swagger UI (non-prod). **Public.** |

## Module 1 — Organization

### Shipped

| Method | Path | Purpose | FR |
|---|---|---|---|
| GET | `/business-units` | List BUs — supports `?status`, `?q` (name contains), `?cursor`, `?limit` (default 50, max 200). Returns `{data, meta:{next_cursor, limit}}`. | FR-1.15 |
| POST | `/business-units` | Create BU. Body: `{name, description?, costCentre?, buHeadUserId (ULID, must reference an active user), approvalThresholds?, status?}`. 422 `BU_HEAD_NOT_FOUND` if head user missing. Writes audit. | FR-1.15 |
| GET | `/business-units/:id` | Get one BU (excludes soft-deleted). 404 if missing. | FR-1.15 |
| PATCH | `/business-units/:id` | Partial update. Re-validates BU Head when changed. Writes before/after audit. | FR-1.15 |
| DELETE | `/business-units/:id` | Soft delete. 422 `BU_HAS_REFERENCES` with `{projects,opportunities,expenseSheets,materialRequests}` counts if any active row references this BU. | FR-1.15 |

### Planned

| Method | Path | Purpose | FR |
|---|---|---|---|
| GET | `/company` | Get company profile | FR-1.1 |
| PATCH | `/company` | Update company profile | FR-1.1 |
| GET | `/statutory-registrations` | List registrations | FR-1.2 |
| POST | `/statutory-registrations` | Create registration | FR-1.2 |
| GET | `/certifications` | List certifications | FR-1.3 |
| POST | `/certifications` | Create certification | FR-1.3 |
| GET | `/empanelments` | List empanelments | FR-1.4 |
| GET | `/dscs` | List DSCs | FR-1.5 |
| GET | `/directors` | List directors/KMP | FR-1.6 |
| GET | `/turnovers` | List turnover records | FR-1.7 |
| GET | `/past-projects` | List past projects | FR-1.8 |
| GET | `/employees` | List employees (with filters) | FR-1.9 |
| GET | `/expiry-dashboard` | Aggregated expiries | FR-1.13 |
| GET | `/eligibility-pack?tender_id=...` | Generate eligibility pack | FR-1.10 |

## Module 2 — Sales (planned)

See `docs/modules/02-sales.md` for the full list. Highlights:

| Method | Path | Purpose |
|---|---|---|
| GET | `/managed-tenders` | List managed tenders |
| POST | `/managed-tenders/:id/advance` | Advance to next stage |
| POST | `/managed-tenders/:id/publish-rfp` | Triggers opportunity auto-creation |
| GET | `/opportunities` | List opportunities (BU-scoped) |
| POST | `/opportunities/:id/go-no-go` | Record Go/No-Go decision |
| POST | `/opportunities/:id/evaluation/pre-qualification` | Sub-stage 6a |
| POST | `/opportunities/:id/evaluation/technical` | Sub-stage 6b |
| POST | `/opportunities/:id/evaluation/financial` | Sub-stage 6c |
| POST | `/opportunities/:id/award` | Award and auto-handover to Execution |

## Module 3 — Execution (planned)

| Method | Path | Purpose |
|---|---|---|
| GET | `/projects` | List projects |
| POST | `/projects/:id/baseline` | Lock baseline |
| GET | `/projects/:id/budget` | Budget view |
| GET | `/projects/:id/cash-flow` | Rolling cash-flow |
| POST | `/tasks/:id/move` | Kanban column change |
| POST | `/tasks/:id/log-effort` | Time capture |

## Module 4 — Expense (planned)

| Method | Path | Purpose |
|---|---|---|
| GET | `/expense-sheets` | List (filter by status, BU, claimant) |
| POST | `/expense-sheets` | Create draft |
| POST | `/expense-sheets/:id/submit` | Lock and route for approval |
| POST | `/expense-sheets/:id/approve` | Current-step approval |
| POST | `/expense-sheets/:id/return` | Send back with comment |
| POST | `/expense-sheets/:id/pay` | Finance marks paid + UTR |
| GET | `/approvals` | Unified approval inbox |
| GET | `/expense-workbench` | Dashboard |

## Module 5 — Procurement (planned)

| Method | Path | Purpose |
|---|---|---|
| GET | `/material-requests` | List MRs |
| POST | `/material-requests` | Create MR |
| POST | `/material-requests/:id/approve` | PM or BU Head approval |
| POST | `/indents` | Consolidate MRs |
| POST | `/indents/:id/rfq` | Open RFQ |
| POST | `/purchase-orders` | Create PO from indent |
| POST | `/purchase-orders/:id/issue` | Send to vendor |
| POST | `/grns` | Record goods receipt |
| POST | `/material-issues` | Issue to project team |
| GET | `/material-trace` | Full MR → Issue trace |
| GET | `/vendors/:id/scorecard` | Vendor performance |

## Cross-cutting

| Method | Path | Purpose |
|---|---|---|
| GET | `/me` | Current user + roles + BUs |
| GET | `/notifications` | User notifications |
| POST | `/attachments` | Upload file (presigned URL flow) |
| GET | `/audit-log?resource_type=...&resource_id=...` | Audit history |

_Legend: entries with no FR are cross-cutting; entries marked "planned" will move to "shipped" once a PR adds them._
