// Loads environment variables from the monorepo root .env (preferred) or
// apps/api/.env. Imported first by server.ts so env vars are populated
// before any other module reads them.

import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const rootEnv = resolve(__dirname, '../../../.env');
const localEnv = resolve(__dirname, '../.env');
loadDotenv({ path: existsSync(rootEnv) ? rootEnv : localEnv });
