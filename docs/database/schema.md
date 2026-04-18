# Database Schema Notes

## Engine & defaults

- MySQL 8.0
- Engine: **InnoDB**
- Charset: **utf8mb4**, collation **utf8mb4_0900_ai_ci**
- Timezone: store UTC, display user-local
- All tables have: `id VARCHAR(26)` (ULID), `created_at`, `updated_at`, `deleted_at`, and `business_unit_id` where applicable

## Common columns

Every domain table should include:

```sql
id               VARCHAR(26)  PRIMARY KEY,   -- ULID
business_unit_id VARCHAR(26)  NOT NULL,       -- where applicable
created_at       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
updated_at       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
deleted_at       DATETIME(3)  NULL,
created_by       VARCHAR(26)  NOT NULL,
updated_by       VARCHAR(26)  NOT NULL
```

## ULID over auto-increment

- Non-guessable URLs
- Sortable by creation time
- Generated in Prisma middleware (`cuid2` is acceptable alternative if the team prefers)
- No cross-environment collision

## Money

- Stored as `BIGINT` in **paise** (integer). Never float.
- Display currency resolved at the UI / API layer
- Example: `contract_value_paise BIGINT NOT NULL`

## Dates & times

- `DATE` for business dates (validity, required-by)
- `DATETIME(3)` for event timestamps (audit_log, transitions)
- All times stored in UTC

## Soft delete

- Default is soft delete (`deleted_at IS NOT NULL`)
- Queries filter on `deleted_at IS NULL`
- Hard delete requires explicit `DELETE FROM ... WHERE id = ?` in a maintenance script — never from the API

## Enums

Stored as `VARCHAR` with a `CHECK` constraint OR mapped via application-level enum validation. Avoid native MySQL `ENUM` (ALTER is painful).

## Audit & event sourcing

- `audit_log` — every write across every table, `actor`, `resource_type`, `resource_id`, `action`, `before`, `after`, `correlation_id`
- `expense_sheet_event` — event-sourced lifecycle (state, by, at, comment)
- Both tables are append-only; no UPDATE or DELETE

## Indexing rules of thumb

- Every foreign key gets an index
- Every frequent `WHERE` predicate gets an index (after measuring)
- Composite index order matches query order: `(business_unit_id, status, created_at)`
- Avoid indexing low-cardinality columns alone (e.g., just `status`)

## Key tables (indicative — full schema lives in `prisma/schema.prisma`)

### Core masters
- `company` — singleton
- `business_unit` — name, bu_head_user_id, cost_centre, approval_thresholds (JSON)
- `user` — linked to Keycloak by `external_id`
- `employee` — business fields for staff (CV, skills, availability)

### Compliance
- `statutory_registration`, `certification`, `dsc`, `director_kmp`, `turnover`, `past_project`, `bank_account`

### Sales
- `managed_tender`, `managed_tender_stakeholder`, `dpr`, `consortium`
- `active_tender`
- `opportunity`, `go_no_go`, `proposal`, `bid_submission`
- `bid_evaluation_result`, `evaluation_clarification`
- `award`, `loss_record`
- `cost_of_sale_entry`

### Execution
- `project`, `milestone`, `wbs_node`, `task`, `task_effort_log`
- `kanban_column`, `kanban_card` (view over `task`)
- `resource_allocation`
- `budget`, `budget_line`, `commitment`
- `inflow_plan`, `cash_flow_period`
- `pbg_record`, `retention_record`
- `risk`, `issue`

### Expense
- `expense_sheet`, `expense_line`, `approval_step`, `payment`
- `expense_category`, `policy_rule`, `policy_exception`
- `expense_sheet_event` (event-sourced lifecycle)

### Procurement
- `item`, `vendor`, `vendor_performance_snapshot`
- `material_request`, `material_request_line`
- `indent`, `rfq`, `quotation`
- `purchase_order`, `po_line`
- `grn`, `grn_line`
- `material_issue`, `material_issue_line`
- `material_return`
- `store_location`, `stock_ledger_entry`

### Cross-cutting
- `audit_log`
- `outbox_event` (for RabbitMQ publish)
- `attachment` (file metadata; content in S3)

## Sample DDL conventions

```sql
CREATE TABLE material_request (
  id                VARCHAR(26)  NOT NULL,
  business_unit_id  VARCHAR(26)  NOT NULL,
  project_id        VARCHAR(26)  NOT NULL,
  mr_no             VARCHAR(32)  NOT NULL,
  requester_id      VARCHAR(26)  NOT NULL,
  required_by       DATE         NOT NULL,
  priority          VARCHAR(16)  NOT NULL,   -- normal|urgent|emergency
  justification     TEXT         NULL,
  status            VARCHAR(32)  NOT NULL,   -- draft|submitted|pm_approved|bu_approved|indented|closed|rejected
  created_at        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at        DATETIME(3)  NULL,
  created_by        VARCHAR(26)  NOT NULL,
  updated_by        VARCHAR(26)  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_mr_no (mr_no),
  KEY ix_mr_project_status (project_id, status),
  KEY ix_mr_bu_created (business_unit_id, created_at),
  CONSTRAINT fk_mr_bu     FOREIGN KEY (business_unit_id) REFERENCES business_unit(id),
  CONSTRAINT fk_mr_proj   FOREIGN KEY (project_id)       REFERENCES project(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

## Migrations

- Managed by **Prisma Migrate**
- Name with intent: `prisma migrate dev --name add_material_request_priority`
- Never edit a migration that has run in any shared env — add a new one instead
- Down migrations are best-effort; prefer forward-only with care

## Seed data

- `scripts/seed.ts` creates: 1 company, 2 BUs, 1 super-admin, 1 BU head per BU, 2 PMs, 1 admin/procurement officer, 1 stores officer, a demo opportunity, a demo project
- Idempotent — safe to re-run
