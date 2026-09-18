import 'server-only';

import { Resend } from 'resend';
import { env } from '@/shared/env';

let cached: Resend | null = null;

export function resendClient(): Resend {
  if (cached) return cached;
  const apiKey = env().RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('Resend client requested but RESEND_API_KEY not set');
  }
  cached = new Resend(apiKey);
  return cached;
}
