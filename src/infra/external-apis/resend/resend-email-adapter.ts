import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import * as v from 'valibot';
import type { EmailSenderPort } from '@/core/email/ports/email-sender.port';
import type { EmailMessage, EmailSendResult } from '@/core/email/types/email';
import { type AppError, externalApi } from '@/core/errors';
import { env } from '@/shared/env';
import { log } from '@/shared/logger';
import { resendClient } from './client';
import { ResendSendResponseSchema } from './schemas';

const PROVIDER = 'resend';

async function send(
  message: EmailMessage,
): Promise<Result<EmailSendResult, AppError>> {
  log.info('email.send start', {
    to: message.to,
    subject: message.subject,
  });
  const fromEmail = env().RESEND_FROM_EMAIL;
  if (!fromEmail) {
    return err(externalApi(PROVIDER, 'RESEND_FROM_EMAIL not configured'));
  }
  try {
    const { data, error } = await resendClient().emails.send({
      from: fromEmail,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });

    if (error) {
      log.error('email.send failure', new Error(error.message), {
        to: message.to,
        name: error.name,
      });
      return err(externalApi(PROVIDER, error.message));
    }

    const parsed = v.safeParse(ResendSendResponseSchema, data);
    if (!parsed.success) {
      return err(externalApi(PROVIDER, 'Unexpected Resend response shape'));
    }

    log.info('email.send success', {
      to: message.to,
      messageId: parsed.output.id,
    });
    return ok({ id: parsed.output.id });
  } catch (e) {
    log.error('email.send exception', e, { to: message.to });
    return err(externalApi(PROVIDER, 'Failed to send email'));
  }
}

export const resendEmailAdapter: EmailSenderPort = { send };
