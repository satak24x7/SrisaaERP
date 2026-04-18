import { PrismaClient } from '@prisma/client';
import { ulid } from 'ulid';

// Global to prevent multiple clients in dev hot-reload
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * Generate a ULID to use as a primary key.
 * Use this in app code; do not rely on MySQL-side ID generation.
 */
export const newId = (): string => ulid();
