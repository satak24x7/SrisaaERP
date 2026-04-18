# Lessons

Running log of non-obvious things this codebase has taught us. Add to it whenever a session burns time on something a future session should be able to skip.

Format per entry: short rule, then **Why** (the incident) and **How to apply** (the fix or the check).

---

## 2026-04-16 — R1 Bootstrap (Session 1)

### Verify with the actual toolchain — don't hand off `pnpm install` / tests to the user
**Why:** First pass of Session 1 declared the work done while listing `pnpm install`, `prisma generate`, `pnpm test` as prerequisites for the user. The user pushed back. Running them surfaced five real bugs (workspace file missing, 32-bit Node + Prisma, ts-node-less jest config, pino type drift, Express augmentation not merging) that all needed code fixes.
**How to apply:** After any non-trivial change in this repo, run the relevant `pnpm --filter <pkg> typecheck` and `pnpm --filter <pkg> test` before declaring the task done. If a prerequisite tool isn't on PATH, install it (one ask) — don't punt the entire verification.

### `pnpm` requires `pnpm-workspace.yaml`; the root `package.json#workspaces` field is ignored
**Why:** Root `package.json` declares `"workspaces": ["apps/*", "libs/*"]`. pnpm warns and silently treats the repo as a single package, so `pnpm --filter @govprojects/api ...` would resolve nothing.
**How to apply:** `pnpm-workspace.yaml` at the repo root is the source of truth. Update it (not `package.json`) when adding new workspace globs.

### Local Node is 32-bit — Prisma needs `engineType = "binary"`
**Why:** `node.exe` is at `C:\Program Files (x86)\nodejs\` (win-x86). Prisma's default `library` (Node-API) engine errors out on 32-bit Node during `@prisma/client` postinstall and `prisma generate`.
**How to apply:** Keep `engineType = "binary"` in the `generator client {}` block of `prisma/schema.prisma`. Don't "clean it up" thinking it's vestigial.

### `prisma generate` from repo root tries to install `@prisma/client` at root
**Why:** Schema lives at `prisma/schema.prisma` (root) but `@prisma/client` is a dep of `apps/api`. Root `prisma generate` runs `pnpm add @prisma/client` against root and fails.
**How to apply:** For real DB work, `cd apps/api && pnpm exec prisma generate --schema=../../prisma/schema.prisma`. For tests that just need the API to load, `jest.mock('../src/lib/prisma.js', ...)` so the generated client isn't required.

### Express `Request` augmentation: use `declare global { namespace Express }`, not `declare module 'express-serve-static-core'`
**Why:** Three middleware files used the `express-serve-static-core` pattern. Under pnpm hoisting, TypeScript reported `TS2664: module 'express-serve-static-core' cannot be found` and the augmentations didn't merge.
**How to apply:** Put augmentations in a single ambient file (`apps/api/src/types/express.d.ts`) using the global Express namespace, and end the file with `export {};` to keep it a module. Inline `declare module` blocks in middleware fragment the augmentation surface — avoid them.

### pnpm hoisting makes inferred return types from external libs "non-portable"
**Why:** `export const healthRouter = Router();` failed `TS2742` — TypeScript wanted to name `@types/express-serve-static-core` via a `.pnpm/...` path that's not portable.
**How to apply:** Annotate exported values whose type comes from a transitively-resolved `@types` package: `export const healthRouter: ExpressRouter = Router();`.

### `pino@9.x` and `pino-http`'s bundled pino types disagree under `exactOptionalPropertyTypes: true`
**Why:** Strict tsconfig + pino 9.14 vs pino-http expecting an older Logger shape produced `TS2769` on `pinoHttp({ logger, ... })`.
**How to apply:** Build a typed options object and cast: `pinoHttp(opts as unknown as PinoHttpOptions)`. Don't relax `exactOptionalPropertyTypes` — every other module benefits from it.

### `jest.config.ts` requires `ts-node`; prefer `jest.config.js`
**Why:** Jest read the TS config and asked for `ts-node`, which isn't a project dep and shouldn't be one (we use `ts-jest` and `tsx`). Adding it just to parse the config is wasted weight.
**How to apply:** Keep Jest configs as `.js` (`module.exports = { ... }`). Reserve `ts-jest` for transforming the actual test files.

### Test bootstrap must set required env vars before importing the API
**Why:** `apps/api/src/config/env.ts` validates env at import time and `process.exit(1)`s on failure — Jest would die with no useful message.
**How to apply:** `apps/api/test/setup.ts` runs via Jest `setupFiles` and seeds `API_PUBLIC_URL`, `DATABASE_URL`, `REDIS_URL`, `JWT_ISSUER`, `JWT_AUDIENCE`. New env keys added to `env.ts` must also be seeded here, or every test suite crashes.

### Don't mount routes whose handler files don't exist yet
**Why:** Initial `app.ts` imported `businessUnitRouter` from a file that wasn't going to land until Session 2. The whole API failed to compile and tests couldn't even start.
**How to apply:** Wire a router only when the handler file is part of the same change. Use a `// Module routers wire up here as features land.` placeholder comment instead.

### Docs for endpoints can drift ahead of code — treat `endpoints.md` as a planning doc, not proof of shipping
**Why:** `docs/api/endpoints.md` listed `/health` and `/ready` under "System" with no "planned" marker, but `/ready` was actually nested under `/api/v1/health/ready` and other modules were stubs.
**How to apply:** Use the existing `(planned)` marker on every section that hasn't actually shipped, and only flip the marker after the corresponding routes are wired in `app.ts` and the smoke/integration test passes.

### No git repository here — husky `prepare` fails harmlessly
**Why:** `pnpm install` ran `husky` which exited with `.git can't be found`. The install otherwise succeeded.
**How to apply:** Ignore the husky error during `pnpm install`. Don't try to invoke `git`, don't add `git init` to project setup steps without asking, and don't trust hooks (lint-staged etc.) to fire — run lint/format manually.

### No Visual Studio C++ toolchain — native module installs report errors but pure-JS fallbacks work
**Why:** `msgpackr-extract` (transitive of pino/others) ran `node-gyp` and failed with `gyp ERR! find VS`. The package falls back to JS at runtime.
**How to apply:** Don't try to install VS Build Tools. Confirm install completed (look for the final `Done in ...` line) and ignore native build errors unless a runtime failure ties back to one.

---

## 2026-04-17 — R1 Session 3 (Keycloak Auth + Integration Tests)

### Keycloak admin console login requires the master realm URL
**Why:** Navigating to `http://localhost:8080` may redirect to the `govprojects` realm login page. The `admin/admin` credentials only work on the master realm.
**How to apply:** Always use `http://localhost:8080/admin/master/console/` for the admin console. If login fails, clear cookies or use incognito — Keycloak caches stale sessions.

### Keycloak audience mapper is required for API JWT verification
**Why:** By default, Keycloak tokens from the `govprojects-web` client don't include `govprojects-api` in the `aud` claim. Without it, `jose.jwtVerify(..., { audience: 'govprojects-api' })` rejects every token.
**How to apply:** The bootstrap script adds an `oidc-audience-mapper` protocol mapper to both the API and Web clients. If the realm is recreated, re-run `pnpm tsx scripts/keycloak-bootstrap.ts`.

### Prisma `create()` uses checked types by default — FK fields require the relation object
**Why:** `db.businessUnit.create({ data: { buHeadUserId: null } })` fails because Prisma's checked create type expects `buHead: { connect: { id } }` instead of the raw FK column. The `buHeadUserId` field is non-nullable in the schema, making it worse.
**How to apply:** For seed helpers and tests, always provide a valid FK value (auto-seed a parent row if needed). The existing BU service uses `Prisma.BusinessUnitUncheckedUpdateInput` for updates — use the `Unchecked*` types when setting FK columns directly.

### ULID validation uses Crockford base32 — test strings must match `[0-9A-HJKMNP-TV-Z]{26}`
**Why:** Integration tests used `01NONEXISTENT...` as a fake ULID. The lowercase letters and excluded chars (`I`, `L`, `O`, `U`) failed Zod validation with 400 instead of reaching the service layer for the expected 422.
**How to apply:** Use `01ZZZZZZZZZZZZZZZZZZZZZZZA` or similar valid-charset strings for "does not exist" test cases. The regex is in `libs/shared-types/src/common/id.ts`.

### Separate Jest configs for unit vs integration tests
**Why:** With both `*.test.ts` and `*.integration.test.ts` in the same `test/` directory, the default `pnpm test` picked up integration tests. Those hit real MySQL and timed out under the 5s default timeout.
**How to apply:** `jest.config.js` has `testPathIgnorePatterns: ['\\.integration\\.test\\.ts$']`. The integration config is `jest.integration.config.js` with 30s timeout and its own setup/globalSetup files. Run `pnpm test` for fast unit tests, `pnpm test:integration` for DB-hitting tests.

### `prisma db push` is better than `prisma migrate dev` for test databases
**Why:** `migrate dev` requires shadow database permissions and generates migration files. For a throwaway test DB that gets truncated between tests, `db push --accept-data-loss --skip-generate` is faster and doesn't pollute the migrations directory.
**How to apply:** `global-setup.integration.ts` uses `prisma db push` against `govprojects_test`. Don't use `migrate dev` for the test DB.

### Prisma CLI engine type env var is `PRISMA_CLI_QUERY_ENGINE_TYPE`, not `PRISMA_QUERY_ENGINE_TYPE`
**Why:** First attempt at `prisma db push` failed with the 32-bit Node error despite setting `PRISMA_QUERY_ENGINE_TYPE=binary`. The CLI uses a differently-named env var than the client.
**How to apply:** Set both `PRISMA_CLI_QUERY_ENGINE_TYPE=binary` and `PRISMA_CLIENT_ENGINE_TYPE=binary` when running Prisma CLI commands on the 32-bit Node machine.

### Host MySQL on 3306 conflicts with Docker MySQL — use docker-compose.override.yml
**Why:** The dev machine runs a native MySQL84 service on port 3306. Docker Compose tries to bind the same port.
**How to apply:** `docker-compose.override.yml` (gitignored) remaps to port 3307. All `DATABASE_URL` values use `:3307`. If the override file is lost, recreate it or stop the native MySQL service.

### `python` is not on PATH on this Windows machine — use `node -e` for JSON parsing in shell scripts
**Why:** Token extraction from Keycloak used `python -m json.tool` which failed with "Python was not found".
**How to apply:** Use `node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>process.stdout.write(JSON.parse(d).access_token))"` or similar node one-liners for JSON processing in shell commands.

### Integration tests must run serially (`--runInBand`) when sharing a single database
**Why:** With 5 integration test suites (health, BU, company, role, user), Jest runs them in parallel by default. Each suite's `beforeEach` calls `truncateAll()`, which wipes tables another suite is actively using — FK constraint violations and null-row reads everywhere.
**How to apply:** The `test:integration` script uses `--runInBand`. Don't remove it. If integration tests start failing with FK violations or null reads on rows you just seeded, suspect parallel execution first.

---

## 2026-04-17 — R1 Session 4 (Company Profile, User-Roles, BU Head)

### Angular routes can point to PlaceholderComponent even when real components exist
**Why:** `admin.routes.ts` was still using `component: PlaceholderComponent` for Company Profile, Users, and Roles even though their real component files existed. The pages showed "Coming Soon" instead of the actual UI.
**How to apply:** When adding a new feature component, always verify the route file points to it via `loadComponent: () => import(...)`. Search for `PlaceholderComponent` in route files to find any that need updating.

### File download from API requires blob fetch — `window.open(url)` skips auth headers
**Why:** View Document opened the download URL in a new browser tab. That tab has no `Authorization` header, so the API returned 401.
**How to apply:** For authenticated file downloads, use `HttpClient.get(url, { responseType: 'blob' })` which includes the auth token via the interceptor, then `URL.createObjectURL(blob)` to open in a new tab. Never `window.open()` directly to an authenticated API endpoint.

### Prisma client must be regenerated after schema changes — kill the dev server first
**Why:** `prisma generate` failed with EPERM because the running `tsx watch` dev server locked `query-engine-windows.exe`. The migration applied fine but the Prisma client didn't update, causing 500 errors on new fields.
**How to apply:** Before running `prisma migrate dev` or `prisma generate`, kill the API dev server (`taskkill` the process on port 3000). The old client won't have the new fields even though the DB does.

### `@angular/cdk/drag-drop` with CSS Grid needs `cdkDropListOrientation="mixed"`
**Why:** CDK drag-drop defaults to vertical list orientation. With a CSS grid layout (cards in rows), dragging only worked vertically without `orientation="mixed"`.
**How to apply:** For grid-based drag-and-drop layouts, add `cdkDropListOrientation="mixed"` to the drop list container.

### User-Role sync pattern: delete-all + recreate is simpler than diffing
**Why:** Syncing a many-to-many relationship (user_role) on update required comparing existing vs. new role IDs to decide what to add/remove. A delete-all + bulk-create approach is simpler, correct, and fast enough for small sets.
**How to apply:** `await prisma.userRole.deleteMany({ where: { userId } })` then `createMany` with the new list. Use this pattern for any small many-to-many sync (permissions, tags, etc.). Don't use it for large datasets or where the join table has its own data (timestamps, ordering).

### BU Head dropdown: filter by role name, not role ID
**Why:** The BU form dialog needs to show only users who have the `bu_head` role. Filtering by role ID would break if the role is recreated. Filtering by `role.name === 'bu_head'` is stable.
**How to apply:** Fetch users with their roles included, then filter client-side: `users.filter(u => u.roles.some(r => r.name === 'bu_head'))`. The role name `bu_head` is a well-known constant in the platform.

---

## 2026-04-18 — R2 Sales Core

### Replace hardcoded enums with lookup lists for user-configurable dropdowns
**Why:** AccountType, OpportunityStage, EntryPath were hardcoded Prisma enums. Adding "Master SI" to Account Type required a schema migration. Lookup lists make these configurable at runtime.
**How to apply:** Create a `LookupList` + `LookupItem` table. Change Prisma enum fields to `String @db.VarChar(64)`. Fetch dropdown options via `GET /lookup-lists/by-code/:code/items`. Create lists: `account_type`, `opportunity_stage`, `entry_path`. Any new configurable dropdown should use this pattern.

### Prisma `db push` with enum changes can silently fail — use `--force-reset` if columns are missing
**Why:** Changing a Prisma enum to a String and adding new columns in the same push sometimes left columns missing (the `code` column on Government/Account). The API threw "column does not exist" at runtime even though `db push` reported success.
**How to apply:** After any enum removal or type change, verify the column exists (`DESCRIBE table` via docker exec). If missing, use `prisma db push --force-reset` (drops and recreates all tables — only safe in dev).

### Audit middleware must truncate actorUserId to fit VARCHAR(26)
**Why:** Keycloak `sub` is a UUID (36 chars) but `audit_log.actor_user_id` is `VARCHAR(26)`. The audit write failed silently, and the Angular component showed "Error" because the create succeeded but the response path triggered the error handler.
**How to apply:** In `recordAudit()`, truncate: `const actorUserId = rawId.length <= 26 ? rawId : rawId.slice(0, 26)`. Same pattern in any route that writes to a `VARCHAR(26)` column with a user ID.

### Use detail pages for complex entities — don't overload list pages
**Why:** Opportunity grew too complex for a list+dialog pattern (stage, entry path, multiple contacts, multiple influencers, owner, account, end client, contract value, probability). A dedicated detail page with two-column layout is more maintainable and user-friendly.
**How to apply:** For entities with >6 fields or multiple many-to-many relationships, create a `/:id` detail route with its own component. Keep the list page for quick-create (minimal fields) and navigation.

### Many-to-many contacts/influencers: use join table + sync pattern
**Why:** Opportunity needs multiple contacts and multiple influencers. A single FK doesn't work. The join table + delete-all-and-recreate pattern (same as user-role sync) is simple and correct for small sets.
**How to apply:** `OpportunityContact` and `OpportunityInfluencer` join tables. API accepts `contactIds[]` on create/update, calls `syncContacts()` which deletes existing + creates new. Influencers use explicit link/unlink endpoints for finer control.

### Account and Contact are NOT BU-scoped — they're shared organization-wide
**Why:** A government department (Account) can be pursued by multiple BUs, and a Contact (officer) can work with multiple departments. BU-scoping them would force duplication.
**How to apply:** `businessUnitId` is NOT on Account or Contact. It IS mandatory on Lead, Opportunity, Project, ExpenseSheet, MaterialRequest. Accounts have an optional `governmentId` instead.

### PrimeNG dropdowns in dialogs get clipped — always use `appendTo="body"`
**Why:** `p-select` and `p-multiSelect` inside `p-dialog` render their dropdown panel within the dialog DOM. The dialog's overflow boundary clips the panel, making lower options impossible to select — especially for dropdowns near the bottom of the form.
**How to apply:** Add `appendTo="body"` to every `<p-select>` and `<p-multiSelect>` that's inside a `<p-dialog>`. This was applied globally across all forms on 2026-04-18. Make it a habit for any new dialog form.

---

## 2026-04-18 — R2 Completion (Session 3)

### Date-only strings + `new Date()` = timezone shift — always append `T00:00:00`
**Why:** `new Date("2026-04-20")` parses as UTC midnight. In IST (UTC+5:30), that's `2026-04-19T18:30:00` — the previous day. On save, `toISOString().slice(0, 10)` outputs the UTC date, losing a day each save cycle. Travel Plan dates shifted backward on every save.
**How to apply:** When loading date-only strings from the API into Date objects, always append `T00:00:00`: `new Date(dateStr + 'T00:00:00')`. When sending dates back, use local extraction (`getFullYear/getMonth/getDate`) not `toISOString()`.

### FullCalendar `end` for all-day events is exclusive — add +1 day
**Why:** FullCalendar treats `end` as exclusive for all-day events. An event from Apr 20 to Apr 22 only renders on Apr 20–21. Travel plans spanning 3 days showed only 2 on the calendar.
**How to apply:** When producing FullCalendar events from date ranges, add one day to the `end` date: `endDate + 1 day`. This only affects the FullCalendar feed, not the stored data.

### FullCalendar Angular: use `datesSet` + `calendarApi.addEvent()` for dynamic events
**Why:** Setting `events` as a static array in `CalendarOptions` or using `[events]` input binding didn't reliably trigger re-renders in FullCalendar's Angular wrapper. The events array was being set but the calendar didn't update.
**How to apply:** Use `datesSet` callback to detect date navigation, fetch events via HTTP, then call `calendarComponent.getApi().removeAllEvents()` + `addEvent()` for each event. Use `@ViewChild` with `AfterViewInit` guard since `datesSet` fires before the view child is ready.

### Zod `.optional()` rejects `null` — use `.nullable().optional()` for fields that may be null from frontend
**Why:** Angular reactive forms send `null` for unset fields, but Zod's `.optional()` only accepts `undefined`. Activity creation failed with "Request validation failed" because the frontend sent `null` for unused date/status fields.
**How to apply:** For any Zod field that may receive `null` from the frontend (especially fields conditionally shown based on type toggles like EVENT vs TASK), use `.nullable().optional()` instead of just `.optional()`.

### Polymorphic associations + entity name resolution pattern
**Why:** Activities and Travel Plans can link to any entity type (Opportunity, Lead, Account, Contact, Influencer, Project). Displaying just entity IDs is useless — users need names. Resolving names one-by-one is N+1.
**How to apply:** `resolveEntityNames()` function collects all entity IDs by type, batch-fetches names from each table in parallel (`Promise.all`), returns a `Map<"TYPE:id", name>`. Pass the map to the DTO builder. This pattern is used in both activity and travel routes.

### Encrypt sensitive data at rest with AES-256-GCM
**Why:** Password Manager stores credentials. Plaintext in the DB is unacceptable. AES-256-GCM provides authenticated encryption (confidentiality + integrity).
**How to apply:** `apps/api/src/lib/crypto.ts` — `encrypt(plaintext)` returns `{encrypted, iv, tag}`. Store all three in the DB. `decrypt(encrypted, iv, tag)` reverses it. Key from `ENCRYPTION_KEY` env var. Each encrypted value has its own random IV.

### Travel Plan 3-role workflow: status transitions as a declarative map
**Why:** Travel Plans have 8 statuses and multiple valid transitions (Requester submits, Approver approves/rejects, Admin manages booking). Separate endpoint per transition becomes unwieldy.
**How to apply:** Define `VALID_TRANSITIONS` map (`status → [{to, action}]`). Single `POST /:id/:action` endpoint validates the transition against the map. Frontend sends the action name, API checks if it's valid for the current status. Cleaner than N separate endpoints.
