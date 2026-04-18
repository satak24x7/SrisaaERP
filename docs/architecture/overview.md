# Architecture Overview

## High-level shape

A **modular monolith** on the back-end, with each business module (Organization, Sales, Execution, Expense, Procurement) implemented as a self-contained feature folder inside the Express API. We extract to microservices only if scale or team topology demands it.

The front-end is an **Angular 17 single-page app** with lazy-loaded feature modules that mirror the back-end structure. The mobile app is **Ionic + Capacitor**, sharing `libs/shared-types` and selected UI components with the web.

## Request lifecycle

```
Web (Angular) / Mobile (Ionic)
        │  HTTPS (JWT access token, correlation-id)
        ▼
  CDN / WAF (CloudFront + AWS WAF)
        │
        ▼
  Load Balancer (ALB)
        │
        ▼
  API Gateway (Kong)              ← rate limiting, auth introspection
        │
        ▼
  Express API (Node 20, TS)
        │
        ├── Middleware: correlation-id, auth, zod-validate, error-handler
        ├── Feature modules: routes → service → repository (Prisma)
        └── Cross-cutting: audit log, outbox events (RabbitMQ), metrics
        │
        ▼
  MySQL 8 (RDS) · Redis (cache + BullMQ) · RabbitMQ · OpenSearch · S3
```

## Module boundaries inside the API

```
apps/api/src/
├── app.ts
├── server.ts
├── config/
├── middleware/
│   ├── correlation-id.ts
│   ├── auth.ts              # verifies Keycloak JWT
│   ├── validate.ts          # zod wrapper
│   ├── error-handler.ts
│   └── audit.ts
├── modules/
│   ├── organization/
│   │   ├── routes.ts
│   │   ├── service.ts
│   │   ├── repository.ts
│   │   ├── schema.ts        # zod
│   │   └── types.ts
│   ├── sales/
│   ├── execution/
│   ├── expense/
│   └── procurement/
├── jobs/                     # BullMQ processors
├── events/                   # RabbitMQ publishers + consumers
└── lib/                      # small shared utils (no business logic)
```

Modules communicate through **public service functions** only (exported from `service.ts`). No cross-module repository access. Async / decoupled communication goes via the outbox → RabbitMQ pattern.

## Data flow highlights

- **Won Opportunity → Project** is an async event: `sales.opportunity.awarded` → `execution` module consumes it and creates the Project shell.
- **Expense sheet "Paid" → GL posting** is an event: `expense.sheet.paid` → consumer posts to accounting integration.
- **MR approved → stock check → PO commitment** all happen synchronously within procurement service; only the external accounting post is async.

## Cross-cutting concerns

| Concern | Implementation |
|---|---|
| AuthN | Keycloak OIDC; JWT access tokens; refresh via silent renewal |
| AuthZ | Role + BU scope on every protected route; claims in JWT |
| Audit | Every write emits an `audit.event` → `audit_log` table + append-only S3 archive |
| Validation | Zod schemas shared via `libs/shared-types` |
| Errors | Single error envelope `{ error: { code, message, details? } }` |
| Correlation | `X-Correlation-ID` from gateway; propagated in logs & events |
| Idempotency | `Idempotency-Key` header for job kick-offs and bulk ops |
| Rate limit | At gateway (Kong) per user/IP; stricter on `/auth` and `/search` |
| Secrets | Vault in staging/prod; `.env` for local dev |

## Environments

- **local** — Docker Compose: MySQL, Redis, RabbitMQ, Keycloak, MinIO, OpenSearch
- **dev** — ephemeral, wiped nightly
- **qa** — stable, auto-deployed on `main` merge
- **uat** — client-facing; matches prod config
- **prod** — AWS Mumbai primary, Hyderabad DR

## Non-functional targets

- Availability ≥ 99.5% monthly
- Dashboard p95 ≤ 3s on 10k records
- Tender doc import ≤ 30s per document
- 200 concurrent users, 10k opportunities, 1k active projects
- RPO ≤ 24h, RTO ≤ 8h
- All data in India; DR region also in India

## What we deliberately avoid

- Microservices on day one (operational overhead without payoff)
- Event-sourcing the entire domain (overkill; we only event-source `expense_sheet_event` and audit log)
- Custom auth (always use Keycloak)
- Ad-hoc SQL from controllers (always via repository)
- Premature generalisation (build for now, refactor with tests)
