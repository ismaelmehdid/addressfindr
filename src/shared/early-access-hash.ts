import { createHash } from 'node:crypto';
import { env } from './env';

export function hashEarlyAccessCode(code: string): string {
  const normalized = code.trim();
  if (!normalized) throw new Error('Empty early-access code');
  return createHash('sha256')
    .update(`${normalized}:${env().EARLY_ACCESS_PEPPER}`)
    .digest('hex');
}
