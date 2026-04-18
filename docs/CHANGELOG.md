# Changelog

All notable changes to the GovProjects Platform. Based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added (2026-04-18 — R3 Execution Core)
- **Project CRUD** — Project charter with code, BU, PM, sponsor, contract value, dates, location, category. Status workflow: DRAFT→ACTIVE→ON_HOLD→CLOSED. API: `CRUD /projects`. Angular: list page with BU/status/PM filters + detail page.
- **Milestones** — name, deliverable, planned/actual dates, % of contract, invoice amount, status (NOT_STARTED→IN_PROGRESS→COMPLETED→INVOICED). API: `CRUD /projects/:id/milestones`.
- **WBS + Tasks** — hierarchical (parent-child tree), priority (LOW/MEDIUM/HIGH/CRITICAL), kanban column, labels, owner, effort tracking. Tree view support (`?view=tree`). API: `CRUD /projects/:id/tasks`, `POST /:tid/move`, `POST /:tid/log-effort`.
- **Kanban Board** — 6 fixed columns (Backlog/To Do/In Progress/Blocked/In Review/Done). CDK drag-drop. Cards show title, owner, priority tag, milestone, labels. Optimistic updates on move.
- **Task Effort Logging** — log hours per task per day, auto-increment actualHours. API: `POST /tasks/:tid/log-effort`, `GET /tasks/:tid/effort-logs`.
- **Budget** — one per project, line-items by category (Manpower/Hardware/Licences/Subcontract/Travel/Overheads/Other). Estimated/Committed/Actual/Variance tracking. API: `CRUD /projects/:id/budget[/lines]`.
- **Inflow Plan** — milestone-aligned invoicing schedule with GST% and retention%. Status: PLANNED/INVOICED/RECEIVED. API: `CRUD /projects/:id/inflow-plan`.
- **Cash Flow Periods** — monthly periods with opening/billed/received/outflow/closing balances. Unique by project+period. API: `CRUD /projects/:id/cash-flow`.
- **PBG & Retention** — PBG/Retention records with bank, BG number, issued/expiry dates, status (ACTIVE/RELEASED/EXPIRED). API: `CRUD /projects/:id/pbg-records`.
- **Risks & Issues** — Risk register (probability/impact/mitigation) + Issue register (severity/resolution). API: `CRUD /projects/:id/risks`, `CRUD /projects/:id/issues`.
- **Health Dashboard** — computed RAG status for Schedule (milestone overdue%), Budget (utilization%), Scope (task completion%). Overall RAG = worst of three. API: `GET /projects/:id/health`.
- **Project Detail Page** — 8-tab layout: Overview (metrics + activity panel), Milestones, Tasks (table/Kanban toggle), Budget, Cash Flow, PBG & Retention, Risks & Issues, Health.
- **Prisma models**: Milestone, TaskEffortLog, Budget, BudgetLine, InflowPlanItem, CashFlowPeriod, PbgRecord, Risk, Issue. Enhanced Project (code, description, location, category) and Task (priority, kanbanColumn, sortOrder, labels).

### Added (2026-04-18 — Password Manager)
- **Password Manager** — secure credential storage under Work Area → Passwords. AES-256-GCM encryption at rest for passwords and security question answers. Visibility: PERSONAL (owner only), ROLE (shared with a specific role), ALL (everyone). View dialog with reveal/copy buttons. Security questions with individually revealable answers. Only owner can edit/delete. API: `CRUD /passwords`. Schema: `PasswordEntry` + `PasswordSecurityQuestion`. Crypto helper: `apps/api/src/lib/crypto.ts`.

### Added (2026-04-18 — Travel Plans + Navigation Restructure)
- **Travel Plan module** — full travel management with inline expense tracking. `TravelPlan` (title, purpose from lookup, dates, lead traveller, multi-traveller, polymorphic associations, advance tracking, reimbursement status), `TravelPlanTicket` (flight/train/bus/cab), `TravelPlanHotel`, `TravelPlanExpense` (6 categories). Status workflow: DRAFT→SUBMITTED→APPROVED/REJECTED→COMPLETED. Summary with per-object cost share for Cost of Sale distribution. API: `CRUD /travel-plans`, nested `tickets/hotels/expenses`, `submit/approve/reject/complete` endpoints.
- **Work Area** — renamed from "Activities". Contains: Calendar (first), Activities (was List View), Travels. Routes changed from `/activities/*` to `/work-area/*`.
- **Navigation restructure** — "Administration" renamed to "System". New empty "Administration" placeholder added for future business-level admin.
- **6 Prisma models**: `TravelPlan`, `TravelPlanTraveller`, `TravelPlanAssociation`, `TravelPlanTicket`, `TravelPlanHotel`, `TravelPlanExpense`

### Added (2026-04-18 — R2 Sales Core: Cost of Sale, Activities, Pipeline Dashboard)
- **Cost of Sale tracking** — 8 expense categories (Travel, Accommodation, Demo/Presentation, Consulting, Documentation, Stationery/Printing, Communication, Other) with spent/committed/projected status per opportunity. Nested API: `GET/POST/PATCH/DELETE /opportunities/:id/cost-of-sale`. Summary cards (by status + grand total vs contract value) + entries table on Opportunity detail page. FR-2.18.
- **Activities module** — cross-cutting Event/Task system. Events have start/end datetime + all-day flag. Tasks have due datetime + status (Open/Overdue/Closed). Category from lookup list `activity_category`. Polymorphic associations to any entity (Opportunity, Lead, Account, Contact, Influencer, Project) via `activity_association` join table. Multiple contacts per activity via `activity_contact`. API: `GET/POST/PATCH/DELETE /activities`, `GET /activities/calendar` (FullCalendar feed). Angular: list view with Open/Upcoming/Completed tabs + filters, calendar view (FullCalendar day/week/month). Sidebar: Activities group with List View + Calendar.
- **Pipeline Dashboard** — probability-weighted sales pipeline view under Sales. Summary cards (total opportunities, contract value, weighted pipeline). Stage-wise bar chart + BU-wise doughnut chart via Chart.js/PrimeNG. Filterable opportunity table with click-to-detail. API: `GET /opportunities/pipeline?buId=&stage=&ownerUserId=`. US-02.
- **Prisma models**: `CostOfSaleEntry`, `Activity`, `ActivityAssociation`, `ActivityContact` with appropriate indexes and relations
- **Dependencies**: `chart.js`, `@fullcalendar/core`, `@fullcalendar/angular`, `@fullcalendar/daygrid`, `@fullcalendar/timegrid`, `@fullcalendar/interaction`, `@fullcalendar/list`

### Changed (2026-04-18)
- Moved Managed Tenders (M1-M7), Go/No-Go Workflow, Bid Submission to new **R11 — Tender Workflows** release
- Sales sidebar default route changed from Accounts to Pipeline
- Sidebar: added Pipeline under Sales, added Activities group (List View + Calendar)

### Added (2026-04-18 — R2 Sales Core: CRM Foundation)
- **Account CRUD** — code (1-5 chars), name, shortName, accountType (from lookup `account_type`), governmentId (optional), address, GSTIN, owner. Not BU-scoped. API: `GET/POST/PATCH/DELETE /accounts`. Angular: table + form dialog with Government dropdown.
- **Contact CRUD** — many-to-many with Account via `account_contact` join table. MultiSelect for accounts in form. API: `GET/POST/PATCH/DELETE /contacts`.
- **Lead CRUD + Convert** — BU-required. Source, status (NEW→QUALIFIED→CONVERTED/LOST). `POST /leads/:id/convert` creates Opportunity in transaction. Angular: table + form with BU/Account dropdowns, Convert button on active leads.
- **Opportunity CRUD + Detail Page** — dedicated `/sales/opportunities/:id` page with two-column layout. Stage + Entry Path from lookup lists (removed hardcoded enums). Multiple contacts (`opportunity_contact` join), multiple influencers (`opportunity_influencer` join). Owner user. Account + End Client. Probability 0-100. clientName auto-populated from End Client.
- **Government (Admin)** — code, name, type (NATIONAL/STATE), country, capital. API: `GET/POST/PATCH/DELETE /governments`. Refs-guard on delete (influencers linked).
- **Influencer (Sales)** — type (POLITICAL/BUREAUCRAT/OTHER), government link, partyName, qualifier, 5-star rating. API: `GET/POST/PATCH/DELETE /influencers`. Link/unlink with Opportunities.
- **Lookup Lists (Admin)** — generic configurable dropdown system. `LookupList` + `LookupItem` tables. Master-detail UI. API: CRUD for lists + items, `GET /lookup-lists/by-code/:code/items` for dropdown consumption. Replaces hardcoded enums for `account_type`, `opportunity_stage`, `entry_path`.
- **Opportunity Influencer linking** — `POST/DELETE /opportunities/:id/influencers/:influencerId`
- **Opportunity Contact linking** — `contactIds[]` on create/update, synced via delete-all + recreate
- Sidebar: Sales group (Accounts, Contacts, Leads, Influencers, Opportunities), Admin (Lookup Lists, Governments added)

### Fixed (2026-04-18)
- All `p-select` and `p-multiSelect` inside `p-dialog` across the entire app now use `appendTo="body"` — fixes dropdown clipping in dialogs where lower options were impossible to select

### Changed (2026-04-18)
- Removed Prisma enums: `OpportunityStage`, `EntryPath`, `AccountType` → replaced with lookup list strings
- `clientName` on Opportunity made optional, auto-populated from End Client account name
- `contactId` removed from Opportunity → replaced with `OpportunityContact` many-to-many join table
- `ownerUserId` added to Opportunity
- `governmentId` added to Account
- `code` field (1-5 chars, unique, no whitespace) added to Government and Account
- Audit middleware: `actorUserId` truncated to 26 chars to fix Keycloak UUID overflow

### Updated docs (2026-04-18)
- `docs/modules/02-sales.md` — entity table with shipped/not-started status
- `docs/solution-specification.md` — added Lookup Lists and CRM Entity Model cross-cutting sections
- `docs/prd.md` — R2 release row updated with shipped CRM + remaining items
- `docs/modules/_status.md` — R2 components added, next-up queue refreshed
- `docs/lessons.md` — 6 new lessons (lookup lists, db push enum changes, audit truncation, detail pages, many-to-many sync, Account/Contact not BU-scoped)

### Added
- API skeleton (`apps/api`) with Express 4 + TypeScript strict, Zod env validation, Pino structured logging, helmet/CORS/compression/rate-limit
- Middleware: `correlation-id`, `auth` (Keycloak JWT — stub verification, TODO before R1 ships), `validate` (Zod wrapper), `audit` (per-request context + `recordAudit()` helper writing to `audit_log`), `error-handler` (standard envelope), `not-found`
- `/api/v1/health` and `/api/v1/ready` endpoints (public)
- Prisma client singleton + ULID id generator at `apps/api/src/lib/prisma.ts`
- `libs/shared-types` package with `UlidSchema`, `PaginationParams`, `PaginationMeta`, `ErrorEnvelope`, `ErrorDetail`
- Jest + Supertest smoke test for `/health` and `/ready` (mocks Prisma to avoid generated-client dependency)
- Ambient `apps/api/src/types/express.d.ts` extending `Express.Request` with `correlationId`, `user`, `audit`
- `pnpm-workspace.yaml` at repo root (pnpm doesn't read `package.json#workspaces`)
- `docs/lessons.md` capturing R1-bootstrap lessons (env quirks, type-checking pitfalls, doc drift)

### Changed
- `prisma/schema.prisma`: set `engineType = "binary"` so `prisma generate` works on 32-bit Node installs (the local dev machine ships win-x86 Node 20)
- `apps/api/jest.config.ts` → `jest.config.js` to avoid pulling `ts-node` solely for config parsing
- `apps/api/src/app.ts`: removed premature `businessUnitRouter` import (deferred to Session 2 / FR-1.15); cast `pinoHttp` options to bridge pino@9.14 vs. pino-http type drift under `exactOptionalPropertyTypes`

### Verified
- `pnpm install` (Node 20.11.1 win-x86, pnpm 9.15.9) — clean, husky `prepare` warning ignored (no `.git`)
- `pnpm --filter @govprojects/api typecheck` — passes
- `pnpm --filter @govprojects/api test` — 3/3 pass
- `pnpm prisma generate` (root, with `PRISMA_*_ENGINE_TYPE=binary`) — generates client into `node_modules/.pnpm/@prisma+client@5.22.0/.../client`
- **Live boot via `pnpm --filter @govprojects/api dev`** on `http://localhost:3000`:
  - `GET /api/v1/health` → 200 `{"data":{"status":"ok","timestamp":"...","version":"0.0.1"}}`
  - `GET /api/v1/ready` → 200 `{"data":{"ready":true}}` (stub — DB/Redis probe TBD)
  - `GET /api/v1/no-such-route` → 404 `{"error":{"code":"NOT_FOUND",...}}` envelope
  - `X-Correlation-ID` header round-trips (auto-generated ULID when absent, echoed when supplied)
  - Helmet security headers, CORS, compression, and `RateLimit-Policy: 600;w=60` all present

### Added (continued — env loading)
- `apps/api/src/bootstrap-env.ts` — loads dotenv from monorepo root `.env` (fallback `apps/api/.env`); imported first by `server.ts` so vars exist before `env.ts` validates (fixes ESM hoisting issue where `import 'dotenv/config'` ran after the validator)
- `@prisma/client@5.22.0` added as a root dev dependency so `prisma generate` finds it next to the schema

### Added (2026-04-17 — R1 Session 4: Company Financials, Documents, User-Roles, BU Head)
- **Company financial fields** — `pan` (10-char regex), `gstin` (15-char regex), `bankName`, `bankBranch`, `ifsc` (11-char regex), `accountNo` added to Company model + API + UI. Two-column layout: Organization Details (left) + Financial Information (right).
- **Company Documents** — new `company_document` table + full API (CRUD + file upload via multer + download + reorder). Angular card view with file-type icons (Image/PDF/Word/PPT/Excel/Other), CDK drag-to-reorder, blob-based authenticated view. `sort_order` column for persistent ordering; new docs append to end.
- **User-Role multi-assignment** — new `user_role` join table (many-to-many). API accepts `roleIds[]` on create/update, syncs join table. User list returns `roles: [{id, name, displayName}]`. UI: Roles column shows chip tags; Add/Edit form has PrimeNG MultiSelect for roles.
- **BU Head improvements** — label changed to "BU Head", field changed from text input to filterable dropdown showing only users with `bu_head` role. BU list API includes `buHeadName`. New "BU Head" column in list table.
- **Route wiring fix** — `admin.routes.ts` changed Company Profile, Users, Roles from `PlaceholderComponent` to lazy-loaded real components.
- **Prisma migrations** — `add_company_financials`, `add_company_document`, `add_doc_sort_order`, `add_user_role`

### Updated (2026-04-17 — docs refresh)
- `docs/modules/01-organization-details.md` — entity table with shipped/schema-only status, FR table with status column, shipped API endpoints list, shipped Angular pages list
- `docs/prd.md` — R1 release row updated with shipped components and remaining items
- `docs/solution-specification.md` — added User-Role Model and Company Documents cross-cutting sections
- `docs/modules/_status.md` — refreshed all R1 component statuses and next-up queue
- `docs/lessons.md` — 6 new lessons (route wiring, blob downloads, Prisma regen, CDK drag grid, user-role sync, BU head filter)

### Added (2026-04-17 — R1 Session 3 cont'd: Company, Role & User Integration Tests)
- `apps/api/test/company.integration.test.ts` — **8 tests**: GET 404 when no profile, GET returns existing, 401 without auth, PATCH upsert creates (201), PATCH updates existing (200), audit on create, audit on update with before/after, 400 on invalid input
- `apps/api/test/role.integration.test.ts` — **18 tests**: POST create + DB verify + audit, 409 duplicate name, 400 missing name, 401 without auth, GET list (empty, seeded, cursor pagination, ?q= search), GET single + 404, PATCH update + audit + 409 rename conflict + 404, DELETE soft-delete + audit, 422 system role guard, 422 refs-guard with BU member, 404 non-existent
- `apps/api/test/user.integration.test.ts` — **21 tests**: POST create + DB verify + audit, 409 duplicate email, 400 missing fields, 400 invalid email, 401 without auth, GET list (empty, seeded, cursor pagination, status filter, ?q= search), GET single + BU membership include + 404 + 404 soft-deleted, PATCH update + audit + 409 email conflict + status change + 404, DELETE soft-delete + audit + 404
- `apps/api/test/helpers.ts` — added `seedRole()`, `seedCompany()`, `seedBuMember()` seed helpers
- `apps/api/package.json` — `test:integration` now uses `--runInBand` (serial execution required — all suites share one DB, parallel `truncateAll()` causes FK violations)

### Verified
- `pnpm --filter @govprojects/api typecheck` — passes
- `pnpm --filter @govprojects/api test` — **19/19 unit tests pass**
- `pnpm --filter @govprojects/api test:integration` — **71/71 integration tests pass** (5 suites: health 4, BU 20, company 8, role 18, user 21)

### Added (2026-04-17 — R1 Session 3 cont'd: Integration Test Harness)
- `apps/api/jest.integration.config.js` — separate Jest config for integration tests (`*.integration.test.ts`), with 30s timeout, `globalSetup` that pushes Prisma schema to `govprojects_test` DB, and `globalTeardown`
- `apps/api/test/setup.integration.ts` — integration test bootstrap pointing `DATABASE_URL` at `govprojects_test` (port 3307); mocks `jose` (auth already verified end-to-end)
- `apps/api/test/helpers.ts` — shared test utilities: `getTestPrisma()` (dedicated client for test assertions), `truncateAll()` (FK-safe table reset per test), `fakeJwt()`, seed helpers for User, BusinessUnit, and Project
- `apps/api/test/health.integration.test.ts` — **4 tests**: health 200, no-auth access, correlation-id echo, /ready with real DB+Redis
- `apps/api/test/business-unit.integration.test.ts` — **20 tests**: full CRUD against real MySQL — create + DB persistence + audit log assertion, 422 on missing BU head, 400 on missing name, 401 without auth, empty list, seeded list, cursor pagination across 3 pages, status filter, text search via `?q=`, single get, 404 not found, 404 soft-deleted, patch + DB verify + audit before/after, BU head re-validation on patch, delete + soft-delete verify + audit, 422 refs-guard with seeded project, 404 on unknown, 404 on already-deleted
- `apps/api/jest.config.js` — added `testPathIgnorePatterns` to exclude `*.integration.test.ts` from unit test runs
- `apps/api/package.json` — added `test:integration` script
- `docker exec` creates `govprojects_test` database; `prisma db push` syncs schema

### Verified
- `pnpm --filter @govprojects/api test` — **19/19 unit tests pass** (integration tests excluded)
- `pnpm --filter @govprojects/api test:integration` — **24/24 integration tests pass** (real MySQL + Redis)
- `pnpm --filter @govprojects/api typecheck` — passes

### Added (2026-04-17 — R1 Session 3: Keycloak Auth Wire-up)
- `scripts/keycloak-bootstrap.ts` — idempotent provisioning script that creates the `govprojects` realm, `govprojects-api` (confidential) and `govprojects-web` (public SPA) clients, audience mapper (so `aud` claim includes `govprojects-api`), 8 realm roles (`super_admin`, `admin`, `bu_head`, `project_manager`, `site_engineer`, `procurement_officer`, `finance_officer`, `viewer`), and a dev test user (`testuser` / `Test@1234`, role: `admin`). Run via `pnpm tsx scripts/keycloak-bootstrap.ts`.
- `apps/api/src/middleware/auth.ts` — **replaced stub JWT decoder** with real `jose` JWKS verification: `createRemoteJWKSet` fetches keys from `${JWT_ISSUER}/protocol/openid-connect/certs`, `jwtVerify` validates signature, issuer (`JWT_ISSUER`), audience (`JWT_AUDIENCE`), and expiry. Invalid/expired/unsigned tokens are silently rejected (no `req.user` → 401 from `requireAuth`). The `AuthenticatedUser` interface, `requireAuth`, and `requireRole` helpers are unchanged.
- `apps/api/test/setup.ts` — global `jose` mock for unit tests: `jwtVerify` decodes the base64url payload from fake JWTs without signature checks, keeping all 19 existing tests passing without a live Keycloak.

### Fixed (2026-04-17)
- `apps/api/src/modules/admin/user/repository.ts` + `service.ts` — changed `status` field types from `string` to `UserStatus` (Prisma enum) to fix 3 pre-existing TS2322 type errors.

### Verified (live, real Keycloak + MySQL + Redis)
- `pnpm --filter @govprojects/api typecheck` — passes (was failing before due to UserStatus type mismatch)
- `pnpm --filter @govprojects/api test` — **19/19 pass**
- Keycloak bootstrap script ran successfully against `http://localhost:8080` — realm, clients, roles, audience mapper, test user all provisioned
- Real JWT from Keycloak (`grant_type=password`, `client_id=govprojects-web`, user `testuser`) → `GET /api/v1/business-units` returns **200** with data
- No token → **401**; garbage token → **401**; fake unsigned JWT → **401** (JWKS verification rejects)
- `GET /api/v1/health` remains public (no auth required)

### Unblocked (2026-04-17 — R1 Session 1 cont'd)
- Docker Desktop installed on host; `docker compose up -d` brings up **MySQL 8 (healthy)**, **Redis 7 (healthy)**, **RabbitMQ**, **Keycloak 24**, **MinIO (healthy)**, **OpenSearch 2.13**, **MailHog**
- Host already runs native **MySQL84** service on port 3306 → added **`docker-compose.override.yml`** (gitignored) that uses `!override` to remap the compose MySQL to host port **3307**; updated `DATABASE_URL` in `.env` to `mysql://govprojects:govprojects@localhost:3307/govprojects`. The override pattern keeps the checked-in `docker-compose.yml` canonical.
- Granted `govprojects` MySQL user `ALL PRIVILEGES ON *.*` (needed for Prisma shadow-database during `migrate dev`)
- **Initial Prisma migration applied**: `apps/api && pnpm exec prisma migrate dev --name init --schema=../../prisma/schema.prisma` → created `prisma/migrations/20260416191453_init/migration.sql` and 25 tables (`business_unit`, `company`, `user`, `employee`, `opportunity`, `project`, `task`, `material_request` + lines, `expense_sheet` + lines + events, `vendor`, `item`, `bank_account`, `certification`, `dsc`, `empanelment`, `past_project`, `statutory_registration`, `turnover_record`, `attachment`, `audit_log`, `outbox_event`, `_prisma_migrations`)
- Prisma client regenerated (`engine=binary`, v5.22.0)

### Added (2026-04-17 — /ready now real)
- `apps/api/src/lib/redis.ts` — singleton ioredis client bound to `env.REDIS_URL`, lazy connect, `maxRetriesPerRequest: 2`
- `/api/v1/ready` now runs `SELECT 1` (via `prisma.$queryRawUnsafe`) **and** `redis.ping()` in parallel; returns **200** when both pass, **503** when either fails, with a `checks: { db, redis }` object carrying per-probe `ok`/`error` detail
- `apps/api/test/health.test.ts` expanded to 5 tests (was 3): happy-path, DB-fails-503, Redis-fails-503 cases added with Jest mocks of `prisma.$queryRawUnsafe` and `redis.ping`

### Verified (live)
- `pnpm --filter @govprojects/api typecheck` — passes
- `pnpm --filter @govprojects/api test` — 5/5 pass
- Live `pnpm --filter @govprojects/api dev`:
  - `GET /api/v1/ready` with MySQL + Redis up → 200 `{"data":{"ready":true,"checks":{"db":{"ok":true},"redis":{"ok":true}}}}`
  - `docker stop govprojects-redis` → 503 `{"data":{"ready":false,"checks":{"db":{"ok":true},"redis":{"ok":false,"error":"Reached the max retries per request limit..."}}}}`
  - `docker start govprojects-redis` → back to 200 on next poll (recovery works)

### Added (2026-04-17 — R1 Session 2: Business Unit CRUD, FR-1.15)
- `libs/shared-types/src/organization/business-unit.ts` — `BusinessUnitStatus`, `ApprovalThresholdRule`, `ApprovalThresholds`, `BusinessUnitDto`, `CreateBusinessUnitInput`, `UpdateBusinessUnitInput`, `ListBusinessUnitsQuery`. Barrel `libs/shared-types/src/organization/index.ts` re-exported from the root entry.
- `libs/shared-types` is now a workspace dependency of `apps/api` (`workspace:*`).
- `apps/api/src/modules/organization/business-unit/{types,repository,service,routes}.ts` — full CRUD with:
  - **Endpoints:** `GET /api/v1/business-units` (cursor-paginated list, `?status`/`?q`/`?cursor`/`?limit` filters, `next_cursor` computed by fetching `limit+1`), `POST /business-units`, `GET /business-units/:id`, `PATCH /business-units/:id`, `DELETE /business-units/:id` (soft delete via `deleted_at`)
  - **BU Head validation** — asserts `buHeadUserId` references an active User, 422 `BU_HEAD_NOT_FOUND` otherwise
  - **Refs guard on delete** — counts active `project`, `opportunity`, `expense_sheet`, `material_request` rows pointing at the BU; returns 422 `BU_HAS_REFERENCES` with per-type counts in `error.details` so the UI can tell the user exactly what to reassign
  - **Audit on every write** — `recordAudit` emits CREATE/UPDATE/DELETE with before/after snapshots, keyed by `resource_type='business_unit'`
  - Uses `Prisma.BusinessUnitUncheckedUpdateInput` so FK field `buHeadUserId` can be set directly on update (Prisma's checked type requires `{ buHead: { connect: { id } } }`)
  - ULID cursor pagination — ULIDs are lex-sortable so `orderBy: { id: 'asc' }` + `cursor: { id }` + `skip: 1` gives stable forward paging without a secondary timestamp column
- `apps/api/src/app.ts` — registers `businessUnitRouter` under `/api/v1/business-units`
- `apps/api/test/business-unit.test.ts` — **14 supertest cases** covering list pagination (with/without next_cursor), auth required (401), single get + 404 + 400-on-invalid-ULID, create happy path + audit write assertion + 422 head-not-found + 400 missing-name, patch update with before/after audit + 422 on swapping in a missing head, delete happy-path 204 + 422 BU_HAS_REFERENCES with per-type count assertion + 404 unknown id
- `docs/api/endpoints.md` — FR-1.15 endpoints moved from "planned" to "shipped" with the full semantics described inline

### Verified (live, real MySQL + Redis)
- `pnpm --filter @govprojects/shared-types build` — emits `dist/` for workspace consumers
- `pnpm --filter @govprojects/api typecheck` — passes
- `pnpm --filter @govprojects/api test` — **19/19 pass** (5 health + 14 BU)
- `pnpm --filter @govprojects/api dev` + curl against `http://localhost:3000`:
  - 401 without `Authorization` header
  - 201 on valid create; response has canonical DTO; id is a ULID generated in app code
  - 422 `BU_HEAD_NOT_FOUND` when `buHeadUserId` points at a non-existent user
  - 400 `VALIDATION_FAILED` on missing `name` with `details:[{path:"name",message:"Required"}]`
  - 200 list returns `{data:[...], meta:{next_cursor:null, limit:50}}`
  - 200 single get
  - 200 patch with bumped `updatedAt`
  - 404 `NOT_FOUND` on unknown id
  - **422 `BU_HAS_REFERENCES`** after inserting a real `project` row referencing the BU; `error.details` = `{projects:1, opportunities:0, expenseSheets:0, materialRequests:0}`
  - 204 delete succeeds after removing the project row
  - `audit_log` table has CREATE/UPDATE/DELETE rows with `resource_type='business_unit'`, `actor_user_id='usr_stub'` (the auth stub — real Keycloak sub lands next session)

### Infra notes (2026-04-17)
- `docker-compose.override.yml` (gitignored) remaps compose MySQL to host port **3307** using YAML `!override` tag because the host runs a native `MySQL84` service on 3306. The `!reset` tag clears the list entirely; `!override` replaces it.
- `govprojects` MySQL user was granted `ALL PRIVILEGES ON *.* WITH GRANT OPTION` so Prisma's shadow-database creation works during `migrate dev`. Re-run this grant if the MySQL volume is ever wiped.
- Prisma CLI does not pick up the monorepo-root `.env` — export `DATABASE_URL` (and `PRISMA_*_ENGINE_TYPE=binary` for the 32-bit Node quirk) before calling `prisma migrate`/`generate`.
- Initial repository scaffold with monorepo layout (apps/web, apps/mobile, apps/api, libs/*)
- Documentation set: solution spec, PRD, 5 module FR docs, architecture, security, database, API conventions
- Prisma schema starter covering Module 1 (Organization Details) + cross-cutting tables (audit_log, outbox_event, attachment)
- Docker Compose for local dev: MySQL 8, Redis 7, RabbitMQ, Keycloak, MinIO, OpenSearch, MailHog
- `.env.example` with all required environment variables
- `CLAUDE.md` with stack, conventions and workflow expectations for AI-assisted development

### Pending (R1 — Foundation)
- Monorepo bootstrap with pnpm workspaces + Turborepo
- Express API skeleton with middleware (correlation-id, auth, zod-validate, audit, error-handler)
- Angular 17 app shell with Keycloak OIDC auth
- Ionic app shell sharing auth with web
- Business Unit CRUD (FR-1.15)
- Company profile + compliance masters (FR-1.1 to FR-1.9)
- Expiry dashboard (FR-1.13)
- RBAC + BU-scope enforcement
