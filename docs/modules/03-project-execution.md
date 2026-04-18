# Module 3 — Project Execution

**Purpose:** Deliver awarded projects on scope, schedule and budget with live cost, inflow and cash-flow visibility.

**Primary users:** Project Manager, BU Head, Task Owners, PMO, Finance.

## Core entities

| Entity | Notes |
|---|---|
| `Project` | ID, client, WO ref, contract value, start/end, sponsor, PM, BU, source opportunity |
| `Milestone` | Name, deliverable, planned date, % of contract value, status, invoice plan |
| `WBS` | Hierarchical breakdown (phase → workstream → task) |
| `Task` | Parent, owner, estimate (hrs), start, end, deps, status |
| `KanbanCard` | View of task in Kanban column (Backlog / To Do / In Progress / Blocked / In Review / Done) |
| `ResourceAllocation` | Employee, role, % allocation, start, end, billable |
| `Budget` | Line-items (Manpower / Hardware / Licences / Sub-contract / Travel / Overheads) |
| `BudgetLine` | Estimated, Committed, Actual, Variance |
| `InflowPlan` | Milestone, invoice date, amount, GST, retention % |
| `CashFlowPeriod` | Opening, billed, received, outflow, closing |
| `ExpenseLogRef` | Points to Module 4 expense sheets |
| `ProjectMaterialCost` | Posts from Module 5 on issue |
| `Risk`, `Issue` | Standard risk/issue register |
| `PBGRecord` | PBG / retention, amount, validity, release |

## Functional requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-3.1 | Auto-create Project from won Opportunity | P0 |
| FR-3.2 | Project Charter | P0 |
| FR-3.3 | Milestone register aligned to WO payment schedule | P0 |
| FR-3.4 | WBS/task management with deps and critical path | P0 |
| FR-3.5 | Kanban board: configurable columns, swim-lanes, WIP limits | P0 |
| FR-3.6 | Task-level effort capture → project actuals | P0 |
| FR-3.7 | Board cycle-time / lead-time analytics | P2 |
| FR-3.8 | Baseline schedule; baseline-vs-current variance | P1 |
| FR-3.9 | Resource plan with over-allocation warnings | P1 |
| FR-3.10 | Budget by line-item: Estimated / Committed / Actual / Variance | P0 |
| FR-3.11 | Commitment accounting (POs reduce available before invoice) | P1 |
| FR-3.12 | Inflow plan aligned to milestones | P0 |
| FR-3.13 | Cash-flow forecast (credit period + retention) | P0 |
| FR-3.14 | Estimate-at-Completion weekly recompute | P1 |
| FR-3.15 | Expense capture (delegates to Module 4) | P0 |
| FR-3.16 | Budget validation on expense submission | P1 |
| FR-3.17 | Post-approval updates to Actuals and Cash-Flow | P0 |
| FR-3.18 | Retention & PBG registers with alerts | P0 |
| FR-3.19 | Risks & Issues register | P1 |
| FR-3.20 | Project Health dashboard (RAG) | P0 |
| FR-3.21 | Variance alerts at 80% / 100% of line-item budget | P1 |
| FR-3.22 | Mobile task updates & expense submission ≤ 60s | P1 |
| FR-3.23 | Project tagged to BU; BU Head as second-level approver on deviations | P0 |

## Kanban columns (default)

`Backlog` · `To Do` · `In Progress` · `Blocked` · `In Review` · `Done`

- Configurable per project (add/rename/remove)
- WIP limits set per column, warning shown when exceeded
- Swim-lanes by phase or priority
- Cards filterable by owner, label, milestone, due, risk

## Key API endpoints

```
GET    /api/v1/projects
POST   /api/v1/projects                              # usually auto-created on award
GET    /api/v1/projects/:id
PATCH  /api/v1/projects/:id
POST   /api/v1/projects/:id/baseline                 # locks baseline schedule

GET    /api/v1/projects/:id/milestones
POST   /api/v1/projects/:id/milestones
PATCH  /api/v1/milestones/:id

GET    /api/v1/projects/:id/tasks
POST   /api/v1/projects/:id/tasks
PATCH  /api/v1/tasks/:id
POST   /api/v1/tasks/:id/move                        # Kanban column change
POST   /api/v1/tasks/:id/log-effort                  # hours capture

GET    /api/v1/projects/:id/budget
GET    /api/v1/projects/:id/cash-flow?months=12
GET    /api/v1/projects/:id/health                   # RAG dashboard
```

## Business rules to preserve

- Baseline can be captured only once per project; subsequent "re-baseline" requires explicit workflow + reason.
- Effort logged on task close-out reflects in project actuals that same day.
- Commitment accounting: PO amount reduces `budget_line.available`; on GRN/Issue, it moves from committed to actual.
- Variance alerts fire on `actual + committed >= 0.8 * estimated` (yellow) and `>= 1.0 * estimated` (red).
- PBG auto-alerts at 90/60/30/7 days before expiry.
