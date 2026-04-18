# Tech Stack

See `CLAUDE.md` for the quick-reference list. This file captures the *why* for each major choice — useful when someone asks "can we swap X for Y".

## Front-end: Angular 17

Chosen because:
- Opinionated framework with built-in router, forms, DI, HTTP — business-app strengths
- Strong convention ceiling (useful for large teams of mixed seniority)
- Standalone components + signals bring the modern DX while keeping Angular's enterprise bones
- PrimeNG gives us data-heavy components (tables, Kanban, Gantt, trees) out of the box
- Large Indian talent pool

We deliberately chose Angular over React because the app is ~80% CRUD + workflow screens, not a highly custom UI. Consistency, not flexibility, is the priority.

## Mobile: Ionic + Capacitor (Angular)

Chosen because:
- Reuses the Angular codebase → one team, shared types, shared services
- Delivers real iOS/Android apps via Capacitor (camera, offline SQLite, push)
- Adequate for form-heavy task / expense / MR flows — we're not building games

We deliberately did not choose:
- React Native (wrong framework choice for an Angular shop)
- Flutter (separate team, separate language)
- Native iOS/Android (doubles the cost for marginal gain)

## Back-end: Node.js 20 + Express + TypeScript

Chosen because:
- Same language (TS) across web, mobile and API → fewer context switches
- Express is minimal and stable; easy to understand and audit
- High throughput for I/O-heavy workloads (our workload is I/O, not CPU)

We deliberately did not choose:
- NestJS (too much framework for a small surface we control)
- Spring Boot / Java (great tech, but adds a polyglot team and heavier tooling)
- Python (slower for concurrent web serving)

Since Express is minimal, we enforce discipline via:
- **Zod** for every input
- **Pino** for structured logging
- **Feature-folder** layout (no god-folders like `/controllers`)
- **AsyncHandler** wrapper on every route

## Database: MySQL 8

Chosen because:
- Widely supported, familiar to most teams, massive hosting and DBA ecosystem in India
- Aurora MySQL-compatible is available if we need auto-scaling and faster failover
- JSON column support (since 5.7) is enough for the flexibility we need

We deliberately did not choose:
- PostgreSQL (technically excellent but MySQL was a stronger fit to team skills)
- MongoDB (our domain is relational — bids, projects, ledgers, approvals)
- MSSQL / Oracle (licence cost, no upside)

## ORM: Prisma (primary)

Chosen because:
- Schema-first, typed end-to-end
- Excellent migration tooling
- Works great with MySQL

We keep Knex ready for the 5% of queries where Prisma's DSL fights us (complex joins with CTEs, window functions, specific index hints).

## Cache & Queue: Redis + BullMQ + RabbitMQ

Split responsibilities:
- **Redis**: cache (session-adjacent data, reference masters), rate limits, BullMQ job store
- **BullMQ**: in-app jobs (reminders, nightly cost postings, expiry alerts) — runs inside the same deployment
- **RabbitMQ**: durable, cross-module events (e.g., opportunity awarded → create project) — survives restarts, replayable

Kafka is a future option if event volume grows 10×.

## Search: OpenSearch

For full-text on:
- Tender / RFP documents
- CVs (skill, qualification, years)
- Historical bids (finding clauses, past pricing)

## Object storage: S3-compatible

AWS S3 Mumbai in production; **MinIO** in local dev so the same SDK works everywhere.

## Auth: Keycloak

Self-hosted OIDC + SAML provider. Gives us:
- SSO with corporate Azure AD or Google Workspace (federation)
- TOTP MFA
- Groups and roles mapped into JWT claims
- No vendor lock-in

## Workflow: Camunda 8 (Zeebe)

For stage-gated flows:
- Sales stages (Managed Tender M1–M7, Standard 1–8, Evaluation 6a–6c)
- Expense approval chains with escalation
- MR → Indent → PO → GRN → Issue

The alternative — a hand-rolled state machine — scales poorly when business users want to change thresholds and stages. BPMN lets us expose a visual modeller later if needed.

## Observability

- **Metrics**: Prometheus + Grafana
- **Logs**: Pino → Loki (via Promtail)
- **Traces**: OpenTelemetry → Tempo
- **Errors**: Sentry

Unified in Grafana dashboards. Correlation IDs flow across all three pillars.

## Testing

- **Jest** — unit + service layer
- **Supertest** — API integration (each route has a happy-path and error-path test at minimum)
- **Playwright** — e2e for critical flows (bid submission, MR → issue, expense approval)
- **Postman / Newman** — smoke suite run on every deploy

## CI/CD

- **GitHub Actions** for lint, typecheck, test, build, image push, image scan
- **ArgoCD** for GitOps-based deploys to EKS (dev → qa → uat → prod)
- Promotion requires green pipeline + manual approval for uat/prod
