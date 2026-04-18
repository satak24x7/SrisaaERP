# apps/api

Node.js 20 + Express 4 + TypeScript (strict) API.

## Responsibilities

- Implements all 5 business modules (organization, sales, execution, expense, procurement)
- Exposes REST under `/api/v1`
- Validates inputs with Zod
- Persists via Prisma to MySQL 8
- Emits events via RabbitMQ (outbox pattern)
- Publishes OpenAPI spec at `/api/v1/docs`

## Structure (create on first feature)

```
apps/api/
├── src/
│   ├── app.ts                # Express app factory
│   ├── server.ts             # HTTP entry point
│   ├── config/               # loaded env, typed with Zod
│   ├── middleware/
│   │   ├── correlation-id.ts
│   │   ├── auth.ts           # Keycloak JWT verification
│   │   ├── validate.ts       # Zod wrapper
│   │   ├── error-handler.ts
│   │   └── audit.ts
│   ├── modules/
│   │   ├── organization/
│   │   │   ├── routes.ts
│   │   │   ├── service.ts
│   │   │   ├── repository.ts
│   │   │   ├── schema.ts     # Zod → inferred types
│   │   │   └── types.ts
│   │   ├── sales/
│   │   ├── execution/
│   │   ├── expense/
│   │   └── procurement/
│   ├── jobs/                 # BullMQ processors
│   ├── events/               # RabbitMQ publishers / consumers
│   └── lib/                  # small shared utils
├── test/                     # integration tests (supertest)
├── package.json
├── tsconfig.json
└── jest.config.ts
```

See `docs/architecture/overview.md` and `docs/api/conventions.md`.
