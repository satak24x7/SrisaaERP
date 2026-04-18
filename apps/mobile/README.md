# apps/mobile

Ionic 7 + Capacitor + Angular. Shares `libs/shared-types` and selected UI with `apps/web`.

## Scope

Not a full replica of the web app. Mobile is for **field roles**:

- Task Owner: update task status, log effort
- Claimant: submit expense sheet, attach bill via camera
- Project Team: raise Material Request
- PM / BU Head: approve expense sheets and MRs

## Structure (create on first feature)

```
apps/mobile/
├── src/
│   ├── app/
│   │   ├── core/
│   │   ├── features/
│   │   │   ├── tasks/
│   │   │   ├── expenses/
│   │   │   ├── material-requests/
│   │   │   └── approvals/
│   │   ├── app.component.ts
│   │   ├── app.routes.ts
│   │   └── main.ts
│   ├── assets/
│   └── theme/
├── capacitor.config.ts
├── ionic.config.json
└── package.json
```

## Initialise

```bash
cd apps/mobile
pnpm dlx @ionic/cli@7 start . govprojects-mobile blank --type=angular-standalone
pnpm add @capacitor/camera @capacitor/preferences @capacitor/filesystem
pnpm cap add ios
pnpm cap add android
```

## Offline behaviour

- Outbox queue (in SQLite via @capacitor-community/sqlite) for submissions made without network
- On reconnect, queued actions replay with idempotency keys
- Read cache survives 7 days then refreshes
