# libs/shared-types

Zod schemas and their inferred TypeScript types, shared between `apps/api`, `apps/web` and `apps/mobile`.

## Why

- Single source of truth for request / response shapes
- Automatic OpenAPI generation via `zod-to-openapi`
- Front-end gets compile-time safety on every API call

## Structure

```
libs/shared-types/
├── src/
│   ├── common/
│   │   ├── id.ts                     # Ulid brand
│   │   ├── money.ts                  # Paise helpers
│   │   ├── pagination.ts
│   │   └── error.ts                  # Error envelope
│   ├── organization/
│   │   ├── business-unit.ts
│   │   ├── company.ts
│   │   └── ...
│   ├── sales/
│   ├── execution/
│   ├── expense/
│   └── procurement/
├── package.json
└── tsconfig.json
```

## Example

```typescript
// libs/shared-types/src/organization/business-unit.ts
import { z } from 'zod';
import { UlidSchema } from '../common/id';

export const CreateBusinessUnitInput = z.object({
  name: z.string().min(2).max(128),
  costCentreCode: z.string().regex(/^CC-[A-Z]{2,4}-\d{3,}$/),
  buHeadUserId: UlidSchema,
  description: z.string().optional(),
});

export type CreateBusinessUnitInput = z.infer<typeof CreateBusinessUnitInput>;

export const BusinessUnit = z.object({
  id: UlidSchema,
  name: z.string(),
  costCentreCode: z.string(),
  buHeadUserId: UlidSchema,
  description: z.string().nullable(),
  status: z.enum(['ACTIVE', 'ARCHIVED']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type BusinessUnit = z.infer<typeof BusinessUnit>;
```

## Rules

- Every API input and output has a Zod schema here
- Schemas are the public contract; changes require discussion
- No business logic — only shapes and validation rules
