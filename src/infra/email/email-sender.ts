import 'server-only';

import type { EmailSenderPort } from '@/core/email/ports/email-sender.port';
import { resendEmailAdapter } from '@/infra/external-apis/resend/resend-email-adapter';
import { smtpEmailAdapter } from '@/infra/external-apis/smtp/smtp-email-adapter';
import { env } from '@/shared/env';
import { noopEmailAdapter } from './noop-email-adapter';

export function emailSender(): EmailSenderPort {
  switch (env().EMAIL_PROVIDER) {
    case 'resend':
      return resendEmailAdapter;
    case 'none':
      return noopEmailAdapter;
    default:
      return smtpEmailAdapter;
  }
}
