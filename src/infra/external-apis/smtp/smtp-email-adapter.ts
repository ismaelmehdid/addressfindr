import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import type { EmailSenderPort } from '@/core/email/ports/email-sender.port';
import type { EmailMessage, EmailSendResult } from '@/core/email/types/email';
import { type AppError, externalApi } from '@/core/errors';
import { env } from '@/shared/env';
import { log } from '@/shared/logger';
import { smtpTransporter } from './client';

const PROVIDER = 'smtp';

function buildFrom(): string {
  const e = env();
  if (!e.SMTP_FROM_EMAIL) {
    throw new Error('SMTP_FROM_EMAIL not configured');
  }
  return e.SMTP_FROM_NAME
    ? `"${e.SMTP_FROM_NAME}" <${e.SMTP_FROM_EMAIL}>`
    : e.SMTP_FROM_EMAIL;
}

async function send(
  message: EmailMessage,
): Promise<Result<EmailSendResult, AppError>> {
  log.info('email.send start', {
    provider: PROVIDER,
    to: message.to,
    subject: message.subject,
  });
  try {
    const info = await smtpTransporter().sendMail({
      from: buildFrom(),
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    if (!info.messageId) {
      return err(externalApi(PROVIDER, 'SMTP returned no messageId'));
    }
    log.info('email.send success', {
      provider: PROVIDER,
      to: message.to,
      messageId: info.messageId,
    });
    return ok({ id: info.messageId });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown SMTP error';
    log.error('email.send failure', e, {
      provider: PROVIDER,
    });
    return err(externalApi(PROVIDER, message));
  }
}

export const smtpEmailAdapter: EmailSenderPort = { send };
