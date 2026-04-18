import Redis from 'ioredis';
import { env } from '../config/env.js';

const globalForRedis = globalThis as unknown as { redis?: Redis };

export const redis: Redis =
  globalForRedis.redis ??
  new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
  });

if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redis;
