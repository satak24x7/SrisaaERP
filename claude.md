# CLAUDE.md — Project Instructions for Claude Code

> Read this file first on every session. It is the source of truth for project conventions, stack, and what to work on next.

## What this project is

**GovProjects Platform** — an integrated Sales & Project Execution platform for Indian companies that execute government projects. It covers:

1. **Organization Details** (incl. Business Units)
2. **Sales** (Managed Tenders, Standard Tenders, Active Tenders, Cost of Sale)
3. **Project Execution** (Milestones, WBS, Kanban, Budget, Cash Flow)
4. **Expense Management** (Pre-Project & During-Project expense sheets)
5. **Material & Procurement** (MR → Indent → PO → GRN → Issue)

**Business Unit** is cross-cutting: every Opportunity, Project, Expense Sheet and Material Request is tagged to exactly one BU, and the BU Head is the default second-level approver.

Full specs live in:
- `docs/solution-specification.md` — architecture, workflows, entities
- `docs/prd.md` — product requirements, user stories, priorities
- `docs/modules/*.md` — per-module functional requirements
- `docs/architecture/*.md` — system design, tech stack, security
- `docs/database/schema.md` — MySQL schema guidance
- `docs/api/conventions.md` — API design rules

## Technology stack (non-negotiable)

| Layer | Choice |
|---|---|
| Web front-end | **Angular 17+** (TypeScript strict), Angular CLI, Tailwind CSS, **PrimeNG** for data-heavy components, Angular Material as fallback |
| State | **NgRx** for cross-module state, RxJS throughout |
| Mobile | **Ionic 7 + Capacitor** (reuses the Angular codebase) |
| Back-end runtime | **Node.js 20 LTS** + **TypeScript (strict)** |
| Web framework | **Express 4.x** (keep it lean; no NestJS) |
| Validation | **Zod** for all inputs (body, query, params) |
| Logging | **Pino** (structured JSON) |
| ORM | **Prisma** (schema-first); Knex only for complex/raw queries |
| Database | **MySQL 8.0** |
| Cache / Queue | **Redis 7** + **BullMQ** for in-app jobs |
| Events | **RabbitMQ** for durable async events |
| Search | **OpenSearch** |
| Object storage | S3-compatible (AWS S3 Mumbai / MinIO for local dev) |
| Auth / SSO | **Keycloak** (OIDC / SAML, TOTP MFA) |
| Workflow | **Camunda 8** (Zeebe) for stage-gated flows |
| Observability | Prometheus + Loki + Tempo + Grafana; Sentry for errors |
| Tests | **Jest** (unit), **Supertest** (API), **Playwright** (e2e) |

### NOT in the stack
- **No React / Next.js** — this project uses Angular
- **No PostgreSQL** — we use MySQL
- **No NestJS** — Express only, kept lean with conventions
- **No DSC / e-Sign integration** — users sign bid packs externally and upload
- **No LocalStorage / SessionStorage** in web app — use NgRx / memory

## Project layout (monorepo)

```
govprojects-platform/
├── apps/
│   ├── web/              # Angular 17 app (Tailwind + PrimeNG)
│   ├── mobile/           # Ionic + Capacitor app (shares libs with web)
│   └── api/              # Node.js + Express + TypeScript API
├── libs/
│   ├── shared-types/     # Zod schemas + inferred TS types shared across apps
│   ├── ui-kit/           # Angular components, pipes, directives
│   └── api-client/       # Generated API client (OpenAPI)
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── docs/                 # Specs, PRD, ADRs, module requirements
├── scripts/              # Seed data, code gen, one-off dev scripts
├── docker-compose.yml    # Local dev infra (MySQL, Redis, RabbitMQ, Keycloak)
├── package.json          # pnpm workspaces root
├── turbo.json            # Turborepo pipeline (or Nx if chosen)
└── CLAUDE.md             # This file
```

Use **pnpm workspaces + Turborepo**. If the team prefers Nx, flag it before changing.

## Coding conventions

### General
- **TypeScript strict mode everywhere.** `noImplicitAny`, `strictNullChecks`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- Prefer **small, pure functions** over classes unless the framework requires a class.
- Never disable ESLint rules locally. If a rule is wrong, raise it for discussion.
- Never swallow errors. Log with context, rethrow or handle explicitly.
- Dates in ISO 8601 strings at API boundaries; **Day.js** in app code (not Moment).
- Money as integers in smallest unit (paise), never floats.
- Currency: default **INR**; symbol `₹`.

### Back-end (Express + TypeScript)
- Folder structure per feature: `src/modules/<module>/{routes,service,repo,schema,types}.ts`
- Every route handler uses `asyncHandler` (wraps async errors to `next`)
- Every input validated via Zod; inferred types flow through to handlers
- Repository layer uses Prisma; service layer is pure business logic
- Controllers / routes are thin; no business logic in them
- Always return `{ data, meta }` for collections and `{ data }` for single items
- Standard error envelope: `{ error: { code, message, details? } }`
- HTTP status codes: 200 OK, 201 Created, 204 No Content, 400 Validation, 401 Auth, 403 Forbidden, 404 Not Found, 409 Conflict, 422 Business Rule, 500 Server

### Front-end (Angular)
- **Standalone components** (no NgModules). Bootstrap via `bootstrapApplication`.
- **Signals** for local component state; **NgRx** only for cross-feature / shared state
- Routing: lazy-loaded feature routes (`loadComponent` / `loadChildren`)
- Forms: **Reactive Forms** with typed `FormGroup<T>`; no template-driven forms
- HTTP: `HttpClient` with interceptors for auth, correlation ID, and error toast
- Styling: **Tailwind utility classes** first; component-scoped SCSS only for complex cases
- UI: prefer **PrimeNG** for tables, tree-tables, Kanban, calendars; **Angular Material** for dialogs, snackbars, date pickers
- No `any`. Use `unknown` then narrow.

### Database (MySQL)
- Engine **InnoDB**, charset **utf8mb4**, collation **utf8mb4_0900_ai_ci**
- IDs: `VARCHAR(26)` ULIDs generated in Prisma middleware (not auto-increment — better for distributed systems and non-guessable URLs)
- Timestamps: `created_at`, `updated_at`, `deleted_at` (soft delete) on every table
- Every row tagged with `business_unit_id` where applicable — enforce via schema
- No `TEXT` where `VARCHAR(n)` is sufficient. Think about size.
- Always add indexes on foreign keys + frequent query predicates
- Migrations via **Prisma Migrate**. Never edit generated migrations after they run in any shared env.
- Soft delete by default; hard delete requires explicit approval

### API conventions
- Base path: `/api/v1`
- Resource URLs: kebab-case plural nouns — `/material-requests`, `/expense-sheets`
- Filters: `?status=submitted&bu_id=bu_01H...`
- Pagination: cursor-based `?cursor=...&limit=50` (max 200)
- Sorting: `?sort=-created_at,name`
- Every request carries `X-Correlation-ID`; log and echo it
- Every write endpoint is idempotent via `Idempotency-Key` header for jobs / bulk ops

### Commits & PRs
- **Conventional Commits**: `feat(module): ...`, `fix(module): ...`, `chore: ...`, `refactor: ...`, `test: ...`, `docs: ...`
- PRs must: reference a FR ID from `docs/modules/*.md`, include tests, pass `pnpm ci` (lint + typecheck + test + build)
- Never commit secrets. `.env.example` is the source of truth for env keys.

## Workflow expectations for Claude Code

When starting work on a feature:

1. **Read the relevant FR** in `docs/modules/<module>.md`. Confirm scope with the user if anything is ambiguous.
2. **Plan in short bullets** before writing code: what routes, what DB changes, what UI screens.
3. **Database first.** If the schema changes, update `prisma/schema.prisma`, run `prisma migrate dev --name <short_name>`, and regenerate types.
4. **API next.** Add Zod schemas in `libs/shared-types`, then service + route + integration test.
5. **Front-end last.** Regenerate the typed client if used; build the screen; wire it up.
6. **Tests are non-negotiable.** Unit for services, integration for API routes, e2e for critical flows (bid submission, MR → issue, expense approval).
7. **Update docs** in `docs/modules/<module>.md` if scope evolved.

### Before declaring a task done
- `pnpm lint && pnpm typecheck && pnpm test` all pass
- New env vars added to `.env.example`
- New routes listed in `docs/api/endpoints.md`
- A short note of what changed in `docs/CHANGELOG.md`

## Domain quick-reference (vocabulary you'll see a lot)

- **BU** — Business Unit; every project/opportunity belongs to one
- **BU Head** — accountable for BU P&L; default second-level approver
- **Managed Tender** — proactive pre-RFP engagement (7 upstream stages M1–M7)
- **Standard Tender** — reactive bid against a published tender (8 stages)
- **Bid Evaluation** — 3 sub-stages: Pre-Qualification, Technical, Financial
- **Cost of Sale** — all expenses booked against pursuing an opportunity
- **MR** — Material Request (from project team)
- **Indent** — consolidated request by Admin team for buying
- **GRN** — Goods Receipt Note
- **Issue** — material handed over from Stores to Project Team
- **PBG** — Performance Bank Guarantee
- **EMD** — Earnest Money Deposit
- **DPR** — Detailed Project Report (shaped during Managed Tenders)

## Current status

See `docs/CHANGELOG.md` and `docs/modules/_status.md` for what's shipped, what's in progress, and what's next.

## When in doubt

Ask the user. Never guess on business rules — the PRD and Solution Spec are the authority, and anything missing there needs a decision, not a guess.
