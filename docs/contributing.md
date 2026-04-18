# Contributing

Short, practical rules for contributing to GovProjects Platform — whether you're a human developer or Claude Code.

## Before you start

1. **Read `CLAUDE.md`** — it is the source of truth on stack, conventions, and workflow.
2. **Find the FR you're building.** Every task should map to a functional requirement in `docs/modules/*.md`. If it doesn't, pause and confirm scope with the product owner.
3. **Check `docs/modules/_status.md`** to see what's in progress. Don't step on someone else's work.

## Branch & commit

- Branch from `main`: `feat/<module>-<short-desc>`, `fix/<short-desc>`, `chore/<short-desc>`.
- **Conventional Commits** only:
  - `feat(sales): add managed-tender stakeholder CRM`
  - `fix(expense): return-for-clarification should unlock edit`
  - `refactor(api): extract audit middleware`
  - `test(procurement): add MR approval budget-check tests`
  - `docs: update FR references after FR-4.5 split`
  - `chore(deps): bump prisma to 5.14`
- Keep commits atomic — one logical change per commit.

## The work loop

For every feature:

1. **Plan** in the PR description: what changes, which FR, which user story, which files.
2. **Schema first.** If DB changes are needed:
   ```
   # edit prisma/schema.prisma
   pnpm prisma migrate dev --name <short_description>
   pnpm prisma generate
   ```
3. **Shared types next.** Define Zod schemas in `libs/shared-types` so API and UI agree on shape.
4. **API layer.** Route → service → repository. Zod on input; never return raw DB rows — always map through a DTO.
5. **Tests alongside.** Unit tests for services, integration for routes, e2e for critical flows.
6. **Front-end last.** Regenerate the typed API client (`pnpm --filter api-client build`). Build the screen. Wire it up.

## Definition of Done

Don't merge unless:

- [ ] PR references an FR (e.g., `Closes FR-4.7`)
- [ ] New tables have `business_unit_id`, audit columns, soft-delete column
- [ ] New routes have Zod validation, auth middleware, audit emission
- [ ] New env vars added to `.env.example` with a sensible default
- [ ] New endpoints documented in `docs/api/endpoints.md`
- [ ] Unit + integration tests pass locally
- [ ] `pnpm ci` (lint + typecheck + test + build) is green
- [ ] No `any`, no unchecked non-null, no disabled ESLint rules
- [ ] Secrets are in Vault / env, never in code
- [ ] A one-line entry in `docs/CHANGELOG.md`

## Code review checklist

- Is this in the right module? (No cross-module repository access)
- Are business rules enforced in the service layer, not the controller?
- Does it handle the **BU scope** correctly? A user from BU-A must not be able to read BU-B's data.
- Does it handle soft-delete correctly (filter `deleted_at IS NULL`)?
- Are errors returned in the standard envelope with a stable code?
- Does it emit an audit event?
- Are files uploaded via the attachment pattern (S3 key + metadata row), not stored in the DB?
- Is money stored and moved as paise integers?

## Writing tests

- **Unit tests** — pure functions, service layer. Fast (<100ms each).
- **Integration tests** — API route with a test DB and stubbed external calls. One happy path + one validation error + one auth denial minimum.
- **E2E tests** — Playwright. Reserve for flows the business cannot ship without (bid submission, MR → issue, expense approval).

Test data uses the seed script as a base and then augments inside the test. Never mutate shared seed fixtures.

## Do not

- Commit to `main` directly
- Add a new top-level dependency without discussion
- Introduce a new language or framework (stack is fixed in `CLAUDE.md`)
- Use localStorage or sessionStorage in the Angular app
- Store money as float
- Log PII (PAN, bank numbers, Aadhaar)
- Return stack traces in production error responses

## Asking questions

If the FR is ambiguous or contradicts another doc, **ask** — do not guess. Open an issue tagged `needs-clarification` and stop work until it's answered.
