# New Project Blueprint — Srisaa Architecture

> Use this document as the instruction set for Claude Code when starting a new project based on the SrisaaERP architecture. Copy the relevant sections into the new project's CLAUDE.md.

---

## 1. Technology Stack

| Layer | Choice | Notes |
|---|---|---|
| **Frontend** | Angular 19+ (standalone components, no NgModules) | TypeScript strict, Signals for local state |
| **UI Framework** | PrimeNG (primary) + Tailwind CSS (utility classes) | PrimeNG for tables, dialogs, selects, tags, datepickers. Tailwind for layout, spacing, colors |
| **Theme** | PrimeNG Lara preset, dark slate sidebar | `providePrimeNG({ theme: { preset: Lara } })` |
| **State** | Angular Signals (local), NgRx only if cross-module state needed | Prefer `signal()`, `computed()` over BehaviorSubject |
| **Backend** | Node.js 20 LTS + Express 4.x + TypeScript strict | Lean — no NestJS |
| **ORM** | Prisma (schema-first, MySQL) | `engineType = "binary"` for 32-bit Node compat |
| **Database** | MySQL 8.0 | InnoDB, utf8mb4, ULIDs for IDs |
| **Validation** | Zod (all inputs — body, query, params) | Inferred types flow to handlers |
| **Auth** | Keycloak (OIDC) via `angular-auth-oidc-client` | JWT verification with `jose` on backend |
| **Real-time** | WebSocket (`ws` package) on `/ws` path | JWT auth via query param, per-user socket map |
| **AI** | Google Gemini API (configurable model via DB) | Retry on 503, model fallback chain |
| **File Storage** | Google Drive (OAuth) or local, abstracted via `dms-storage.ts` | Auto-creates folders per entity |
| **Package Manager** | pnpm workspaces + Turborepo | Monorepo: `apps/web`, `apps/api`, `libs/shared-types` |

---

## 2. Monorepo Layout

```
project-root/
├── apps/
│   ├── web/                  # Angular 19 app
│   │   ├── src/
│   │   │   ├── main.ts       # Bootstrap (intercept OAuth callbacks before OIDC)
│   │   │   ├── app/
│   │   │   │   ├── app.config.ts        # providers: router, http, oidc, primeng
│   │   │   │   ├── app.routes.ts        # top-level routes (shell + callback)
│   │   │   │   ├── app.component.ts     # just <router-outlet />
│   │   │   │   ├── shared/
│   │   │   │   │   └── layout/
│   │   │   │   │       └── shell.component.ts  # sidebar + main content
│   │   │   │   ├── core/
│   │   │   │   │   ├── auth/            # auth.guard.ts, callback.component.ts
│   │   │   │   │   ├── interceptors/    # auth.interceptor.ts
│   │   │   │   │   └── services/        # websocket.service.ts
│   │   │   │   └── features/            # lazy-loaded feature modules
│   │   │   │       ├── admin/
│   │   │   │       ├── sales/
│   │   │   │       └── ...
│   │   │   └── environments/
│   │   ├── public/                      # static assets (logo.png)
│   │   └── angular.json
│   └── api/                  # Express + TypeScript API
│       ├── src/
│       │   ├── server.ts                # bootstrap, listen, init websocket
│       │   ├── app.ts                   # createApp(), register routes + middleware
│       │   ├── config/env.ts            # Zod-validated env vars
│       │   ├── lib/
│       │   │   ├── prisma.ts            # singleton + newId() ULID generator
│       │   │   ├── redis.ts             # ioredis singleton
│       │   │   ├── logger.ts            # Pino structured JSON logger
│       │   │   ├── crypto.ts            # AES-256-GCM encrypt/decrypt
│       │   │   ├── websocket.ts         # WS server, pushToUser(), pushUnreadCount()
│       │   │   └── dms-storage.ts       # file storage abstraction (local/GDrive)
│       │   ├── middleware/
│       │   │   ├── auth.ts              # JWT verify via jose JWKS
│       │   │   ├── audit.ts             # recordAudit() to audit_log table
│       │   │   ├── validate.ts          # Zod validation wrapper + asyncHandler
│       │   │   ├── error-handler.ts     # AppError class + standard envelope
│       │   │   └── correlation-id.ts    # X-Correlation-ID header
│       │   └── modules/
│       │       ├── <feature>/
│       │       │   ├── routes.ts
│       │       │   ├── service.ts       # (optional, for complex logic)
│       │       │   └── document.routes.ts  # (if entity has file uploads)
│       │       └── notification/
│       │           ├── routes.ts
│       │           ├── service.ts       # notify() + WS push
│       │           └── reminder-worker.ts
│       └── test/
├── libs/
│   └── shared-types/         # Zod schemas + inferred TS types
├── prisma/
│   └── schema.prisma
├── docker-compose.yml        # MySQL, Redis, Keycloak, etc.
├── pnpm-workspace.yaml
└── CLAUDE.md
```

---

## 3. Shell Component (Sidebar Layout)

The app shell is a **collapsible sidebar** with the following structure:

### Template Structure
```
<div class="flex h-screen">
  <!-- Sidebar: w-64 (expanded) / w-16 (collapsed) -->
  <aside class="bg-slate-800 text-white flex flex-col transition-all duration-300">
    <!-- Brand: logo + app name (hidden when collapsed) -->
    <!-- Nav: groups (accordion, one open at a time) + simple links -->
    <!-- Flyout popup for collapsed groups (fixed position, right of sidebar) -->
    <!-- Bottom section: notifications bell, user info, collapse toggle -->
  </aside>

  <!-- Main content area -->
  <div class="flex-1 flex flex-col overflow-hidden">
    <main class="flex-1 overflow-auto p-6 bg-gray-50">
      <router-outlet />
    </main>
  </div>
</div>
```

### Sidebar Behavior
- **Expanded mode**: Full nav with labels, chevron arrows on groups, accordion (one group open at a time)
- **Collapsed mode**: Icon-only (16px width), PrimeNG tooltips on hover. Clicking a group icon shows a **flyout popup** positioned to the right with child items. Flyout closes on item click or outside click.
- **State persisted** in `localStorage` (`sidebar_collapsed`)
- **No top bar** — user info, notifications, logout are all in the sidebar bottom section

### Bottom Section (inside sidebar)
1. **Notification bell** — shows unread count badge, opens panel to the right
2. **User row** — avatar circle with initials + name (expanded) / logout icon (collapsed)
3. **Collapse toggle** — chevron left/right + version number

### Nav Item Types
```typescript
interface NavGroup {
  label: string; icon: string; // PrimeIcons class
  children: NavChild[];
  expanded?: boolean;
}
interface NavLink {
  label: string; icon: string; route: string;
}
```

### Colors & Aesthetics
- Sidebar: `bg-slate-800`, text `text-white`, hover `bg-slate-700`
- Active route: `bg-slate-700 text-white` via `routerLinkActive`
- Main content: `bg-gray-50`
- Cards/panels: `bg-white rounded-lg shadow-sm border border-gray-200 p-6`
- Page headers: `text-2xl font-semibold text-gray-800` with icon
- Subheaders: `text-lg font-semibold text-gray-700`
- Buttons: PrimeNG `p-button` with appropriate severity
- Tables: PrimeNG `p-table` with `styleClass="p-datatable-sm"`
- Tags/badges: PrimeNG `p-tag` with severity coloring
- Forms: PrimeNG components (`p-select`, `p-datepicker`, `p-inputNumber`, `p-multiSelect`), always with `appendTo="body"` inside dialogs

---

## 4. Authentication Pattern

### Keycloak OIDC Setup
```typescript
// app.config.ts
provideAuth({
  config: {
    authority: 'http://localhost:8080/realms/{realm}',
    redirectUrl: 'http://localhost:4200/callback',
    postLogoutRedirectUri: 'http://localhost:4200',
    clientId: '{client-id}',
    scope: 'openid profile email',
    responseType: 'code',
    silentRenew: true,
    useRefreshToken: true,
    renewTimeBeforeTokenExpiresInSeconds: 120,
    autoUserInfo: true,
  },
})
```

### Auth Guard
```typescript
export const authGuard: CanActivateFn = () => {
  const oidc = inject(OidcSecurityService);
  return oidc.checkAuth().pipe(
    take(1),
    map(({ isAuthenticated }) => {
      if (isAuthenticated) return true;
      oidc.authorize();
      return false;
    })
  );
};
```

### Auth Interceptor
- Adds `Bearer` token to all `/api/` requests
- On 401: triggers `oidc.authorize()` re-auth
- On missing token: redirects to login

### Callback Component
- Route: `/callback` (outside auth guard)
- Calls `oidc.checkAuth()`, navigates to `/` on success, calls `oidc.authorize()` on failure

### Backend JWT Verification
- Uses `jose` library: `createRemoteJWKSet` + `jwtVerify`
- Validates issuer, audience, expiry
- Auto-provisions DB user from Keycloak `sub` via `externalId` field

---

## 5. API Conventions

### Route Structure
```
/api/v1/{resource}          GET (list), POST (create)
/api/v1/{resource}/:id      GET (single), PATCH (update), DELETE (soft delete)
/api/v1/{resource}/:id/{sub-resource}  Nested CRUD
```

### Response Envelope
```json
// Success (collection)
{ "data": [...], "meta": { "next_cursor": "...", "limit": 50 } }

// Success (single)
{ "data": { ... } }

// Error
{ "error": { "code": "NOT_FOUND", "message": "...", "details": [...] } }
```

### Error Handling
```typescript
// AppError class with status, code, message
export const errors = {
  notFound: (msg) => new AppError(404, 'NOT_FOUND', msg),
  unauthorized: (msg) => new AppError(401, 'UNAUTHORIZED', msg),
  businessRule: (code, msg) => new AppError(422, code, msg),
  validation: (msg, details) => new AppError(400, 'VALIDATION_FAILED', msg, details),
};
```

### Middleware Stack (in order)
1. `correlation-id` — generates/echoes `X-Correlation-ID`
2. `helmet` — security headers
3. `cors` — CORS config
4. `compression` — gzip
5. `rate-limit` — 600 req/min
6. `pino-http` — structured request logging
7. `auth` — JWT verification (per-route via `requireAuth`)
8. `validate` — Zod schema validation wrapper
9. `error-handler` — catches all errors, returns standard envelope

### Validation Pattern
```typescript
const CreateInput = z.object({
  name: z.string().min(1).max(255),
  // ...
});

router.post('/', validate({ body: CreateInput }), asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof CreateInput>;
  // ...
}));
```

---

## 6. Database Conventions

### Prisma Schema Patterns
```prisma
model Entity {
  id          String    @id @db.VarChar(26)     // ULID
  name        String    @db.VarChar(255)

  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")
  deletedAt   DateTime? @map("deleted_at")       // soft delete
  createdBy   String    @map("created_by") @db.VarChar(26)
  updatedBy   String    @map("updated_by") @db.VarChar(26)

  @@map("entity")  // snake_case table name
}
```

- All IDs: ULID (`VARCHAR(26)`), generated in app code via `newId()`
- All tables: `created_at`, `updated_at`, `deleted_at` (soft delete)
- Column names: `snake_case` via `@map()`
- Model names: `PascalCase`
- Money: integers in paise (smallest unit), `BigInt` for large values
- Dates: `DateTime` for timestamps, `@db.Date` for date-only fields

### Common Patterns
- **Lookup Lists**: Generic configurable dropdowns via `LookupList` + `LookupItem` tables
- **Polymorphic associations**: `entityType` + `entityId` string fields (not FK)
- **Join tables**: Explicit models with ULID IDs (e.g., `OpportunityContact`)
- **Audit log**: `audit_log` table with action, resource_type, resource_id, before/after JSON

---

## 7. Frontend Page Patterns

### List Page
```
<div class="flex items-center justify-between mb-6">
  <div>
    <h2 class="text-2xl font-semibold text-gray-800">Page Title</h2>
    <p class="text-sm text-gray-500 mt-1">Description</p>
  </div>
  <p-button label="Add New" icon="pi pi-plus" (onClick)="openDialog()" />
</div>

<div class="bg-white rounded-lg shadow-sm border border-gray-200">
  <p-table [value]="items()" styleClass="p-datatable-sm" ...>
    ...
  </p-table>
</div>
```

### Detail Page
```
<div class="flex items-center justify-between mb-6">
  <div class="flex items-center gap-3">
    <p-button icon="pi pi-arrow-left" [rounded]="true" [text]="true" (onClick)="goBack()" />
    <h2 class="text-2xl font-semibold text-gray-800">{{ item().title }}</h2>
    <p-tag [value]="item().status" [severity]="..." />
  </div>
  <p-button label="Edit" icon="pi pi-pencil" (onClick)="openEditDialog()" />
</div>

<!-- Content sections as white cards -->
<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
  <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
    <h3 class="text-lg font-semibold text-gray-700 mb-4 flex items-center gap-2">
      <i class="pi pi-info-circle text-blue-600"></i> Section Title
    </h3>
    <!-- content -->
  </div>
</div>
```

### Form Dialog
```
<p-dialog [header]="editId ? 'Edit' : 'Add'" [(visible)]="dialogVisible"
          [modal]="true" [style]="{width:'600px'}">
  <form [formGroup]="form" class="flex flex-col gap-4 pt-2">
    <!-- Always appendTo="body" on p-select/p-multiSelect inside p-dialog -->
    <p-select appendTo="body" ... />
  </form>
  <ng-template pTemplate="footer">
    <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="dialogVisible=false" />
    <p-button [label]="editId ? 'Update' : 'Create'" icon="pi pi-check"
              [disabled]="form.invalid" (onClick)="save()" />
  </ng-template>
</p-dialog>
```

### Component Structure
```typescript
@Component({
  selector: 'app-feature',
  standalone: true,
  imports: [CommonModule, ...PrimeNGModules],
  providers: [MessageService, ConfirmationService],
  template: `...`,
})
export class FeatureComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly msg = inject(MessageService);

  items = signal<Item[]>([]);
  loading = signal(true);

  ngOnInit(): void { this.loadItems(); }

  private loadItems(): void {
    this.http.get<{ data: Item[] }>(`${environment.apiBaseUrl}/items`).subscribe({
      next: (r) => { this.items.set(r.data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }
}
```

---

## 8. Document Upload Pattern

### Schema
```prisma
model EntityDocument {
  id          String  @id @db.VarChar(26)
  entityId    String  @map("entity_id") @db.VarChar(26)
  name        String  @db.VarChar(255)
  fileName    String  @map("file_name") @db.VarChar(255)
  mimeType    String  @map("mime_type") @db.VarChar(128)
  fileSize    Int     @map("file_size")
  storagePath String  @map("storage_path") @db.VarChar(512)
  sortOrder   Int     @default(0) @map("sort_order")
  // + standard timestamps
}
```

### API Route
- `POST /entities/:id/documents` — multipart upload via multer → `dms-storage.uploadFile()`
- `GET /entities/:id/documents/:did/download` — streams from storage
- `DELETE /entities/:id/documents/:did` — soft delete

### Frontend
- Hidden `<input type="file">` triggered by button click
- `FormData` with `file` + `name` fields
- Card grid showing file type icon + name + size + action buttons (view, delete)

### Storage Layer (`dms-storage.ts`)
- Abstraction over Local FS and Google Drive
- Auto-creates GDrive folders: `Shared/{EntityType}/{entityId}/`
- `uploadFile(file, folderHint)` — hint like `entity:{id}`
- `downloadFileWithFallback(storagePath, legacyDir)` — handles `gdrive:xxx` and local paths

---

## 9. WebSocket Notifications

### Backend (`websocket.ts`)
- `initWebSocket(httpServer)` — creates `WebSocketServer` on `/ws`
- Auth: `?token=jwt` query param, verified via jose JWKS
- Connection map: `Map<userId, Set<WebSocket>>`
- `pushToUser(userId, notification)` — sends notification + unread count
- `pushUnreadCount(userId)` — after mark-read
- Ping keepalive every 45s

### Frontend (`websocket.service.ts`)
- Singleton service, `providedIn: 'root'`
- `connect()` — opens WS with access token, auto-reconnect with exponential backoff
- `unreadCount` signal — updated in real-time
- `onNotification(callback)` — register for new notification events

### Integration
- `notify()` service creates DB record + calls `pushToUser()`
- Shell component binds `unreadCount` from WebSocket service
- No polling — fully real-time

---

## 10. Key Rules

1. **appendTo="body"** on ALL `p-select`, `p-multiSelect` inside `p-dialog` — prevents dropdown clipping
2. **No blue links in tables** — clickable columns use default text color, not `text-blue-600`
3. **Dates**: use `toLocaleDateString()` for display, never `toISOString().slice(0,10)` (timezone bugs)
4. **Money**: integers in paise, display with `₹` symbol, divide by 100 for rupees
5. **Soft delete** everywhere — `deletedAt` field, filter `WHERE deleted_at IS NULL`
6. **Standalone components** only — no NgModules
7. **Reactive Forms** with typed `FormGroup` — no template-driven forms
8. **Every route handler** uses `asyncHandler` wrapper for async error forwarding
9. **ULID IDs** generated in app code (`newId()`), not auto-increment
10. **Conventional Commits**: `feat(module):`, `fix(module):`, `chore:`, `refactor:`
