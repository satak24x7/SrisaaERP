# API Conventions

## Base URL

- Prod: `https://api.govprojects.example.com/api/v1`
- Dev: `http://localhost:3000/api/v1`

All routes live under `/api/v1`. Breaking changes require `/api/v2`.

## URL shape

- Resources are **kebab-case plural nouns**: `/material-requests`, `/expense-sheets`, `/business-units`
- Nested only when the child has no standalone identity: `/projects/:id/milestones`
- Otherwise keep flat and filter: `/tasks?project_id=...` instead of `/projects/:id/tasks`
- No verbs in URLs; use HTTP methods

## HTTP methods

| Method | Use |
|---|---|
| `GET` | Read only |
| `POST` | Create, or command-style actions like `/expense-sheets/:id/submit` |
| `PATCH` | Partial update |
| `PUT` | Full replacement (rare) |
| `DELETE` | Soft delete |

## Status codes

| Code | When |
|---|---|
| 200 | OK (GET, PATCH) |
| 201 | Created (POST) |
| 204 | No Content (DELETE, actions with no body) |
| 400 | Validation failed (malformed input) |
| 401 | Not authenticated |
| 403 | Authenticated but forbidden |
| 404 | Resource not found |
| 409 | Conflict (version mismatch, duplicate) |
| 422 | Business rule violation |
| 429 | Rate limited |
| 500 | Unhandled server error |

## Response shape

**Single resource:**
```json
{ "data": { "id": "01H...", "name": "..." } }
```

**Collection:**
```json
{
  "data": [ { ... }, { ... } ],
  "meta": { "next_cursor": "01H...", "limit": 50, "total": 2137 }
}
```

**Error:**
```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Required field missing",
    "details": [
      { "path": "items[0].qty", "message": "Must be positive" }
    ]
  }
}
```

Error `code` values are SCREAMING_SNAKE and stable (never changed once shipped).

## Filters, sort, paginate

- **Filters** as query params: `?status=submitted&bu_id=bu_01H...&priority=urgent`
- **Sort**: `?sort=-created_at,name` (minus prefix = desc)
- **Pagination**: cursor-based only — `?cursor=opaque&limit=50` (max 200)
- **Search** (where supported): `?q=urgent%20spares` — free text

## Headers

| Header | Direction | Purpose |
|---|---|---|
| `Authorization: Bearer <JWT>` | Request | Auth |
| `X-Correlation-ID` | Both | Trace across services; client may supply, server echoes |
| `Idempotency-Key` | Request | On create / bulk / job kick-off |
| `If-Match: <etag>` | Request | Optimistic concurrency on PATCH/PUT/DELETE |
| `ETag` | Response | Resource version |

## Idempotency

On `POST` that create resources or kick off jobs, the client SHOULD send `Idempotency-Key`. Server stores key for 24h; repeat with same key returns the original response. Required for: payments, sending PO to vendor, any external-effect operation.

## Versioning

- Path prefix: `/api/v1`
- Additive changes (new field, new optional query param) do not require a new version
- Removing a field, changing a meaning, or tightening validation requires a new version

## Resource naming examples

| Entity | URL |
|---|---|
| Business Unit | `/business-units` |
| Managed Tender | `/managed-tenders` |
| Managed Tender Stakeholder | `/managed-tenders/:id/stakeholders` |
| Opportunity | `/opportunities` |
| Opportunity Evaluation (sub-stage) | `/opportunities/:id/evaluation/pre-qualification` |
| Project | `/projects` |
| Project Budget | `/projects/:id/budget` |
| Task | `/tasks` |
| Expense Sheet | `/expense-sheets` |
| Expense Sheet Submit | `POST /expense-sheets/:id/submit` |
| Approval Inbox | `/approvals` |
| Material Request | `/material-requests` |
| Indent | `/indents` |
| Purchase Order | `/purchase-orders` |
| GRN | `/grns` |
| Material Issue | `/material-issues` |
| Material Trace | `/material-trace?mr_id=...` |
| Vendor Scorecard | `/vendors/:id/scorecard` |
| Stock Ledger | `/stock-ledger` |

## OpenAPI

- The canonical spec lives at `apps/api/openapi.yaml`
- Generated from Zod schemas via `zod-to-openapi`
- `GET /api/v1/docs` serves Swagger UI in non-prod
- A typed client lib is generated into `libs/api-client` on every API build

## What to avoid

- No query params that change HTTP semantics (`?method=delete`)
- No fat generic `POST /query` endpoints
- No unbounded list endpoints — always paginate
- No mixing of successful and failed items in a 200 response — 207 Multi-Status is rarely worth it; prefer clean 4xx + details array
