# Claude Code Kickoff Guide

> First time opening this repo in Claude Code? This file tells you exactly what to say and what to expect.

## One-time setup (human does this)

```bash
# Prereqs: Node 20, pnpm 9, Docker, MySQL client
cp .env.example .env          # fill in values; defaults are fine for local
docker compose up -d          # MySQL, Redis, RabbitMQ, Keycloak, MinIO, OpenSearch
pnpm install
```

Don't run `pnpm dev` yet — the apps don't exist. That's Claude Code's job.

## Session 1 — Bootstrap

Paste this to Claude Code:

> Read `CLAUDE.md` first. Then read `docs/modules/_status.md`, `docs/architecture/overview.md`, and `docs/database/schema.md`.
>
> We're starting R1 (Foundation). In this session, do ONLY these things, in order:
>
> 1. Bootstrap `apps/api` with Node 20 + Express 4 + TypeScript (strict) + Zod + Pino, following the layout in `apps/api/README.md`. Add `tsconfig.json` (extends the root base), `jest.config.ts`, and a minimal `server.ts` that boots Express with `/health` and `/ready` endpoints.
> 2. Wire up all middleware stubs: `correlation-id`, `auth` (Keycloak JWT — stub verification for now with a TODO), `validate` (Zod wrapper), `error-handler` (standard error envelope), `audit` (writes to `audit_log` table).
> 3. Add a Prisma client factory (singleton) under `apps/api/src/lib/prisma.ts`.
> 4. Bootstrap `libs/shared-types` with a minimal package exporting `UlidSchema`, `PaginationParams`, and `ErrorEnvelope`.
> 5. Add Jest + Supertest with one smoke test that hits `/health` and expects `{ data: { status: "ok" } }`.
> 6. Update `docs/api/endpoints.md` and `docs/CHANGELOG.md`. Flip the relevant rows in `docs/modules/_status.md` to 🟡 in progress.
>
> Do NOT start on Business Unit CRUD or Angular yet. Stop after step 6 and ask me to review.

**Expected outcome after session 1:**
- `pnpm --filter api dev` starts a server on `:3000`
- `curl http://localhost:3000/api/v1/health` returns `{ "data": { "status": "ok" } }`
- `pnpm --filter api test` passes
- The chassis is in place for all future modules

## Session 2 — Business Unit CRUD (FR-1.15)

> Read `docs/modules/01-organization-details.md`. Implement FR-1.15 (Business Unit master) end-to-end:
>
> 1. The Prisma model already exists — run `pnpm prisma migrate dev --name add_business_unit` if not migrated yet.
> 2. Add Zod schemas in `libs/shared-types/src/organization/business-unit.ts` for Create / Update / List.
> 3. Add `apps/api/src/modules/organization/business-unit.{routes,service,repository,schema}.ts` with REST endpoints from `docs/modules/01-organization-details.md`.
> 4. Enforce BU-scope: a user not in the BU cannot read or update it (unless Super Admin).
> 5. Emit audit events on every write.
> 6. Integration tests: happy path + validation error + auth denial.
> 7. Update `docs/api/endpoints.md` and `docs/CHANGELOG.md`.

## Session 3 — Angular app shell

> Read `apps/web/README.md` and `CLAUDE.md`. Bootstrap the Angular 17 app with Tailwind + PrimeNG, Keycloak OIDC auth via `angular-auth-oidc-client`, NgRx, and a route-shell with left nav. Add a placeholder Business Units page that lists BUs from the API. Include one unit test for the auth interceptor.

## After that

Proceed through `docs/modules/_status.md` top to bottom — R1 → R2 → R3 → R4 ... — one FR at a time. Each session should close one or two FRs, not ten.

## Rules for every Claude Code session

- **Always read `CLAUDE.md` first.** It contains the stack, conventions, and "do not" list.
- **Reference an FR ID** in every code change (`FR-2.5`, etc.). If there isn't one, stop and ask.
- **Tests are not optional.** Every service function needs unit tests; every route needs an integration test.
- **Update docs** — `CHANGELOG.md`, `endpoints.md`, `_status.md` — as part of the change, not after.
- **Stop at the review checkpoint** you set. Don't drift.

## What to do if Claude Code suggests something off-stack

Push back. The stack is **Angular + Node/Express + MySQL + Prisma + Tailwind + PrimeNG + Ionic (mobile)**. If a suggestion mentions React, Next.js, NestJS, PostgreSQL, or Mongo, something's gone wrong — remind it to re-read `CLAUDE.md`.

## Common commands

```bash
pnpm install                                    # install all workspaces
pnpm dev                                        # runs apps in parallel (after bootstrap)
pnpm --filter api dev                           # run just the API
pnpm --filter web dev                           # run just the web app
pnpm prisma migrate dev --name <description>    # create + apply migration
pnpm prisma studio                              # open DB browser at :5555
pnpm seed                                       # seed local dev data
pnpm test                                       # run all tests
pnpm --filter api test --watch                  # watch mode for API tests
pnpm ci                                         # full pipeline (lint + typecheck + test + build)
```

Good luck. The PRD and Solution Spec are the authority — lean on them.
