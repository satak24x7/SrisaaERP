# apps/web

Angular 17 (standalone components) + Tailwind CSS + PrimeNG.

## Responsibilities

- Single-page app for Compliance, BD, Bid Managers, BU Heads, PMs, Finance and Leadership
- Feature-module-per-business-module, lazy-loaded
- Keycloak OIDC auth via `angular-auth-oidc-client`
- NgRx for shared/cross-feature state; Signals for local component state
- Reactive typed forms
- Consumes API client from `libs/api-client`

## Structure (create on first feature)

```
apps/web/
├── src/
│   ├── app/
│   │   ├── app.component.ts           # root shell
│   │   ├── app.routes.ts              # lazy routes per module
│   │   ├── core/                      # singleton services (auth, http interceptors)
│   │   ├── shared/                    # pipes, directives, layout
│   │   └── features/
│   │       ├── organization/
│   │       ├── sales/
│   │       ├── execution/
│   │       ├── expense/
│   │       └── procurement/
│   ├── environments/
│   ├── styles.css                     # Tailwind entry
│   └── main.ts                        # bootstrapApplication
├── angular.json
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

## Initialise

```bash
cd apps/web
pnpm dlx @angular/cli@17 new . --standalone --style=css --routing --skip-git
pnpm add -D tailwindcss postcss autoprefixer
pnpm add primeng primeicons
pnpm add @ngrx/store @ngrx/effects @ngrx/store-devtools
pnpm add angular-auth-oidc-client
```

See `CLAUDE.md` "Coding conventions" for Angular rules.
