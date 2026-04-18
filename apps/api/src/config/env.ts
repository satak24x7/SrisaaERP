import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  API_PUBLIC_URL: z.string().url(),

  CORS_ORIGINS: z.string().default('http://localhost:4200'),

  DATABASE_URL: z.string().url(),

  REDIS_URL: z.string().url(),

  JWT_ISSUER: z.string().url(),
  JWT_AUDIENCE: z.string(),

  DEFAULT_CURRENCY: z.string().default('INR'),
  DEFAULT_TIMEZONE: z.string().default('Asia/Kolkata'),

  ENCRYPTION_KEY: z.string().default('govprojects-default-key-change-me!'),

  KEYCLOAK_ADMIN_USER: z.string().default('admin'),
  KEYCLOAK_ADMIN_PASSWORD: z.string().default('admin'),
  KEYCLOAK_ADMIN_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env: Env = parsed.data;
