import 'server-only';

import { ok, type Result } from 'neverthrow';
import type { EmailSenderPort } from '@/core/email/ports/email-sender.port';
import type { EmailMessage, EmailSendResult } from '@/core/email/types/email';
import type { AppError } from '@/core/errors';
import { log } from '@/shared/logger';

const PROVIDER = 'none';

// Returns ok so callers treat a deliberately disabled provider as a no-op
// rather than a delivery failure.
async function send(
  message: EmailMessage,
): Promise<Result<EmailSendResult, AppError>> {
  log.warn('email.send skipped', {
    provider: PROVIDER,
    to: message.to,
    subject: message.subject,
  });
  return ok({ id: `noop:${crypto.randomUUID()}` });
}

export const noopEmailAdapter: EmailSenderPort = { send };
