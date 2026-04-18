import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { env } from '../config/env.js';

const ALGO = 'aes-256-gcm';

/** Derive a 32-byte key from the env secret (pad/truncate to 32) */
function getKey(): Buffer {
  const secret = env.ENCRYPTION_KEY ?? 'govprojects-default-key-change-me!';
  const buf = Buffer.alloc(32);
  Buffer.from(secret, 'utf8').copy(buf);
  return buf;
}

export function encrypt(plaintext: string): { encrypted: string; iv: string; tag: string } {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return { encrypted, iv: iv.toString('hex'), tag };
}

export function decrypt(encrypted: string, ivHex: string, tagHex: string): string {
  const key = getKey();
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
